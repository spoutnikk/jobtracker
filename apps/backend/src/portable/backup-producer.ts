import { createHash, randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  type BackupFile,
  type BackupManifestV1,
  validateBackup,
  validateManifest,
} from './backup-format';

export interface BackupDocument {
  id: number;
  path: string;
  size: number;
}

export interface BackupSourceMetadata {
  serverVersion: string;
  pgDumpVersion: string;
  migrations: BackupManifestV1['migrations'];
}

export interface BackupProducerDependencies {
  readMetadata(): Promise<BackupSourceMetadata>;
  readDocuments(): Promise<readonly BackupDocument[]>;
  produceDump(destination: string): Promise<void>;
  /** Must archive exactly these relative files, including an empty list, and close the output before returning. */
  produceArchive(input: {
    uploadsRoot: string;
    files: readonly string[];
    destination: string;
  }): Promise<void>;
  now?: () => Date;
  uuid?: () => string;
}

export type BackupProducerCode =
  | 'INVALID_IDENTITY'
  | 'INVALID_SOURCE'
  | 'UNSAFE_PATH'
  | 'UNSUPPORTED_FILE'
  | 'MISSING_DOCUMENT'
  | 'DOCUMENT_SIZE_MISMATCH'
  | 'MISSING_ARTIFACT'
  | 'ARTIFACT_CHANGED'
  | 'COLLISION';

export class BackupProducerError extends Error {
  constructor(
    public readonly code: BackupProducerCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackupProducerError';
  }
}

export interface ProducedBackup {
  directory: string;
  manifest: BackupManifestV1;
  extraFiles: number;
  /** Publication already succeeded; failure to remove the empty staging parent does not invalidate it. */
  cleanupError?: unknown;
}

function fail(code: BackupProducerCode, message: string): never {
  throw new BackupProducerError(code, message);
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

async function assertAbsent(path: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error: unknown) {
    if (hasCode(error, 'ENOENT')) return;
    throw error;
  }
  fail('COLLISION', 'Backup name is already reserved or published');
}

// Reject ambiguous cross-platform names rather than normalizing untrusted input.
function components(path: string): string[] {
  const parts = path.split('/');
  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        /[\\:<>"|?*]/.test(part) ||
        [...part].some((character) => character.charCodeAt(0) < 32) ||
        /[ .]$/.test(part) ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
    )
  ) {
    fail('UNSAFE_PATH', 'Upload path is not a safe relative portable path');
  }
  return parts;
}

function inside(root: string, parts: string[]): string {
  const path = resolve(root, ...parts);
  const remainder = relative(root, path);
  if (
    !remainder ||
    isAbsolute(remainder) ||
    remainder === '..' ||
    remainder.startsWith(`..${sep}`)
  ) {
    fail('UNSAFE_PATH', 'Upload path escapes its source directory');
  }
  return path;
}

/** Check each existing directory component, including the supplied root, without following symlinks. */
async function assertDirectory(path: string): Promise<void> {
  const parent = dirname(path);
  if (parent !== path) await assertDirectory(parent);
  if (!(await lstat(path)).isDirectory()) {
    fail('INVALID_SOURCE', 'Expected a directory without symbolic links');
  }
}

/** Check from the filesystem root down, stopping at the first missing component. */
async function assertExistingDestinationAncestors(path: string): Promise<void> {
  const ancestors: string[] = [path];
  let parent = dirname(path);
  while (parent !== path) {
    ancestors.push(parent);
    path = parent;
    parent = dirname(path);
  }
  for (const ancestor of ancestors.reverse()) {
    let stat: Stats;
    try {
      stat = await lstat(ancestor);
    } catch (error: unknown) {
      if (hasCode(error, 'ENOENT')) return;
      throw error;
    }
    if (!stat.isDirectory()) {
      fail(
        'INVALID_SOURCE',
        'Destination ancestors must be directories without symbolic links',
      );
    }
  }
}

async function inventory(root: string): Promise<Map<string, number>> {
  await assertDirectory(root);
  const files = new Map<string, number>();
  const portableNames = new Set<string>();
  async function visit(parts: string[]): Promise<void> {
    const directory = parts.length ? inside(root, parts) : root;
    for (const name of (await readdir(directory)).sort()) {
      components(name);
      const child = [...parts, name];
      const key = child.join('/');
      const portableKey = key.normalize('NFC').toLowerCase();
      if (portableNames.has(portableKey))
        fail(
          'UNSAFE_PATH',
          'Upload names collide on a case-insensitive filesystem',
        );
      portableNames.add(portableKey);
      const stat = await lstat(inside(root, child));
      if (stat.isDirectory()) {
        await visit(child);
      } else if (stat.isFile()) {
        // nlink > 1 reliably identifies multiple directory entries on supported filesystems.
        // Filesystems reporting incomplete link counts cannot provide a stronger guarantee here.
        if (stat.nlink > 1)
          fail('UNSUPPORTED_FILE', 'Hard-linked uploads are not supported');
        files.set(key, stat.size);
      } else {
        fail(
          'UNSUPPORTED_FILE',
          'Uploads contain a symbolic link or special file',
        );
      }
    }
  }
  await visit([]);
  return files;
}

