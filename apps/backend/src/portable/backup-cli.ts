import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { validateManifest } from './backup-format';
import {
  produceBackup,
  type BackupDocument,
  type BackupProducerDependencies,
  type ProducedBackup,
} from './backup-producer';

export interface ProcessRequest {
  command: 'psql' | 'pg_dump' | 'tar';
  args: string[];
  env: NodeJS.ProcessEnv;
  stdin?: Buffer;
  timeoutMs: number;
}
export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}
export type ProcessRunner = (request: ProcessRequest) => Promise<ProcessResult>;

type ProcessFailureKind = 'spawn' | 'stdin' | 'timeout' | 'output-limit';
const PROCESS_FAILURE_MESSAGES: Record<ProcessFailureKind, string> = {
  spawn: 'process spawn failure',
  stdin: 'process stdin failure',
  timeout: 'process timeout',
  'output-limit': 'process output limit exceeded',
};
class ProcessFailure extends Error {
  constructor(public readonly kind: ProcessFailureKind) {
    super(PROCESS_FAILURE_MESSAGES[kind]);
  }
}

class CliError extends Error {}
function fail(operation: string, kind: string): never {
  throw new CliError(`${operation}: ${kind}`);
}

/** Drain both pipes, bound captured output, and settle only after close and stdin completion. */
export const runProcess: ProcessRunner = (request) =>
  new Promise((resolve, reject) => {
    const child = spawn(request.command, request.args, {
      env: request.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let bytes = 0;
    let failure: ProcessFailureKind | undefined;
    let inputFinished = false;
    const stop = (kind: ProcessFailureKind) => {
      failure ??= kind;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => stop('timeout'), request.timeoutMs);
    // Decode across chunk boundaries, including non-ASCII Document paths.
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 64 * 1024 * 1024) stop('output-limit');
      else stdout += chunk;
    });
    child.stderr.resume(); // Never retain potentially sensitive diagnostics.
    child.on('error', () => stop('spawn'));
    child.stdin.on('error', () => stop('stdin'));
    child.stdin.end(request.stdin ?? Buffer.alloc(0), () => {
      inputFinished = true;
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      if (failure || !inputFinished)
        reject(new ProcessFailure(failure ?? 'stdin'));
      else resolve({ stdout, stderr: '', exitCode });
    });
  });

export function parseArguments(args: readonly string[]): {
  uploadsRoot: string;
  destination: string;
} {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (
      !['--uploads-root', '--destination'].includes(key) ||
      values.has(key) ||
      !value?.trim() ||
      value.startsWith('--') ||
      value.includes('\0')
    )
      fail('arguments', 'invalid options');
    values.set(key, value);
  }
  const uploadsRoot = values.get('--uploads-root');
  const destination = values.get('--destination');
  if (!uploadsRoot || !destination) fail('arguments', 'missing options');
  return { uploadsRoot, destination };
}

export function connectionEnvironment(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {
    PATH: env.PATH,
    LANG: 'C.UTF-8',
    PGCONNECT_TIMEOUT: '5',
    PGCLIENTENCODING: 'UTF8',
  };
  for (const key of [
    'PGHOST',
    'PGPORT',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
  ]) {
    const value = env[key];
    if (!value || value.includes('\0'))
      fail('environment', 'missing or invalid PG variable');
    result[key] = value;
  }
  const port = result.PGPORT!;
  if (!/^[0-9]+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    fail('environment', 'invalid PGPORT');
  // libpq treats a dbname containing '=' or a URI as a connection string.
  if (
    /[=]/.test(result.PGDATABASE!) ||
    /^postgres(?:ql)?:\/\//.test(result.PGDATABASE!)
  )
    fail('environment', 'connection strings are not supported');
  return result;
}

export const SQL = {
  ready: 'SELECT 1;',
  version: "SELECT current_setting('server_version_num');",
  tables: `SELECT COALESCE(json_agg(table_name ORDER BY table_name), '[]'::json) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name IN ('User', 'Session', 'Company', 'JobOffer', 'Application', 'Document', 'ApplicationEvent', '_prisma_migrations');`,
  columns: `SELECT COALESCE(json_agg(c ORDER BY table_name, column_name), '[]'::json) FROM (SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'Document' AND column_name IN ('id', 'path', 'size')) OR (table_name = '_prisma_migrations' AND column_name IN ('migration_name', 'checksum', 'finished_at', 'rolled_back_at')))) c;`,
  migrations: `SELECT COALESCE(json_agg(m ORDER BY name), '[]'::json) FROM (SELECT migration_name AS name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM public._prisma_migrations) m;`,
  documents: `SELECT COALESCE(json_agg(d ORDER BY id), '[]'::json) FROM (SELECT id, path, size FROM public."Document") d;`,
} as const;

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((k) => Object.hasOwn(value, k))
  )
    fail('SQL', 'incompatible row');
  return value as Record<string, unknown>;
}
function rows(text: string): unknown[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail('SQL', 'invalid JSON');
  }
  if (!Array.isArray(value)) fail('SQL', 'expected array');
  return value;
}

