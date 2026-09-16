import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  connectionEnvironment,
  createAdapters,
  parseArguments,
  publishedOutcome,
  runCli,
  runProcess,
  SQL,
  type ProcessRequest,
  type ProcessRunner,
} from './backup-cli';
import { validateBackup } from './backup-format';

const env = {
  PATH: '/usr/bin',
  PGHOST: 'postgres',
  PGPORT: '5432',
  PGDATABASE: 'jobtracker',
  PGUSER: 'jobtracker',
  PGPASSWORD: 'very-secret',
  DATABASE_URL: 'secret-url',
  OTHER_SECRET: 'other',
};
const args = ['--uploads-root', '/uploads', '--destination', '/backups'];
const tables = [
  'User',
  'Session',
  'Company',
  'JobOffer',
  'Application',
  'Document',
  'ApplicationEvent',
  '_prisma_migrations',
];
const columns = [
  ['Document', 'id', 'integer'],
  ['Document', 'path', 'text'],
  ['Document', 'size', 'integer'],
  ['_prisma_migrations', 'migration_name', 'character varying'],
  ['_prisma_migrations', 'checksum', 'character varying'],
  ['_prisma_migrations', 'finished_at', 'timestamp with time zone'],
  ['_prisma_migrations', 'rolled_back_at', 'timestamp with time zone'],
].map(([table_name, column_name, data_type]) => ({
  table_name,
  column_name,
  data_type,
}));
const migration = {
  name: '20260816014000_add_query_indexes',
  checksum: 'a'.repeat(64),
  finished: true,
  rolled_back: false,
};
function fixture(overrides: Record<string, string> = {}) {
  const outputs: Record<string, string> = {
    [SQL.ready]: '1\n',
    [SQL.version]: '170006\n',
    '--version': 'pg_dump (PostgreSQL) 17.6 (Debian 17.6-1.pgdg12+1)\n',
    [SQL.tables]: JSON.stringify(tables),
    [SQL.columns]: JSON.stringify(columns),
    [SQL.migrations]: JSON.stringify([migration]),
    [SQL.documents]: '[]',
    ...overrides,
  };
  const runner = jest.fn<ReturnType<ProcessRunner>, Parameters<ProcessRunner>>(
    (request) =>
      Promise.resolve({
        stdout: outputs[request.args.at(-1)!] ?? '',
        stderr: '',
        exitCode: 0,
      }),
  );
  return {
    runner,
    adapters: createAdapters(connectionEnvironment(env), runner),
  };
}

