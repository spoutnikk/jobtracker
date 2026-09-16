import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateBackup,
  validateManifest,
  type BackupManifestV1,
} from './backup-format';

const database = Buffer.from('opaque dump fixture');
const uploads = Buffer.alloc(1024); // Empty TAR end markers; no extraction.
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');

function fixture(): BackupManifestV1 {
  return {
    formatVersion: 1,
    backupId: '888e5955-2f73-44ad-a90b-cea4304875d6',
    createdAt: '2026-09-16T12:00:00.000Z',
    postgresql: { serverVersion: '17.6', pgDumpVersion: '17.6' },
    migrations: [
      { name: '20260816014000_add_query_indexes', checksum: 'a'.repeat(64) },
    ],
    database: {
      name: 'database.dump',
      size: database.length,
      sha256: hash(database),
    },
    uploads: {
      name: 'uploads.tar',
      size: uploads.length,
      sha256: hash(uploads),
    },
    counts: { documents: 0, files: 0 },
    uploadsPathPrefix: 'uploads/',
  };
}

describe('Portable backup v1 integrity validation', () => {
  let directory: string;
  let manifest: BackupManifestV1;
  const saveManifest = () =>
    writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'jobtracker-backup-test-'));
    manifest = fixture();
    await Promise.all([
      saveManifest(),
      writeFile(join(directory, 'database.dump'), database),
      writeFile(join(directory, 'uploads.tar'), uploads),
    ]);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('accepts v1 without modifying any backup file', async () => {
    const before = await readFile(join(directory, 'manifest.json'));
    await expect(validateBackup(directory)).resolves.toEqual(manifest);
    expect(await readFile(join(directory, 'manifest.json'))).toEqual(before);
    expect(await readFile(join(directory, 'database.dump'))).toEqual(database);
    expect(await readFile(join(directory, 'uploads.tar'))).toEqual(uploads);
  });

  it.each(['manifest.json', 'database.dump', 'uploads.tar'])(
    'rejects missing %s',
    async (file) => {
      await rm(join(directory, file));
      await expect(validateBackup(directory)).rejects.toMatchObject({
        code: 'MISSING_FILE',
        message: expect.stringContaining(file) as unknown,
      });
    },
  );

  it('rejects invalid JSON', async () => {
    await writeFile(join(directory, 'manifest.json'), '{');
    await expect(validateBackup(directory)).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
  });

  it('rejects an unknown format version', async () => {
    await expect(
      Promise.resolve().then(() =>
        validateManifest({ ...manifest, formatVersion: 2 }),
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_VERSION' });
  });

  it.each(['database', 'uploads'] as const)(
    'rejects incorrect %s SHA-256',
    async (key) => {
      manifest[key].sha256 = '0'.repeat(64);
      await saveManifest();
      await expect(validateBackup(directory)).rejects.toMatchObject({
        code: 'HASH_MISMATCH',
        message: expect.stringContaining(manifest[key].name) as unknown,
      });
    },
  );

  it.each(['database', 'uploads'] as const)(
    'rejects incorrect %s size',
    async (key) => {
      manifest[key].size += 1;
      await saveManifest();
      await expect(validateBackup(directory)).rejects.toMatchObject({
        code: 'SIZE_MISMATCH',
      });
    },
  );

  it('rejects a .partial directory even with complete files', async () => {
    const partial = `${directory}.partial`;
    await rename(directory, partial);
    directory = partial;
    await expect(validateBackup(directory)).rejects.toMatchObject({
      code: 'INCOMPLETE_BACKUP',
    });
  });

  it('rejects a .partial directory with a trailing /.', async () => {
    const partial = `${directory}.partial`;
    await rename(directory, partial);
    directory = partial;
    // Keep the input unnormalized so the validator handles the trailing dot.
    await expect(validateBackup(`${directory}/.`)).rejects.toMatchObject({
      code: 'INCOMPLETE_BACKUP',
    });
  });

  it('rejects . when cwd is a .partial directory', async () => {
    const partial = `${directory}.partial`;
    await rename(directory, partial);
    directory = partial;
    const originalCwd = process.cwd();
    try {
      process.chdir(directory);
      await expect(validateBackup('.')).rejects.toMatchObject({
        code: 'INCOMPLETE_BACKUP',
      });
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('rejects a directory in place of a payload', async () => {
    await rm(join(directory, 'database.dump'));
    await mkdir(join(directory, 'database.dump'));
    await expect(validateBackup(directory)).rejects.toMatchObject({
      code: 'INVALID_PATH',
    });
  });

  it('rejects an oversized manifest', async () => {
    await writeFile(
      join(directory, 'manifest.json'),
      ' '.repeat(1024 * 1024 + 1),
    );
    await expect(validateBackup(directory)).rejects.toMatchObject({
      code: 'INVALID_MANIFEST',
    });
  });

  it.each([
    ['backupId', ''],
    ['createdAt', '2026-02-30T12:00:00.000Z'],
    ['createdAt', '2026-09-16T14:00:00.000+02:00'],
    ['createdAt', 'not-a-date'],
    ['postgresql', { serverVersion: 'latest', pgDumpVersion: '17.6' }],
    ['migrations', []],
    ['migrations', [{ name: '../migration', checksum: 'a'.repeat(64) }]],
    [
      'migrations',
      [{ name: '20260816014000_add_query_indexes', checksum: null }],
    ],
    ['database', { name: '../database.dump', size: 1, sha256: 'a'.repeat(64) }],
    ['uploads', { name: 'uploads.tar', size: 0, sha256: 'a'.repeat(64) }],
    ['counts', { documents: -1, files: 0 }],
    ['counts', { documents: 0, files: 1.5 }],
    ['uploadsPathPrefix', '/absolute/uploads/'],
    ['DATABASE_URL', 'forbidden configuration field'],
  ])('rejects invalid field %s (%p)', async (key, value) => {
    await expect(
      Promise.resolve().then(() =>
        validateManifest({ ...manifest, [key]: value }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_MANIFEST' });
  });

  it('rejects a missing required field', async () => {
    const incomplete: Record<string, unknown> = { ...manifest };
    delete incomplete.backupId;
    await expect(
      Promise.resolve().then(() => validateManifest(incomplete)),
    ).rejects.toMatchObject({ code: 'INVALID_MANIFEST' });
  });

  it('rejects duplicate migrations', () => {
    manifest.migrations.push({ ...manifest.migrations[0] });
    expect(() => validateManifest(manifest)).toThrow('duplicate');
  });
});
