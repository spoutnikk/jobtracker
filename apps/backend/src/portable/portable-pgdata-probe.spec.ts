import {
  PgdataProbeError,
  runPgdataStructuralProbe,
  type PgdataProbeFileSystem,
  type ProbeStat,
} from './portable-pgdata-probe';

const pgdata = '/probe/pgdata';
const mountinfo = '/proc/self/mountinfo';
const sentinel = 'SECRET_HOST_MOUNTPOINT_AND_CONTENT';

function line(
  mountPoint = pgdata,
  mountOptions = 'ro,nosuid,nodev',
  optional = 'master:7',
  superOptions = 'rw,relatime',
) {
  const optionalFields = optional ? ` ${optional}` : '';
  return `36 25 0:32 / ${mountPoint} ${mountOptions}${optionalFields} - ext4 /dev/sda ${superOptions}\n`;
}

function stat(kind: 'directory' | 'file' | 'symlink' | 'special'): ProbeStat {
  return {
    isDirectory: () => kind === 'directory',
    isFile: () => kind === 'file',
    isSymbolicLink: () => kind === 'symlink',
  };
}

function fixture() {
  const texts = new Map<string, string>([
    [mountinfo, line()],
    [`${pgdata}/PG_VERSION`, '17\n'],
  ]);
  const stats = new Map<string, ProbeStat>([
    [`${pgdata}/base`, stat('directory')],
    [`${pgdata}/global`, stat('directory')],
    [`${pgdata}/global/pg_control`, stat('file')],
  ]);
  const readTextFile = jest.fn((path: string, maxBytes: number) => {
    expect(maxBytes).toBeGreaterThan(0);
    if (!texts.has(path)) throw new Error(`${sentinel}:${path}`);
    return Promise.resolve(texts.get(path)!);
  });
  const lstat = jest.fn((path: string) => {
    if (!stats.has(path)) throw new Error(`${sentinel}:${path}`);
    return Promise.resolve(stats.get(path)!);
  });
  const fileSystem: PgdataProbeFileSystem = { readTextFile, lstat };
  return { texts, stats, readTextFile, lstat, fileSystem };
}

async function rejects(fileSystem: PgdataProbeFileSystem) {
  const error = await runPgdataStructuralProbe(fileSystem).catch(
    (value: unknown) => value,
  );
  expect(error).toBeInstanceOf(PgdataProbeError);
  expect(error).toMatchObject({ code: 'probe-failed' });
  expect((error as Error).message).toBe('PGDATA structural probe failed');
  expect((error as Error).message).not.toContain(sentinel);
  expect(JSON.stringify(error)).not.toContain(sentinel);
}