describe('CLI arguments and connection environment', () => {
  it('accepts valid arguments', () =>
    expect(parseArguments(args)).toEqual({
      uploadsRoot: '/uploads',
      destination: '/backups',
    }));
  it.each([
    ['missing option', args.slice(0, 2)],
    ['unknown option', [...args, '--unknown', 'x']],
    ['duplicate', [...args, '--destination', 'x']],
    ['empty', ['--uploads-root', '', '--destination', 'x']],
    ['missing value', ['--uploads-root', 'x', '--destination']],
  ])('rejects %s', (_name, input) =>
    expect(() => parseArguments(input)).toThrow('arguments'),
  );
  it('keeps PG values and drops unrelated secrets', () => {
    const value = connectionEnvironment(env);
    expect(value.PGPASSWORD).toBe(env.PGPASSWORD);
    expect(value.DATABASE_URL).toBeUndefined();
    expect(value.OTHER_SECRET).toBeUndefined();
  });
  it.each(['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'])(
    'requires %s',
    (key) =>
      expect(() => connectionEnvironment({ ...env, [key]: undefined })).toThrow(
        'environment',
      ),
  );
  it.each(['0', '65536', 'abc', '1.5', '5432\n'])('rejects port %s', (PGPORT) =>
    expect(() => connectionEnvironment({ ...env, PGPORT })).toThrow(),
  );
  it('rejects libpq connection strings in dbname', () =>
    expect(() =>
      connectionEnvironment({ ...env, PGDATABASE: 'password=secret' }),
    ).toThrow());
});
describe('SQL readiness', () => {
  it('connects immediately', async () => {
    const { runner, adapters } = fixture();
    await adapters.ready();
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0][0].timeoutMs).toBe(10000);
  });
  it('retries then succeeds', async () => {
    const { runner, adapters } = fixture();
    runner.mockRejectedValueOnce(new Error('secret'));
    const wait = jest.fn(() => Promise.resolve());
    await adapters.ready(wait);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(250);
  });
  it('bounds failed attempts', async () => {
    const { runner, adapters } = fixture();
    runner.mockRejectedValue(new Error('secret'));
    const wait = jest.fn(() => Promise.resolve());
    await expect(adapters.ready(wait)).rejects.toThrow('3 attempts');
    expect(runner).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });
});
describe('metadata SQL adapters', () => {
  it('accepts PostgreSQL and dump 17, complete schema and compatible columns', async () => {
    const { adapters, runner } = fixture();
    expect(await adapters.dependencies.readMetadata()).toEqual({
      serverVersion: '17.6',
      pgDumpVersion: '17.6',
      migrations: [{ name: migration.name, checksum: migration.checksum }],
    });
    for (const [request] of runner.mock.calls.filter(
      ([r]) => r.command === 'psql',
    ))
      expect(request.args.slice(0, -1)).toEqual([
        '-X',
        '--no-password',
        '--no-align',
        '--tuples-only',
        '--set=ON_ERROR_STOP=1',
        '--command',
      ]);
  });
  it.each(['160006', 'invalid'])('rejects server version %s', async (raw) => {
    const { adapters } = fixture({ [SQL.version]: raw });
    await expect(adapters.dependencies.readMetadata()).rejects.toThrow(
      'server version',
    );
  });
  it.each(['pg_dump (PostgreSQL) 16.6', 'invalid'])(
    'rejects dump version %s',
    async (raw) => {
      const { adapters } = fixture({ '--version': raw });
      await expect(adapters.dependencies.readMetadata()).rejects.toThrow(
        'pg_dump version',
      );
    },
  );
  it('rejects missing table', async () => {
    const { adapters } = fixture({
      [SQL.tables]: JSON.stringify(tables.slice(1)),
    });
    await expect(adapters.dependencies.readMetadata()).rejects.toThrow(
      'schema',
    );
  });
  it('rejects invalid SQL JSON', async () => {
    const { adapters } = fixture({ [SQL.tables]: 'secret-invalid-json' });
    await expect(adapters.dependencies.readMetadata()).rejects.toThrow(
      'invalid JSON',
    );
  });
  it.each([0, 3])('rejects missing required column %i', async (index) => {
    const { adapters } = fixture({
      [SQL.columns]: JSON.stringify(columns.filter((_, i) => i !== index)),
    });
    await expect(adapters.dependencies.readMetadata()).rejects.toThrow(
      'columns',
    );
  });
  it.each([0, 3])('rejects incompatible column %i', async (index) => {
    const { adapters } = fixture({
      [SQL.columns]: JSON.stringify(
        columns.map((c, i) =>
          i === index ? { ...c, data_type: 'boolean' } : c,
        ),
      ),
    });
    await expect(adapters.dependencies.readMetadata()).rejects.toThrow(
      'columns',
    );
  });
  it('excludes rolled back attempts', async () => {
    const { adapters } = fixture({
      [SQL.migrations]: JSON.stringify([
        migration,
        { ...migration, finished: false, rolled_back: true },
      ]),
    });
    expect(
      (await adapters.dependencies.readMetadata()).migrations,
    ).toHaveLength(1);
  });
  it.each([
    ['unfinished', [{ ...migration, finished: false }]],
    ['duplicate', [migration, migration]],
    ['empty name', [{ ...migration, name: '' }]],
    ['bad checksum', [{ ...migration, checksum: 'bad' }]],
    ['ambiguous', [{ ...migration, rolled_back: true }]],
    ['incompatible boolean', [{ ...migration, finished: 'yes' }]],
    ['no applied', []],
  ])('rejects migrations: %s', async (_name, values) => {
    const { adapters } = fixture({ [SQL.migrations]: JSON.stringify(values) });
    await expect(adapters.dependencies.readMetadata()).rejects.toThrow();
  });
});
describe('documents', () => {
  it('passes primitive documents without path validation', async () => {
    const docs = [{ id: 1, path: '../invalid-for-producer', size: 3 }];
    const { adapters } = fixture({ [SQL.documents]: JSON.stringify(docs) });
    expect(await adapters.dependencies.readDocuments()).toEqual(docs);
  });
  it('accepts zero documents', async () =>
    expect(await fixture().adapters.dependencies.readDocuments()).toEqual([]));
  it.each([
    { id: '1', path: 'uploads/a', size: 0 },
    { id: 1, path: null, size: 0 },
    { id: 1, path: 'uploads/a', size: 1.5 },
    { id: 1, path: 'uploads/a', size: Number.MAX_SAFE_INTEGER + 1 },
    { id: 1, path: 'uploads/a' },
    {},
  ])('rejects incompatible row %j', async (row) => {
    const { adapters } = fixture({ [SQL.documents]: JSON.stringify([row]) });
    await expect(adapters.dependencies.readDocuments()).rejects.toThrow(
      'incompatible row',
    );
  });
});
describe('process adapters', () => {
  it('uses exact pg_dump argv and PG environment without argv secrets', async () => {
    const { adapters, runner } = fixture();
    await adapters.dependencies.produceDump('/work/database.dump');
    const request = runner.mock.calls[0][0];
    expect(request.command).toBe('pg_dump');
    expect(request.args).toEqual([
      '--no-password',
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--file=/work/database.dump',
    ]);
    expect(request.env).toEqual(connectionEnvironment(env));
    expect(JSON.stringify(request.args)).not.toContain(env.PGPASSWORD);
  });
  it.each([[], ['with space', 'é漢字', '-option']])(
    'uses exact TAR arguments and NUL input: %j',
    async (...values) => {
      const files = values as string[];
      const { adapters, runner } = fixture();
      await adapters.dependencies.produceArchive({
        uploadsRoot: '/uploads',
        destination: '/work/uploads.tar',
        files,
      });
      const request = runner.mock.calls[0][0];
      expect(request.args).toEqual([
        '--create',
        '--file=/work/uploads.tar',
        '--directory=/uploads',
        '--null',
        '--verbatim-files-from',
        '--no-recursion',
        '--files-from=-',
      ]);
      expect(request.stdin).toEqual(
        Buffer.from(files.map((f) => f + '\0').join('')),
      );
      expect(request.env.PGPASSWORD).toBeUndefined();
    },
  );
  it.each(['dump', 'tar'])(
    'rejects nonzero %s and suppresses stderr',
    async (operation) => {
      const { adapters, runner } = fixture();
      runner.mockResolvedValue({
        stdout: '',
        stderr: env.PGPASSWORD,
        exitCode: 4,
      });
      const promise =
        operation === 'dump'
          ? adapters.dependencies.produceDump('/dump')
          : adapters.dependencies.produceArchive({
              uploadsRoot: '/uploads',
              destination: '/tar',
              files: [],
            });
      await expect(promise).rejects.toThrow('exit 4');
    },
  );
  it.each(['spawn', 'stdin', 'timeout'])(
    'sanitizes untyped process rejection %s',
    async (kind) => {
      const { adapters, runner } = fixture();
      runner.mockRejectedValue(new Error(kind + env.PGPASSWORD));
      await expect(
        adapters.dependencies.produceArchive({
          uploadsRoot: '/uploads',
          destination: '/tar',
          files: [],
        }),
      ).rejects.toThrow('tar: process failure');
    },
  );
  it('rejects dump spawn failure', async () => {
    const { adapters, runner } = fixture();
    runner.mockRejectedValue(new Error(env.PGPASSWORD));
    await expect(adapters.dependencies.produceDump('/dump')).rejects.toThrow(
      'pg_dump: process failure',
    );
  });
});
describe('orchestration with real producer and fake subprocesses', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'backup-cli-'));
    await fs.mkdir(join(root, 'uploads'));
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });
  function setup() {
    const { runner } = fixture();
    const original = runner.getMockImplementation()!;
    runner.mockImplementation(async (request: ProcessRequest) => {
      if (request.args.some((a) => a.startsWith('--file='))) {
        await fs.writeFile(
          request.args.find((a) => a.startsWith('--file='))!.slice(7),
          request.command === 'tar' ? 'fake tar' : 'fake dump',
        );
        return {
          stdout: 'ignored subprocess chatter',
          stderr: env.PGPASSWORD,
          exitCode: 0,
        };
      }
      return original(request);
    });
    return {
      runner,
      input: [
        '--uploads-root',
        join(root, 'uploads'),
        '--destination',
        join(root, 'backups'),
      ],
    };
  }
  it('publishes with code 0, simple relative name and one clean JSON payload', async () => {
    const { runner, input } = setup();
    const outcome = await runCli(input, env, { runner });
    expect(outcome.code).toBe(0);
    expect(outcome.result.status).toBe('published');
    if (outcome.result.status !== 'published')
      throw new Error('expected publication');
    expect(outcome.result.cleanupWarning).toBe(false);
    expect(outcome.result.backupName).toMatch(/^jobtracker-backup-[\w-]+$/);
    expect(
      await validateBackup(join(root, 'backups', outcome.result.backupName)),
    ).toBeDefined();
    const line = JSON.stringify(outcome.result) + '\n';
    expect(line.split('\n')).toHaveLength(2);
    expect(line).not.toContain(root);
    expect(line).not.toContain(env.PGPASSWORD);
    expect(line).not.toContain('chatter');
    expect(outcome.diagnostic).toBeUndefined();
  });
  it('maps arguments to code 2', async () => {
    const { runner } = setup();
    expect((await runCli([], env, { runner })).code).toBe(2);
    expect(runner).not.toHaveBeenCalled();
  });
  it('maps invalid prerequisites to code 2 without creating staging', async () => {
    const { runner, input } = setup();
    runner.mockResolvedValue({
      stdout: '',
      stderr: env.PGPASSWORD,
      exitCode: 1,
    });
    const outcome = await runCli(input, env, {
      runner,
      wait: () => Promise.resolve(),
    });
    expect(outcome.code).toBe(2);
    expect(JSON.stringify(outcome)).not.toContain(env.PGPASSWORD);
    expect(await fs.readdir(root)).toEqual(['uploads']);
  });
  it('maps production failure to code 1 and keeps partial', async () => {
    const { runner, input } = setup();
    const original = runner.getMockImplementation()!;
    runner.mockImplementation((r) =>
      r.command === 'pg_dump' && r.args[0] !== '--version'
        ? Promise.reject(new Error(env.PGPASSWORD))
        : original(r),
    );
    const outcome = await runCli(input, env, { runner });
    expect(outcome.code).toBe(1);
    expect(JSON.stringify(outcome)).not.toContain(env.PGPASSWORD);
    expect(
      (await fs.readdir(join(root, 'backups'))).every((n) =>
        n.endsWith('.partial'),
      ),
    ).toBe(true);
  });
  it('respects producer cleanup warning after actual publication', async () => {
    const { runner, input } = setup();
    jest.spyOn(fs, 'rmdir').mockRejectedValueOnce(new Error(env.PGPASSWORD));
    const outcome = await runCli(input, env, { runner });
    expect(outcome.code).toBe(3);
    expect(outcome.result).toMatchObject({
      status: 'published',
      cleanupWarning: true,
    });
    expect(JSON.stringify(outcome)).not.toContain(env.PGPASSWORD);
  });
  it('does not classify a post-publication invariant failure as no backup', () => {
    expect(() =>
      publishedOutcome({
        directory: '/tmp/..',
        manifest: {} as never,
        extraFiles: 0,
      }),
    ).toThrow('publication state');
  });
});