export function createAdapters(
  env: NodeJS.ProcessEnv,
  runner: ProcessRunner = runProcess,
) {
  async function execute(
    command: ProcessRequest['command'],
    args: string[],
    stdin?: Buffer,
    timeoutMs = 3_600_000,
  ): Promise<string> {
    let result: ProcessResult;
    try {
      result = await runner({
        command,
        args,
        env: command === 'tar' ? { PATH: env.PATH, LANG: 'C.UTF-8' } : env,
        stdin,
        timeoutMs,
      });
    } catch (error) {
      fail(
        command,
        error instanceof ProcessFailure
          ? PROCESS_FAILURE_MESSAGES[error.kind]
          : 'process failure',
      );
    }
    if (result.exitCode !== 0)
      fail(command, `exit ${result.exitCode ?? 'signal'}`);
    return result.stdout;
  }
  const sql = (query: string) =>
    execute(
      'psql',
      [
        '-X',
        '--no-password',
        '--no-align',
        '--tuples-only',
        '--set=ON_ERROR_STOP=1',
        '--command',
        query,
      ],
      undefined,
      10_000,
    );
  const dependencies: BackupProducerDependencies = {
    async readMetadata() {
      const raw = (await sql(SQL.version)).trim();
      if (!/^17[0-9]{4}$/.test(raw))
        fail('server version', 'expected PostgreSQL 17');
      const serverVersion = `17.${Number(raw) % 10000}`;
      const dumpRaw = (
        await execute('pg_dump', ['--version'], undefined, 10_000)
      ).trim();
      const match =
        /^pg_dump \(PostgreSQL\) (17\.[0-9]+)(?: \([^\r\n]*\))?$/.exec(dumpRaw);
      if (!match) fail('pg_dump version', 'expected PostgreSQL 17');
      const tables = rows(await sql(SQL.tables));
      const expected = [
        'User',
        'Session',
        'Company',
        'JobOffer',
        'Application',
        'Document',
        'ApplicationEvent',
        '_prisma_migrations',
      ];
      if (
        tables.length !== expected.length ||
        !expected.every((t) => tables.includes(t))
      )
        fail('schema', 'missing tables');
      const columns = rows(await sql(SQL.columns)).map((v) =>
        record(v, ['table_name', 'column_name', 'data_type']),
      );
      const required: [string, string, string[]][] = [
        ['Document', 'id', ['integer']],
        ['Document', 'path', ['text']],
        ['Document', 'size', ['integer']],
        ['_prisma_migrations', 'migration_name', ['character varying']],
        ['_prisma_migrations', 'checksum', ['character varying']],
        ['_prisma_migrations', 'finished_at', ['timestamp with time zone']],
        ['_prisma_migrations', 'rolled_back_at', ['timestamp with time zone']],
      ];
      if (
        columns.length !== required.length ||
        !required.every(([table, column, types]) =>
          columns.some(
            (c) =>
              c.table_name === table &&
              c.column_name === column &&
              typeof c.data_type === 'string' &&
              types.includes(c.data_type),
          ),
        )
      )
        fail('schema', 'incompatible columns');
      const migrations: { name: string; checksum: string }[] = [];
      for (const value of rows(await sql(SQL.migrations))) {
        const row = record(value, [
          'name',
          'checksum',
          'finished',
          'rolled_back',
        ]);
        if (
          typeof row.finished !== 'boolean' ||
          typeof row.rolled_back !== 'boolean' ||
          typeof row.name !== 'string' ||
          typeof row.checksum !== 'string' ||
          (row.finished && row.rolled_back)
        )
          fail('migrations', 'incompatible state');
        if (!row.finished && !row.rolled_back)
          fail('migrations', 'unfinished migration');
        if (!row.rolled_back)
          migrations.push({ name: row.name, checksum: row.checksum });
      }
      // Reuse the v1 authority for migration names, checksums and uniqueness.
      try {
        validateManifest({
          formatVersion: 1,
          backupId: '00000000-0000-0000-0000-000000000000',
          createdAt: '2000-01-01T00:00:00.000Z',
          postgresql: { serverVersion, pgDumpVersion: match[1] },
          migrations,
          database: { name: 'database.dump', size: 1, sha256: '0'.repeat(64) },
          uploads: { name: 'uploads.tar', size: 1, sha256: '0'.repeat(64) },
          counts: { documents: 0, files: 0 },
          uploadsPathPrefix: 'uploads/',
        });
      } catch {
        fail('metadata', 'incompatible with format v1');
      }
      return { serverVersion, pgDumpVersion: match[1], migrations };
    },
    async readDocuments(): Promise<BackupDocument[]> {
      return rows(await sql(SQL.documents)).map((value) => {
        const row = record(value, ['id', 'path', 'size']);
        if (
          typeof row.id !== 'number' ||
          !Number.isSafeInteger(row.id) ||
          typeof row.path !== 'string' ||
          typeof row.size !== 'number' ||
          !Number.isSafeInteger(row.size) ||
          row.size < 0
        )
          fail('documents', 'incompatible row');
        return { id: row.id, path: row.path, size: row.size };
      });
    },
    async produceDump(destination) {
      await execute('pg_dump', [
        '--no-password',
        '--format=custom',
        '--no-owner',
        '--no-acl',
        `--file=${destination}`,
      ]);
    },
    async produceArchive({ uploadsRoot, files, destination }) {
      await execute(
        'tar',
        [
          '--create',
          `--file=${destination}`,
          `--directory=${uploadsRoot}`,
          '--null',
          '--verbatim-files-from',
          '--no-recursion',
          '--files-from=-',
        ],
        Buffer.from(files.map((file) => `${file}\0`).join(''), 'utf8'),
      );
    },
  };
  return {
    dependencies,
    async ready(wait: (ms: number) => Promise<unknown> = delay) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if ((await sql(SQL.ready)).trim() === '1') return;
        } catch {
          /* bounded retry */
        }
        if (attempt < 2) await wait(250);
      }
      fail('connection', 'SQL readiness failed after 3 attempts');
    },
  };
}

