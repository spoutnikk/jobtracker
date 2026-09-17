import { open, lstat as nodeLstat } from 'node:fs/promises';
import { posix } from 'node:path';

export type PgdataProbeErrorCode = 'probe-failed';

const PGDATA = '/probe/pgdata';
const MOUNTINFO = '/proc/self/mountinfo';
const MAX_MOUNTINFO_BYTES = 4 * 1024 * 1024;
const MAX_PG_VERSION_BYTES = 16;

export class PgdataProbeError extends Error {
  constructor(public readonly code: PgdataProbeErrorCode) {
    super('PGDATA structural probe failed');
    this.name = 'PgdataProbeError';
  }
}

export interface ProbeStat {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

export interface PgdataProbeFileSystem {
  /** Read at most maxBytes; reject if the file contains more data. */
  readTextFile(path: string, maxBytes: number): Promise<string>;
  lstat(path: string): Promise<ProbeStat>;
}

export interface PgdataProbeResult {
  readonly ok: true;
  readonly postgresMajor: 17;
}

interface MountInfoEntry {
  readonly mountPoint: string;
  readonly mountOptions: ReadonlySet<string>;
  readonly optionalFields: readonly string[];
}

function invalid(): never {
  throw new PgdataProbeError('probe-failed');
}

function decodeMountInfoPath(value: string): string {
  if (!value) invalid();
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '\\') {
      result += value[index];
      continue;
    }
    const escape = value.slice(index, index + 4);
    const decoded: Record<string, string> = {
      '\\040': ' ',
      '\\011': '\t',
      '\\012': '\n',
      '\\134': '\\',
    };
    if (!(escape in decoded)) invalid();
    result += decoded[escape];
    index += 3;
  }
  if (
    !posix.isAbsolute(result) ||
    posix.normalize(result) !== result ||
    /[\0\r\n]/.test(result)
  )
    invalid();
  return result;
}

function tokens(value: string): ReadonlySet<string> {
  const values = value.split(',');
  if (
    !values.length ||
    values.some((item) => !item) ||
    new Set(values).size !== values.length
  )
    invalid();
  return new Set(values);
}

function parseMountInfo(text: string): readonly MountInfoEntry[] {
  if (!text || text.includes('\0') || !text.endsWith('\n')) invalid();
  const lines = text.slice(0, -1).split('\n');
  if (!lines.length || lines.some((line) => !line)) invalid();
  return lines.map((line) => {
    const fields = line.split(' ');
    const separators = fields
      .map((field, index) => (field === '-' ? index : -1))
      .filter((index) => index >= 0);
    if (separators.length !== 1) invalid();
    const separator = separators[0];
    if (separator < 6 || fields.length - separator - 1 !== 3) invalid();
    const [mountId, parentId, device, root, mountPoint, mountOptions] = fields;
    if (
      !/^\d+$/.test(mountId) ||
      !/^\d+$/.test(parentId) ||
      !/^\d+:\d+$/.test(device) ||
      !fields[separator + 1] ||
      !fields[separator + 2]
    )
      invalid();
    decodeMountInfoPath(root);
    const decodedMountPoint = decodeMountInfoPath(mountPoint);
    const optionals = fields.slice(6, separator);
    if (
      optionals.some(
        (field) =>
          field !== 'unbindable' &&
          !/^(?:shared|master|propagate_from):\d+$/.test(field),
      )
    )
      invalid();
    tokens(fields[separator + 3]);
    return Object.freeze({
      mountPoint: decodedMountPoint,
      mountOptions: tokens(mountOptions),
      optionalFields: Object.freeze(optionals),
    });
  });
}

function isDescendant(parent: string, candidate: string): boolean {
  const relative = posix.relative(parent, candidate);
  return (
    !!relative &&
    !posix.isAbsolute(relative) &&
    relative !== '..' &&
    !relative.startsWith('../')
  );
}

function validateMount(text: string): void {
  const entries = parseMountInfo(text);
  const exact = entries.filter((entry) => entry.mountPoint === PGDATA);
  if (exact.length !== 1) invalid();
  const mount = exact[0];
  if (!mount.mountOptions.has('ro') || mount.mountOptions.has('rw')) invalid();
  const masters = mount.optionalFields.filter((field) =>
    /^master:\d+$/.test(field),
  );
  if (
    masters.length !== 1 ||
    mount.optionalFields.some(
      (field) =>
        field === 'unbindable' || /^shared:|^propagate_from:/.test(field),
    )
  )
    invalid();
  if (entries.some((entry) => isDescendant(PGDATA, entry.mountPoint)))
    invalid();
}

async function requireDirectory(
  fileSystem: PgdataProbeFileSystem,
  path: string,
): Promise<void> {
  const stat = await fileSystem.lstat(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) invalid();
}

async function requireRegularFile(
  fileSystem: PgdataProbeFileSystem,
  path: string,
): Promise<void> {
  const stat = await fileSystem.lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile()) invalid();
}

/** Structural, read-only observation only; it makes no backup consistency claim. */
export async function runPgdataStructuralProbe(
  fileSystem: PgdataProbeFileSystem = nodeProbeFileSystem,
): Promise<PgdataProbeResult> {
  try {
    validateMount(
      await fileSystem.readTextFile(MOUNTINFO, MAX_MOUNTINFO_BYTES),
    );
    const version = await fileSystem.readTextFile(
      `${PGDATA}/PG_VERSION`,
      MAX_PG_VERSION_BYTES,
    );
    if (version !== '17\n') invalid();
    await requireDirectory(fileSystem, `${PGDATA}/base`);
    await requireDirectory(fileSystem, `${PGDATA}/global`);
    await requireRegularFile(fileSystem, `${PGDATA}/global/pg_control`);
    return Object.freeze({ ok: true, postgresMajor: 17 });
  } catch {
    invalid();
  }
}

export const nodeProbeFileSystem: PgdataProbeFileSystem = Object.freeze({
  async readTextFile(path: string, maxBytes: number): Promise<string> {
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(maxBytes + 1);
      let total = 0;
      while (total < buffer.length) {
        const { bytesRead } = await handle.read(
          buffer,
          total,
          buffer.length - total,
          null,
        );
        if (bytesRead === 0) break;
        total += bytesRead;
      }
      if (total > maxBytes) invalid();
      return new TextDecoder('utf-8', { fatal: true }).decode(
        buffer.subarray(0, total),
      );
    } finally {
      await handle.close();
    }
  },
  lstat: nodeLstat,
});
