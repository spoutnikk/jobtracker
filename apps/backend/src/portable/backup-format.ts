import { createHash } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

export interface BackupFile {
  name: string;
  size: number;
  sha256: string;
}

export interface BackupManifestV1 {
  formatVersion: 1;
  backupId: string;
  createdAt: string;
  postgresql: { serverVersion: string; pgDumpVersion: string };
  migrations: { name: string; checksum: string }[];
  database: BackupFile & { name: 'database.dump' };
  uploads: BackupFile & { name: 'uploads.tar' };
  counts: { documents: number; files: number };
  uploadsPathPrefix: 'uploads/';
}

export type BackupValidationCode =
  | 'INCOMPLETE_BACKUP'
  | 'INVALID_PATH'
  | 'MISSING_FILE'
  | 'IO_ERROR'
  | 'INVALID_JSON'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_MANIFEST'
  | 'SIZE_MISMATCH'
  | 'HASH_MISMATCH';

export class BackupValidationError extends Error {
  constructor(
    public readonly code: BackupValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

function fail(code: BackupValidationCode, message: string): never {
  throw new BackupValidationError(code, message);
}

function requireField(condition: boolean, field: string): asserts condition {
  if (!condition) fail('INVALID_MANIFEST', `Invalid manifest field: ${field}`);
}

function object(
  value: unknown,
  keys: string[],
  field: string,
): Record<string, unknown> {
  requireField(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    field,
  );
  const record = value as Record<string, unknown>;
  requireField(
    Object.keys(record).length === keys.length &&
      keys.every((key) => Object.hasOwn(record, key)),
    `${field} (required keys only)`,
  );
  return record;
}

function matches(value: unknown, pattern: RegExp): boolean {
  return typeof value === 'string' && pattern.test(value);
}

function integer(value: unknown, minimum: number): boolean {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
  );
}

const SHA256 = /^[a-f0-9]{64}$/;
const VERSION = /^[1-9]\d*\.\d+(?:\.\d+)?$/;

/** Strict metadata validation; unknown fields are rejected, including configuration secrets. */
export function validateManifest(value: unknown): BackupManifestV1 {
  if (
    typeof value === 'object' &&
    value !== null &&
    'formatVersion' in value &&
    value.formatVersion !== 1
  ) {
    fail('UNSUPPORTED_VERSION', 'Unsupported backup formatVersion; expected 1');
  }
  const manifest = object(
    value,
    [
      'formatVersion',
      'backupId',
      'createdAt',
      'postgresql',
      'migrations',
      'database',
      'uploads',
      'counts',
      'uploadsPathPrefix',
    ],
    'manifest',
  );
  requireField(manifest.formatVersion === 1, 'formatVersion');
  requireField(
    matches(manifest.backupId, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/),
    'backupId',
  );
  requireField(
    matches(
      manifest.createdAt,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    ),
    'createdAt',
  );
  const date = new Date(manifest.createdAt as string);
  requireField(
    Number.isFinite(date.getTime()) &&
      date.toISOString() === manifest.createdAt,
    'createdAt',
  );
  const postgresql = object(
    manifest.postgresql,
    ['serverVersion', 'pgDumpVersion'],
    'postgresql',
  );
  requireField(
    matches(postgresql.serverVersion, VERSION),
    'postgresql.serverVersion',
  );
  requireField(
    matches(postgresql.pgDumpVersion, VERSION),
    'postgresql.pgDumpVersion',
  );
  requireField(
    Array.isArray(manifest.migrations) && manifest.migrations.length > 0,
    'migrations',
  );
  const names = new Set<string>();
  for (const item of manifest.migrations) {
    const migration = object(item, ['name', 'checksum'], 'migration');
    requireField(
      matches(migration.name, /^\d{14}_[a-zA-Z0-9_]+$/),
      'migration.name',
    );
    requireField(matches(migration.checksum, SHA256), 'migration.checksum');
    requireField(
      !names.has(migration.name as string),
      'migration.name (duplicate)',
    );
    names.add(migration.name as string);
  }
  for (const [key, name] of [
    ['database', 'database.dump'],
    ['uploads', 'uploads.tar'],
  ] as const) {
    const file = object(manifest[key], ['name', 'size', 'sha256'], key);
    requireField(file.name === name, `${key}.name`);
    requireField(integer(file.size, 1), `${key}.size`);
    requireField(matches(file.sha256, SHA256), `${key}.sha256`);
  }
  const counts = object(manifest.counts, ['documents', 'files'], 'counts');
  requireField(integer(counts.documents, 0), 'counts.documents');
  requireField(integer(counts.files, 0), 'counts.files');
  requireField(manifest.uploadsPathPrefix === 'uploads/', 'uploadsPathPrefix');
  return manifest as unknown as BackupManifestV1;
}

async function inspectPath(path: string, directory = false): Promise<void> {
  try {
    const stat = await lstat(path);
    if (directory ? !stat.isDirectory() : !stat.isFile()) {
      fail(
        'INVALID_PATH',
        `Expected a regular ${directory ? 'directory' : 'file'}: ${basename(path)}`,
      );
    }
  } catch (error: unknown) {
    if (error instanceof BackupValidationError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    fail(
      code === 'ENOENT' ? 'MISSING_FILE' : 'IO_ERROR',
      `Cannot read ${basename(path)} (${code ?? 'unknown error'})`,
    );
  }
}

/** Read-only integrity check. Does NOT inspect TAR entries or PostgreSQL dump contents. */
export async function validateBackup(
  directory: string,
): Promise<BackupManifestV1> {
  const resolvedDirectory = resolve(directory);
  if (basename(resolvedDirectory).endsWith('.partial')) {
    fail('INCOMPLETE_BACKUP', 'Backup directory is marked .partial');
  }
  await inspectPath(resolvedDirectory, true);
  const manifestPath = join(resolvedDirectory, 'manifest.json');
  await inspectPath(manifestPath);
  try {
    const handle = await open(manifestPath, 'r');
    let content: string;
    try {
      // Bounded read, including if the file grows after inspection.
      const buffer = Buffer.alloc(1024 * 1024 + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(
          buffer,
          length,
          buffer.length - length,
          null,
        );
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      requireField(length <= 1024 * 1024, 'manifest (maximum 1 MiB)');
      content = buffer.subarray(0, length).toString('utf8');
    } finally {
      await handle.close();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      fail('INVALID_JSON', 'manifest.json is not valid JSON');
    }
    const manifest = validateManifest(parsed);
    for (const file of [manifest.database, manifest.uploads]) {
      const path = join(resolvedDirectory, file.name);
      await inspectPath(path);
      const input = await open(path, 'r');
      try {
        if ((await input.stat()).size !== file.size) {
          fail('SIZE_MISMATCH', `${file.name}: size differs from manifest`);
        }
        const hash = createHash('sha256');
        let size = 0;
        for await (const chunk of input.createReadStream({
          autoClose: false,
        })) {
          const bytes = chunk as Buffer;
          size += bytes.length;
          if (size > file.size)
            fail('SIZE_MISMATCH', `${file.name}: file grew during validation`);
          hash.update(bytes);
        }
        if (size !== file.size)
          fail('SIZE_MISMATCH', `${file.name}: size changed during validation`);
        if (hash.digest('hex') !== file.sha256) {
          fail('HASH_MISMATCH', `${file.name}: SHA-256 differs from manifest`);
        }
      } finally {
        await input.close();
      }
    }
    return manifest;
  } catch (error: unknown) {
    if (error instanceof BackupValidationError) throw error;
    fail(
      'IO_ERROR',
      `Cannot read backup files (${(error as NodeJS.ErrnoException).code ?? 'unknown error'})`,
    );
  }
}