export interface CliOutcome {
  code: 0 | 1 | 2 | 3;
  result:
    | {
        status: 'published';
        backupName: string;
        extraFiles: number;
        cleanupWarning: boolean;
      }
    | { status: 'failed'; operation: 'prerequisites' | 'production' };
  diagnostic?: string;
}
export function publishedOutcome(backup: ProducedBackup): CliOutcome {
  const backupName = basename(backup.directory);
  // A violated post-publication invariant must never become a pre-publication failure.
  if (
    !/^jobtracker-backup-[a-zA-Z0-9-]+$/.test(backupName) ||
    /[\r\n]/.test(backupName)
  )
    throw new Error(
      'Published backup has an invalid name; publication state requires inspection',
    );
  const cleanupWarning = backup.cleanupError !== undefined;
  return {
    code: cleanupWarning ? 3 : 0,
    result: {
      status: 'published',
      backupName,
      extraFiles: backup.extraFiles,
      cleanupWarning,
    },
  };
}
export async function runCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  options: {
    runner?: ProcessRunner;
    wait?: (ms: number) => Promise<unknown>;
  } = {},
): Promise<CliOutcome> {
  let input: ReturnType<typeof parseArguments>;
  let adapters: ReturnType<typeof createAdapters>;
  try {
    input = parseArguments(args);
    adapters = createAdapters(connectionEnvironment(env), options.runner);
    await adapters.ready(options.wait);
    // Resolve DB prerequisites before any staging filesystem writes.
    const metadata = await adapters.dependencies.readMetadata();
    adapters.dependencies.readMetadata = () => Promise.resolve(metadata);
  } catch (error) {
    return {
      code: 2,
      result: { status: 'failed', operation: 'prerequisites' },
      diagnostic:
        error instanceof CliError ? error.message : 'prerequisites: failed',
    };
  }
  let backup: ProducedBackup;
  try {
    backup = await produceBackup(input, adapters.dependencies);
  } catch (error) {
    return {
      code: 1,
      result: { status: 'failed', operation: 'production' },
      diagnostic:
        error instanceof CliError ? error.message : 'production: failed',
    };
  }
  return publishedOutcome(backup);
}

if (require.main === module) {
  void runCli(process.argv.slice(2), process.env)
    .then((outcome) => {
      if (outcome.diagnostic) process.stderr.write(`${outcome.diagnostic}\n`);
      process.exitCode = outcome.code;
      process.stdout.write(`${JSON.stringify(outcome.result)}\n`);
    })
    .catch(() => {
      process.stderr.write(
        'CLI interrupted: publication state unknown; inspect destination\n',
      );
      process.exitCode = 1;
    });
}
