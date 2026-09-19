import { lstat as nodeLstat } from 'node:fs/promises';
import { posix } from 'node:path';
import type { InternalMaintenanceContext } from './portable-maintenance';

export type PortableBackupMountsCode =
  'configuration' | 'destination-invalid' | 'filesystem-failure';

const MESSAGES: Record<PortableBackupMountsCode, string> = {
  configuration: 'Invalid Portable backup mount configuration',
  'destination-invalid': 'Portable backup destination is not eligible',
  'filesystem-failure': 'Portable backup destination could not be inspected',
};

export const PORTABLE_UPLOADS_TARGET = '/portable/backup/uploads';
export const PORTABLE_BACKUP_TARGET = '/portable/backup/output';

export class PortableBackupMountsError extends Error {
  constructor(public readonly code: PortableBackupMountsCode) {
    super(MESSAGES[code]);
    this.name = 'PortableBackupMountsError';
  }
}

export interface PortableBackupPathStat {
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export interface PortableBackupMountsFileSystem {
  lstat(path: string): Promise<PortableBackupPathStat>;
}

export interface PortableBackupBindMount {
  readonly type: 'bind';
  readonly source: string;
  readonly destination: string;
  readonly readOnly: boolean;
  readonly bindCreateSource: false;
}

export interface PortableBackupMounts {
  readonly destinationHostPath: string;
  readonly uploads: PortableBackupBindMount;
  readonly backupDestination: PortableBackupBindMount;
  readonly mounts: readonly [PortableBackupBindMount, PortableBackupBindMount];
}

export const nodePortableBackupMountsFileSystem: PortableBackupMountsFileSystem =
  Object.freeze({ lstat: nodeLstat });

function fail(code: PortableBackupMountsCode): never {
  throw new PortableBackupMountsError(code);
}

function missing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { readonly code?: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function components(path: string): readonly string[] {
  if (path === '/') return ['/'];
  const result = ['/'];
  let current = '/';
  for (const part of path.slice(1).split('/')) {
    current = posix.join(current, part);
    result.push(current);
  }
  return result;
}

function contains(parent: string, child: string): boolean {
  const relative = posix.relative(parent, child);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith('../') &&
      !posix.isAbsolute(relative))
  );
}

function canonical(path: string): string {
  const normalized = posix.normalize(path);
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
}

function mount(
  source: string,
  destination: string,
  readOnly: boolean,
): PortableBackupBindMount {
  return Object.freeze({
    type: 'bind',
    source,
    destination,
    readOnly,
    bindCreateSource: false,
  });
}

export async function qualifyPortableBackupMounts(
  context: InternalMaintenanceContext,
  destination: string,
  fileSystem: PortableBackupMountsFileSystem = nodePortableBackupMountsFileSystem,
): Promise<PortableBackupMounts> {
  if (!posix.isAbsolute(destination)) fail('configuration');
  const normalizedDestination = canonical(destination);
  const uploads = context.source.volumeIdentities.uploads.mountpoint;
  if (
    typeof uploads !== 'string' ||
    uploads.length === 0 ||
    /[\0\r\n]/.test(uploads) ||
    !posix.isAbsolute(uploads) ||
    posix.normalize(uploads) !== uploads
  )
    fail('configuration');
  if (
    contains(uploads, normalizedDestination) ||
    contains(normalizedDestination, uploads)
  )
    fail('destination-invalid');

  for (const component of components(normalizedDestination)) {
    let stat: PortableBackupPathStat;
    try {
      stat = await fileSystem.lstat(component);
    } catch (error) {
      fail(missing(error) ? 'destination-invalid' : 'filesystem-failure');
    }
    if (stat.isSymbolicLink() || !stat.isDirectory())
      fail('destination-invalid');
  }

  const uploadsMount = mount(uploads, PORTABLE_UPLOADS_TARGET, true);
  const destinationMount = mount(
    normalizedDestination,
    PORTABLE_BACKUP_TARGET,
    false,
  );
  const mounts = Object.freeze([uploadsMount, destinationMount] as const);
  return Object.freeze({
    destinationHostPath: normalizedDestination,
    uploads: uploadsMount,
    backupDestination: destinationMount,
    mounts,
  });
}
