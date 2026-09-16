import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { validateBackup } from './backup-format';
import {
  produceBackup,
  type BackupDocument,
  type BackupProducerDependencies,
  type BackupSourceMetadata,
} from './backup-producer';

const ID = '888e5955-2f73-44ad-a90b-cea4304875d6';
const DATE = '2026-09-16T12:00:00.000Z';
const NAME = `jobtracker-backup-20260916T120000000Z-${ID}`;
const DUMP = Buffer.from('opaque test dump');
const TAR = Buffer.alloc(1024); // An empty TAR fixture; no external command.
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe('Portable backup producer', () => {
  let root: string;
  let destination: string;
  let uploadsRoot: string;
  let documents: BackupDocument[];
  let metadata: BackupSourceMetadata;
  let dependencies: BackupProducerDependencies;
  let dump: jest.MockedFunction<BackupProducerDependencies['produceDump']>;
  let archive: jest.MockedFunction<
    BackupProducerDependencies['produceArchive']
  >;
  const finalPath = () => join(destination, NAME);
  const partialPath = () => `${finalPath()}.partial`;
  const run = () => produceBackup({ destination, uploadsRoot }, dependencies);

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'jobtracker-producer-test-'));
    uploadsRoot = join(root, 'uploads');
    destination = join(root, 'backups');
    await fs.mkdir(uploadsRoot);
    documents = [];
    metadata = {
      serverVersion: '17.6',
      pgDumpVersion: '17.5',
      migrations: [
        { name: '20260816014000_add_query_indexes', checksum: 'b'.repeat(64) },
      ],
    };
    dump = jest.fn(async (path: string) => {
      await fs.writeFile(path, DUMP);
    });
    archive = jest.fn(async ({ destination: path }) => {
      await fs.writeFile(path, TAR);
    });
    dependencies = {
      readMetadata: () => Promise.resolve(metadata),
      readDocuments: () => Promise.resolve(documents),
      produceDump: dump,
      produceArchive: archive,
      now: () => new Date(DATE),
      uuid: () => ID,
    };
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  async function upload(path = 'cv.pdf', contents = 'CV'): Promise<void> {
    await fs.mkdir(join(uploadsRoot, ...path.split('/').slice(0, -1)), {
      recursive: true,
    });
    await fs.writeFile(join(uploadsRoot, path), contents);
  }

  async function expectUnpublished(): Promise<void> {
    await expect(fs.lstat(finalPath())).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect((await fs.lstat(partialPath())).isDirectory()).toBe(true);
  }

  it('publishes a minimal v1 with actual versions, migrations, hashes and a portable name', async () => {
    const result = await run();
    expect(result.directory).toBe(finalPath());
    expect(basename(result.directory)).not.toContain(':');
    expect(result.manifest).toMatchObject({
      backupId: ID,
      createdAt: DATE,
      postgresql: {
        serverVersion: metadata.serverVersion,
        pgDumpVersion: metadata.pgDumpVersion,
      },
      migrations: metadata.migrations,
      database: { name: 'database.dump', size: DUMP.length, sha256: sha(DUMP) },
      uploads: { name: 'uploads.tar', size: TAR.length, sha256: sha(TAR) },
      counts: { documents: 0, files: 0 },
      uploadsPathPrefix: 'uploads/',
    });
    await expect(validateBackup(result.directory)).resolves.toEqual(
      result.manifest,
    );
    expect(result.extraFiles).toBe(0);
    expect(result.cleanupError).toBeUndefined();
    await expect(fs.lstat(partialPath())).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('calls the archive adapter even for empty uploads', async () => {
    await run();
    expect(archive).toHaveBeenCalledWith({
      uploadsRoot,
      files: [],
      destination: join(partialPath(), 'candidate', 'uploads.tar'),
    });
  });

  it('matches a Document to its regular upload', async () => {
    await upload();
    documents = [{ id: 4, path: 'uploads/cv.pdf', size: 2 }];
    const result = await run();
    expect(result.manifest.counts).toEqual({ documents: 1, files: 1 });
    expect(result.extraFiles).toBe(0);
    expect(await fs.readFile(join(uploadsRoot, 'cv.pdf'), 'utf8')).toBe('CV');
  });

  it('includes sorted relative paths and preserves extra files, including nested Unicode names', async () => {
    await upload('z.txt');
    await upload('sous dossier/épreuve.txt');
    await upload('a.txt');
    documents = [{ id: 1, path: 'uploads/z.txt', size: 2 }];
    const result = await run();
    expect(archive.mock.calls[0][0].files).toEqual([
      'a.txt',
      'sous dossier/épreuve.txt',
      'z.txt',
    ]);
    expect(result.manifest.counts).toEqual({ documents: 1, files: 3 });
    expect(result.extraFiles).toBe(2);
    expect(await fs.readFile(join(uploadsRoot, 'a.txt'), 'utf8')).toBe('CV');
  });

  it('counts Document rows separately from distinct files', async () => {
    await upload();
    documents = [
      { id: 1, path: 'uploads/cv.pdf', size: 2 },
      { id: 2, path: 'uploads/cv.pdf', size: 2 },
    ];
    expect((await run()).manifest.counts).toEqual({ documents: 2, files: 1 });
  });

  it('rejects a missing referenced upload before asking for a dump', async () => {
    documents = [{ id: 1, path: 'uploads/private-name.pdf', size: 2 }];
    await expect(run()).rejects.toMatchObject({
      code: 'MISSING_DOCUMENT',
      message: 'A referenced Document has no regular upload file',
    });
    expect(dump).not.toHaveBeenCalled();
    await expectUnpublished();
  });

  it('rejects a Document size mismatch', async () => {
    await upload();
    documents = [{ id: 1, path: 'uploads/cv.pdf', size: 3 }];
    await expect(run()).rejects.toMatchObject({
      code: 'DOCUMENT_SIZE_MISMATCH',
    });
    await expectUnpublished();
  });

  it.each([
    '/etc/passwd',
    'C:\\Users\\user\\cv.pdf',
    'C:/Users/user/cv.pdf',
    'uploads/../secret',
    'uploads/sub/../../secret',
    'uploads/./cv.pdf',
    'uploads//cv.pdf',
    'uploads\\cv.pdf',
    'uploads/sub\\cv.pdf',
    'uploads/',
    'other/cv.pdf',
    'uploads/C:/cv.pdf',
  ])('rejects unsafe Document path %s', async (path) => {
    documents = [{ id: 1, path, size: 2 }];
    await expect(run()).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
    expect(dump).not.toHaveBeenCalled();
    await expectUnpublished();
  });

  it('rejects a symbolic link without reading its target', async () => {
    const external = join(root, 'external');
    await fs.mkdir(external);
    await fs.symlink(external, join(uploadsRoot, 'linked'), 'junction');
    await expect(run()).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' });
    expect(archive).not.toHaveBeenCalled();
    await expectUnpublished();
  });

  it('rejects a hard-linked upload when nlink exposes it', async () => {
    await upload();
    await fs.link(join(uploadsRoot, 'cv.pdf'), join(uploadsRoot, 'alias.pdf'));
    await expect(run()).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' });
    await expectUnpublished();
  });

  it('rejects special-file metadata without needing a platform-specific device or FIFO', async () => {
    await upload();
    const realLstat = fs.lstat;
    const special = await realLstat(join(uploadsRoot, 'cv.pdf'));
    jest.spyOn(special, 'isFile').mockReturnValue(false);
    jest.spyOn(fs, 'lstat').mockImplementation((...args) => {
      if (args[0] === join(uploadsRoot, 'cv.pdf'))
        return Promise.resolve(special);
      return realLstat(...args);
    });
    await expect(run()).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' });
    await expectUnpublished();
  });

  it.each(['dump', 'archive'] as const)(
    'preserves an original %s adapter failure and staging',
    async (adapter) => {
      const error = new Error('controlled adapter failure');
      (adapter === 'dump' ? dump : archive).mockRejectedValueOnce(error);
      await expect(run()).rejects.toBe(error);
      await expectUnpublished();
    },
  );

  it.each(['dump', 'archive'] as const)(
    'rejects %s adapter returning without its artifact',
    async (adapter) => {
      (adapter === 'dump' ? dump : archive).mockResolvedValueOnce(undefined);
      await expect(run()).rejects.toMatchObject({ code: 'MISSING_ARTIFACT' });
      await expectUnpublished();
    },
  );

  it('rejects a non-regular artifact', async () => {
    dump.mockImplementationOnce(async (path) => {
      await fs.mkdir(path);
    });
    await expect(run()).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' });
    await expectUnpublished();
  });

  it('lets validateManifest reject invalid supplied metadata', async () => {
    metadata.pgDumpVersion = '';
    await expect(run()).rejects.toMatchObject({ code: 'INVALID_MANIFEST' });
    await expectUnpublished();
  });

  it('lets validateManifest reject an empty artifact', async () => {
    archive.mockImplementationOnce(async ({ destination: path }) => {
      await fs.writeFile(path, '');
    });
    await expect(run()).rejects.toMatchObject({ code: 'INVALID_MANIFEST' });
    await expectUnpublished();
  });

  it('uses the real validateBackup to reject tampering after descriptors are computed', async () => {
    const realWrite = fs.writeFile;
    jest
      .spyOn(fs, 'writeFile')
      .mockImplementation(async (path, data, options) => {
        await realWrite(path, data, options);
        if (typeof path === 'string' && basename(path) === 'manifest.json') {
          // Controlled filesystem step, not a hook added to the producer API.
          await realWrite(
            join(partialPath(), 'candidate', 'database.dump'),
            Buffer.alloc(DUMP.length, 120),
          );
        }
      });
    await expect(run()).rejects.toMatchObject({ code: 'HASH_MISMATCH' });
    await expectUnpublished();
  });

  it('never creates the final directory before real validation succeeds', async () => {
    const realRename = fs.rename;
    jest.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await expect(fs.lstat(finalPath())).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(validateBackup(String(from))).resolves.toMatchObject({
        backupId: ID,
      });
      await realRename(from, to);
    });
    await run();
    expect(fs.rename).toHaveBeenCalledTimes(1);
  });

  it.each(['preparation', 'final'] as const)(
    'does not overwrite an existing %s directory',
    async (kind) => {
      const path = kind === 'preparation' ? partialPath() : finalPath();
      await fs.mkdir(path, { recursive: true });
      await fs.writeFile(join(path, 'sentinel'), 'keep');
      await expect(run()).rejects.toMatchObject({ code: 'COLLISION' });
      expect(await fs.readFile(join(path, 'sentinel'), 'utf8')).toBe('keep');
      expect(dump).not.toHaveBeenCalled();
    },
  );

  it('does not replace an empty final directory appearing during preparation', async () => {
    archive.mockImplementationOnce(async ({ destination: path }) => {
      await fs.writeFile(path, TAR);
      await fs.mkdir(finalPath());
    });
    await expect(run()).rejects.toMatchObject({ code: 'COLLISION' });
    expect(await fs.readdir(finalPath())).toEqual([]);
    expect((await fs.lstat(partialPath())).isDirectory()).toBe(true);
  });

  it('allows only one concurrent producer to reserve and publish the same name', async () => {
    const results = await Promise.allSettled([run(), run()]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toMatchObject({ code: 'COLLISION' });
    }
    await expect(validateBackup(finalPath())).resolves.toMatchObject({
      backupId: ID,
    });
    expect(dump).toHaveBeenCalledTimes(1);
  });

  it('preserves publication errors and the partial backup', async () => {
    const error = Object.assign(new Error('rename failed'), { code: 'EACCES' });
    jest.spyOn(fs, 'rename').mockRejectedValueOnce(error);
    await expect(run()).rejects.toBe(error);
    await expectUnpublished();
  });

  it('reports cleanup failure separately after a successful publication', async () => {
    const error = new Error('cleanup failed');
    jest.spyOn(fs, 'rmdir').mockRejectedValueOnce(error);
    const result = await run();
    expect(result.cleanupError).toBe(error);
    await expect(validateBackup(result.directory)).resolves.toEqual(
      result.manifest,
    );
  });

  it('rejects a destination inside the upload source', async () => {
    destination = join(uploadsRoot, 'backups');
    await expect(run()).rejects.toMatchObject({ code: 'INVALID_SOURCE' });
    expect(await fs.readdir(uploadsRoot)).toEqual([]);
  });

  it('rejects unsafe injected identity before creating a preparation', async () => {
    dependencies.uuid = () => '../escape';
    await expect(run()).rejects.toMatchObject({ code: 'INVALID_IDENTITY' });
    await expect(fs.lstat(destination)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects a symlink ancestor before creating anything in uploads', async () => {
    const alias = join(root, 'alias');
    await fs.symlink(uploadsRoot, alias, 'junction');
    destination = join(alias, 'new-backup');
    await expect(run()).rejects.toMatchObject({ code: 'INVALID_SOURCE' });
    await expect(
      fs.lstat(join(uploadsRoot, 'new-backup')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.lstat(finalPath())).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await fs.readdir(uploadsRoot)).toEqual([]);
    expect(dump).not.toHaveBeenCalled();
  });

  it('creates multiple missing destination components below ordinary ancestors', async () => {
    destination = join(root, 'new-parent', 'nested', 'backups');
    const result = await run();
    await expect(validateBackup(result.directory)).resolves.toEqual(
      result.manifest,
    );
  });

  it('rejects an existing file ancestor before creating the destination', async () => {
    const ancestor = join(root, 'file-parent');
    await fs.writeFile(ancestor, 'keep');
    destination = join(ancestor, 'backups');
    const mkdirSpy = jest.spyOn(fs, 'mkdir');
    await expect(run()).rejects.toMatchObject({ code: 'INVALID_SOURCE' });
    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(await fs.readFile(ancestor, 'utf8')).toBe('keep');
    expect(dump).not.toHaveBeenCalled();
  });

  it('rejects a symlink destination itself before any creation', async () => {
    await fs.symlink(uploadsRoot, destination, 'junction');
    const mkdirSpy = jest.spyOn(fs, 'mkdir');
    await expect(run()).rejects.toMatchObject({ code: 'INVALID_SOURCE' });
    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(await fs.readdir(uploadsRoot)).toEqual([]);
    expect(dump).not.toHaveBeenCalled();
  });
});