describe('PGDATA structural probe mount contract', () => {
  it('accepts one exact read-only slave mount and returns a minimal result', async () => {
    const f = fixture();
    const result = await runPgdataStructuralProbe(f.fileSystem);
    expect(result).toEqual({ ok: true, postgresMajor: 17 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.keys(result)).toEqual(['ok', 'postgresMajor']);
  });

  it('does not confuse a false prefix with the exact mountpoint', async () => {
    const f = fixture();
    f.texts.set(mountinfo, line('/probe/pgdata-old'));
    await rejects(f.fileSystem);
  });

  it.each(['rw,nosuid', 'ro,rw'])(
    'refuses writable options %s',
    async (options) => {
      const f = fixture();
      f.texts.set(mountinfo, line(pgdata, options));
      await rejects(f.fileSystem);
    },
  );

  it.each(['ro,ro', 'ro,nosuid,ro'])(
    'refuses duplicate mount options %s',
    async (options) => {
      const f = fixture();
      f.texts.set(mountinfo, line(pgdata, options));
      await rejects(f.fileSystem);
    },
  );

  it.each([
    '',
    'shared:7',
    'unbindable',
    'master:7 shared:8',
    'master:7 master:8',
    'master:7 master:7',
  ])('refuses missing or incorrect slave propagation %j', async (optional) => {
    const f = fixture();
    f.texts.set(mountinfo, line(pgdata, 'ro', optional));
    await rejects(f.fileSystem);
  });

  it('refuses duplicate super-option tokens', async () => {
    const f = fixture();
    f.texts.set(mountinfo, line(pgdata, 'ro', 'master:7', 'rw,rw'));
    await rejects(f.fileSystem);
  });

  it('refuses a true descendant mount', async () => {
    const f = fixture();
    f.texts.set(mountinfo, line() + line(`${pgdata}/nested`, 'ro', 'master:7'));
    await rejects(f.fileSystem);
  });

  it('decodes mountinfo escaping before descendant detection', async () => {
    const f = fixture();
    f.texts.set(
      mountinfo,
      line() + line(`${pgdata}/nested\\040mount`, 'ro', 'master:7'),
    );
    await rejects(f.fileSystem);
  });

  it('does not treat a neighboring path as a descendant', async () => {
    const f = fixture();
    f.texts.set(mountinfo, line() + line('/probe/pgdata-old/nested'));
    await expect(runPgdataStructuralProbe(f.fileSystem)).resolves.toEqual({
      ok: true,
      postgresMajor: 17,
    });
  });

  it.each([
    '',
    'malformed\n',
    '36 25 0:32 / /probe/pgdata ro master:7 ext4 /dev/sda rw\n',
    '36 25 0:32 / /probe/pgdata ro master:7 - ext4 /dev/sda rw - extra\n',
    '36 25 bad / /probe/pgdata ro master:7 - ext4 /dev/sda rw\n',
    '36 25 0:32 / /probe/pgdata\\999 ro master:7 - ext4 /dev/sda rw\n',
  ])('fails closed on malformed mountinfo %j', async (value) => {
    const f = fixture();
    f.texts.set(mountinfo, value);
    await rejects(f.fileSystem);
  });

  it('refuses ambiguous duplicate exact mount entries', async () => {
    const f = fixture();
    f.texts.set(mountinfo, line() + line());
    await rejects(f.fileSystem);
  });
});

describe('PGDATA structural probe contents', () => {
  it.each(['17', '17\r\n', '17\nextra', '18\n', '', `${sentinel}\n`])(
    'refuses PG_VERSION %j',
    async (version) => {
      const f = fixture();
      f.texts.set(`${pgdata}/PG_VERSION`, version);
      await rejects(f.fileSystem);
    },
  );

  it.each(['base', 'global'] as const)(
    'requires %s to be a real directory',
    async (name) => {
      for (const kind of ['symlink', 'file', 'special'] as const) {
        const f = fixture();
        f.stats.set(`${pgdata}/${name}`, stat(kind));
        await rejects(f.fileSystem);
      }
      const missing = fixture();
      missing.stats.delete(`${pgdata}/${name}`);
      await rejects(missing.fileSystem);
    },
  );

  it('requires pg_control to be a real regular file', async () => {
    for (const kind of ['symlink', 'directory', 'special'] as const) {
      const f = fixture();
      f.stats.set(`${pgdata}/global/pg_control`, stat(kind));
      await rejects(f.fileSystem);
    }
    const missing = fixture();
    missing.stats.delete(`${pgdata}/global/pg_control`);
    await rejects(missing.fileSystem);
  });

  it('reads only mountinfo and PG_VERSION and lstats only three paths', async () => {
    const f = fixture();
    await runPgdataStructuralProbe(f.fileSystem);
    expect(f.readTextFile.mock.calls).toEqual([
      [mountinfo, 4 * 1024 * 1024],
      [`${pgdata}/PG_VERSION`, 16],
    ]);
    expect(f.lstat.mock.calls).toEqual([
      [`${pgdata}/base`],
      [`${pgdata}/global`],
      [`${pgdata}/global/pg_control`],
    ]);
    expect(f.readTextFile.mock.calls.flat()).not.toContain(
      `${pgdata}/global/pg_control`,
    );
  });

  it('redacts arbitrary filesystem and mountinfo failures', async () => {
    const f = fixture();
    f.readTextFile.mockRejectedValueOnce(new Error(sentinel));
    await rejects(f.fileSystem);
  });
});