function checkDocuments(
  documents: readonly BackupDocument[],
  files: Map<string, number>,
  root: string,
): number {
  const referenced = new Set<string>();
  for (const document of documents) {
    if (typeof document.path !== 'string')
      fail('UNSAFE_PATH', 'Invalid Document path');
    const parts = components(document.path);
    if (parts.shift() !== 'uploads' || !parts.length)
      fail('UNSAFE_PATH', 'Document path must be beneath uploads/');
    inside(root, parts);
    const key = parts.join('/');
    if (!files.has(key))
      fail(
        'MISSING_DOCUMENT',
        'A referenced Document has no regular upload file',
      );
    if (
      !Number.isSafeInteger(document.size) ||
      document.size < 0 ||
      files.get(key) !== document.size
    ) {
      fail(
        'DOCUMENT_SIZE_MISMATCH',
        'A Document size differs from its upload file',
      );
    }
    referenced.add(key);
  }
  return files.size - referenced.size;
}

async function describeFile(
  directory: string,
  name: string,
): Promise<BackupFile> {
  const path = join(directory, name);
  let stat: Stats;
  try {
    stat = await lstat(path);
  } catch (error: unknown) {
    if (hasCode(error, 'ENOENT'))
      fail('MISSING_ARTIFACT', `${name} was not produced`);
    throw error;
  }
  if (!stat.isFile() || stat.nlink > 1)
    fail('UNSUPPORTED_FILE', `${name} must be a regular unlinked file`);
  const input = await open(path, 'r');
  try {
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of input.createReadStream({ autoClose: false })) {
      const bytes = chunk as Buffer;
      size += bytes.length;
      hash.update(bytes);
    }
    if (size !== stat.size)
      fail('ARTIFACT_CHANGED', `${name} changed during hashing`);
    return { name, size, sha256: hash.digest('hex') };
  } finally {
    await input.close();
  }
}

/**
 * Requires a stable source and trusted adapters that finish all writes before returning.
 * No service/process/database orchestration is performed here.
 * Exclusive staging reserves the name among cooperating producers. Node's directory
 * rename has no portable NOREPLACE flag: the orchestrator must exclude external writes
 * to the destination during publication (in particular creation of an empty final dir).
 */
export async function produceBackup(
  options: { destination: string; uploadsRoot: string },
  dependencies: BackupProducerDependencies,
): Promise<ProducedBackup> {
  const destination = resolve(options.destination);
  const uploadsRoot = resolve(options.uploadsRoot);
  const date = (dependencies.now ?? (() => new Date()))();
  const backupId = (dependencies.uuid ?? randomUUID)();
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 0 ||
    date.getUTCFullYear() > 9999 ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(backupId) ||
    backupId.length !== 36
  ) {
    fail('INVALID_IDENTITY', 'Expected a canonical backup UUID and UTC date');
  }
  const createdAt = date.toISOString();
  const name = `jobtracker-backup-${createdAt.replace(/[-:.]/g, '')}-${backupId}`;
  const finalDirectory = join(destination, name);
  const partial = `${finalDirectory}.partial`;
  const candidate = join(partial, 'candidate');
  // A destination inside uploads would change the source while inventorying it.
  const fromUploads = relative(uploadsRoot, destination);
  if (
    !fromUploads ||
    (!isAbsolute(fromUploads) &&
      fromUploads !== '..' &&
      !fromUploads.startsWith(`..${sep}`))
  ) {
    fail('INVALID_SOURCE', 'Backup destination must be outside uploads');
  }
  await assertDirectory(uploadsRoot);
  await assertExistingDestinationAncestors(destination);
  await mkdir(destination, { recursive: true, mode: 0o700 });
  await assertDirectory(destination);
  await assertAbsent(finalDirectory);
  try {
    await mkdir(partial, { mode: 0o700 });
  } catch (error: unknown) {
    if (hasCode(error, 'EEXIST'))
      fail('COLLISION', 'Backup preparation already exists');
    throw error;
  }
  await mkdir(candidate, { mode: 0o700 });
  const metadata = await dependencies.readMetadata();
  const documents = await dependencies.readDocuments();
  const files = await inventory(uploadsRoot);
  const extraFiles = checkDocuments(documents, files, uploadsRoot);
  const archiveFiles = Object.freeze([...files.keys()].sort());
  await dependencies.produceDump(join(candidate, 'database.dump'));
  await dependencies.produceArchive({
    uploadsRoot,
    files: archiveFiles,
    destination: join(candidate, 'uploads.tar'),
  });
  const database = await describeFile(candidate, 'database.dump');
  const uploads = await describeFile(candidate, 'uploads.tar');
  const manifest: BackupManifestV1 = {
    formatVersion: 1,
    backupId,
    createdAt,
    postgresql: {
      serverVersion: metadata.serverVersion,
      pgDumpVersion: metadata.pgDumpVersion,
    },
    migrations: metadata.migrations,
    database: { ...database, name: 'database.dump' },
    uploads: { ...uploads, name: 'uploads.tar' },
    counts: { documents: documents.length, files: files.size },
    uploadsPathPrefix: 'uploads/',
  };
  validateManifest(manifest);
  await writeFile(
    join(candidate, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  await validateBackup(candidate);
  await assertAbsent(finalDirectory);
  await rename(candidate, finalDirectory);
  const result: ProducedBackup = {
    directory: finalDirectory,
    manifest,
    extraFiles,
  };
  try {
    await rmdir(partial);
  } catch (error: unknown) {
    result.cleanupError = error;
  }
  return result;
}
