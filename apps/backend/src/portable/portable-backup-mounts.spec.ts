import type { InternalMaintenanceContext } from './portable-maintenance';
import {
  PORTABLE_BACKUP_TARGET,
  PORTABLE_UPLOADS_TARGET,
  PortableBackupMountsError,
  qualifyPortableBackupMounts,
  type PortableBackupMountsFileSystem,
  type PortableBackupPathStat,
} from './portable-backup-mounts';

const uploads = '/var/lib/docker/volumes/portable_uploads/_data';

function context(mountpoint = uploads): InternalMaintenanceContext {
  return {
    source: {
      volumeIdentities: { uploads: { mountpoint } },
    },
  } as InternalMaintenanceContext;
}

function stat(
  kind: 'directory' | 'file' | 'symlink' = 'directory',
): PortableBackupPathStat {
  return {
    isDirectory: () => kind === 'directory',
    isSymbolicLink: () => kind === 'symlink',
  };
}

function fixture(destination = '/srv/jobtracker/backups') {
  const entries = new Map<string, PortableBackupPathStat>([
    ['/', stat()],
    ['/srv', stat()],
    ['/srv/jobtracker', stat()],
    [destination, stat()],
  ]);
  const calls: string[] = [];
  const fileSystem: PortableBackupMountsFileSystem = {
    lstat(path) {
      calls.push(path);
      const value = entries.get(path);
      if (!value)
        return Promise.reject(
          Object.assign(new Error('hidden path'), { code: 'ENOENT' }),
        );
      return Promise.resolve(value);
    },
  };
  const run = (path = destination) =>
    qualifyPortableBackupMounts(context(), path, fileSystem);
  return { calls, entries, fileSystem, run };
}

async function rejected(
  action: () => Promise<unknown>,
  code: 'configuration' | 'destination-invalid' | 'filesystem-failure',
) {
  const error = await action().catch((value: unknown) => value);
  expect(error).toBeInstanceOf(PortableBackupMountsError);
  expect(error).toMatchObject({ code });
  expect(JSON.stringify(error) + (error as Error).message).not.toContain(
    '/srv/jobtracker/backups',
  );
}

describe('Portable backup destination mounts', () => {
  it('qualifies a preexisting absolute directory and returns immutable mounts', async () => {
    const f = fixture();
    const result = await f.run('/srv/jobtracker/backups/');
    expect(f.calls).toEqual([
      '/',
      '/srv',
      '/srv/jobtracker',
      '/srv/jobtracker/backups',
    ]);
    expect(result.destinationHostPath).toBe('/srv/jobtracker/backups');
    expect(result.uploads).toEqual({
      type: 'bind',
      source: uploads,
      destination: PORTABLE_UPLOADS_TARGET,
      readOnly: true,
      bindCreateSource: false,
    });
    expect(result.backupDestination).toEqual({
      type: 'bind',
      source: '/srv/jobtracker/backups',
      destination: PORTABLE_BACKUP_TARGET,
      readOnly: false,
      bindCreateSource: false,
    });
    expect(result.mounts).toEqual([result.uploads, result.backupDestination]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.mounts)).toBe(true);
    expect(result.mounts.every(Object.isFrozen)).toBe(true);
  });

  it('refuses an absent destination without creating anything', async () => {
    const f = fixture();
    f.entries.delete('/srv/jobtracker/backups');
    await rejected(f.run, 'destination-invalid');
    expect(f.calls.at(-1)).toBe('/srv/jobtracker/backups');
  });

  it('refuses an absent intermediate component', async () => {
    const f = fixture();
    f.entries.delete('/srv/jobtracker');
    await rejected(f.run, 'destination-invalid');
    expect(f.calls).not.toContain('/srv/jobtracker/backups');
  });

  it.each([
    ['file destination', '/srv/jobtracker/backups', 'file'],
    ['symlink destination', '/srv/jobtracker/backups', 'symlink'],
    ['symlink ancestor', '/srv/jobtracker', 'symlink'],
  ] as const)('refuses a %s', async (_name, path, kind) => {
    const f = fixture();
    f.entries.set(path, stat(kind));
    await rejected(f.run, 'destination-invalid');
  });

  it.each([
    ['equal to uploads', uploads],
    ['below uploads', `${uploads}/backups`],
    ['containing uploads', '/var/lib/docker/volumes'],
  ])('refuses a destination %s', async (_name, destination) => {
    const f = fixture();
    await rejected(() => f.run(destination), 'destination-invalid');
    expect(f.calls).toEqual([]);
  });

  it('accepts neighboring paths that only share a string prefix', async () => {
    const destination = `${uploads}-backup`;
    const entries = new Map<string, PortableBackupPathStat>();
    let current = '/';
    entries.set(current, stat());
    for (const part of destination.slice(1).split('/')) {
      current = `${current === '/' ? '' : current}/${part}`;
      entries.set(current, stat());
    }
    const fileSystem: PortableBackupMountsFileSystem = {
      lstat(path) {
        const value = entries.get(path);
        return value
          ? Promise.resolve(value)
          : Promise.reject(new Error('unexpected'));
      },
    };
    await expect(
      qualifyPortableBackupMounts(context(), destination, fileSystem),
    ).resolves.toMatchObject({ destinationHostPath: destination });
  });

  it('refuses relative paths before filesystem access', async () => {
    const f = fixture();
    await rejected(() => f.run('backups'), 'configuration');
    expect(f.calls).toEqual([]);
  });

  it.each([
    ['relative', 'var/lib/uploads'],
    ['non-normalized', '/var/lib/../uploads'],
    ['NUL', '/var/lib/uploads\0hidden'],
    ['carriage return', '/var/lib/uploads\rhidden'],
    ['line feed', '/var/lib/uploads\nhidden'],
  ])(
    'refuses a %s qualified uploads mountpoint before filesystem access',
    async (_name, mountpoint) => {
      const f = fixture();
      await rejected(
        () =>
          qualifyPortableBackupMounts(
            context(mountpoint),
            '/srv/jobtracker/backups',
            f.fileSystem,
          ),
        'configuration',
      );
      expect(f.calls).toEqual([]);
    },
  );

  it('redacts unexpected filesystem errors', async () => {
    const f = fixture();
    f.fileSystem.lstat = () =>
      Promise.reject(new Error('/srv/jobtracker/backups SECRET'));
    await rejected(f.run, 'filesystem-failure');
  });
});