describe('default process runner with simulated child streams', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  function child() {
    const fake = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: jest.fn(() => true),
    });
    const spawn = jest
      .spyOn(childProcess, 'spawn')
      .mockReturnValue(
        fake as unknown as ReturnType<typeof childProcess.spawn>,
      );
    const request: ProcessRequest = {
      command: 'tar',
      args: ['--create'],
      env: { PATH: '/usr/bin' },
      stdin: Buffer.from('é\0'),
      timeoutMs: 100,
    };
    return { fake, spawn, request };
  }
  it('uses no shell, waits for close, handles split UTF-8 and drains secret stderr', async () => {
    const { fake, spawn, request } = child();
    const promise = runProcess(request);
    await new Promise<void>((resolve) => fake.stdin.once('finish', resolve));
    const encoded = Buffer.from('é');
    fake.stdout.write(encoded.subarray(0, 1));
    fake.stdout.write(encoded.subarray(1));
    fake.stderr.write(env.PGPASSWORD);
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    fake.emit('exit', 0);
    await Promise.resolve();
    expect(settled).toBe(false);
    fake.emit('close', 0);
    expect(await promise).toEqual({ stdout: 'é', stderr: '', exitCode: 0 });
    expect(spawn).toHaveBeenCalledWith('tar', ['--create'], {
      env: request.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    expect(fake.stdin.read() as unknown).toEqual(request.stdin);
  });
  it.each(['error', 'stdin'])(
    'rejects %s without raw diagnostics and waits for close',
    async (kind) => {
      const { fake, request } = child();
      const promise = runProcess(request);
      const assertion = expect(promise).rejects.toThrow(
        kind === 'error' ? 'process spawn failure' : 'process stdin failure',
      );
      (kind === 'error' ? fake : fake.stdin).emit(
        'error',
        new Error(env.PGPASSWORD),
      );
      expect(fake.kill).toHaveBeenCalledWith('SIGKILL');
      fake.emit('close', null);
      await assertion;
    },
  );
  it('terminates timed-out child and waits for close', async () => {
    jest.useFakeTimers();
    const { fake, request } = child();
    const promise = runProcess(request);
    const assertion = expect(promise).rejects.toThrow('process timeout');
    jest.advanceTimersByTime(100);
    expect(fake.kill).toHaveBeenCalledWith('SIGKILL');
    fake.emit('close', null);
    await assertion;
  });
  it.each([
    ['spawn', 'process spawn failure'],
    ['stdin', 'process stdin failure'],
    ['timeout', 'process timeout'],
    ['output-limit', 'process output limit exceeded'],
  ])(
    'preserves %s through the runner and adapter without sensitive diagnostics',
    async (kind, diagnostic) => {
      jest.useFakeTimers();
      const { fake } = child();
      const secret = 'SUPER_SECRET_PASSWORD';
      let captured: unknown;
      const runner: ProcessRunner = async (request) => {
        try {
          return await runProcess(request);
        } catch (error) {
          captured = error;
          throw error;
        }
      };
      const { dependencies } = createAdapters(
        connectionEnvironment(env),
        runner,
      );
      const promise = dependencies.produceArchive({
        uploadsRoot: '/uploads',
        destination: '/tar',
        files: [],
      });
      const assertion = expect(promise).rejects.toThrow(
        new Error(`tar: ${diagnostic}`),
      );
      fake.stderr.write(`${secret} ${env.PGPASSWORD} external stderr`);
      fake.stdout.write(`${secret} external stdout`);
      if (kind === 'spawn' || kind === 'stdin') {
        (kind === 'spawn' ? fake : fake.stdin).emit(
          'error',
          new Error(`${secret} ${env.PGPASSWORD}`),
        );
      } else if (kind === 'timeout') {
        jest.advanceTimersByTime(3_600_000);
      } else {
        const chunk = 'x'.repeat(1024 * 1024);
        for (let i = 0; i < 64; i++) fake.stdout.write(chunk);
      }
      expect(fake.kill).toHaveBeenCalledWith('SIGKILL');
      fake.emit('close', null);
      await assertion;
      expect(captured).toMatchObject({ kind, message: diagnostic });
      const exposed = await promise.catch((error: unknown) => error);
      expect(exposed).toBeInstanceOf(Error);
      const message = (exposed as Error).message;
      expect(message).toBe(`tar: ${diagnostic}`);
      expect(message).not.toContain(secret);
      expect(message).not.toContain(env.PGPASSWORD);
      expect(message).not.toContain('external');
      expect(jest.getTimerCount()).toBe(0);
    },
  );
});
