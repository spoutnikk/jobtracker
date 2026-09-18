import {
  preparePortableMaintenance,
  preparePortableMaintenanceInternal,
  assertSameSource,
  type MaintenanceOptions,
} from './portable-maintenance';
import {
  discoverPortableSource,
  PreflightError,
  type DockerExecutor,
  type InternalSourceDiscovery,
  type PreflightSnapshot,
  type ContainerSnapshot,
} from './portable-preflight';

const operation = '12345678-1234-4234-8234-123456789abc';
const date = '2026-09-16T10:20:30.000Z';
const lockId = 'a'.repeat(64);
const imageId = 'sha256:' + 'b'.repeat(64);
const proxyKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'FTP_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'ftp_proxy',
  'no_proxy',
  'all_proxy',
];
const secret = 'SUPER_SECRET_PASSWORD';
const lockName = 'portable-jobtracker-maintenance-lock';
const options: MaintenanceOptions = {
  projectRoot: '/project',
  composeFile: 'compose.yaml',
  image: 'jobtracker-maintenance:local',
  env: {
    PATH: '/bin',
    HOME: '/home/user',
    POSTGRES_PASSWORD: secret,
    DATABASE_URL: secret,
  },
};
function source(): PreflightSnapshot {
  return {
    projectName: 'portable',
    projectRoot: '/project',
    composeFile: '/project/compose.yaml',
    volumes: {
      postgres: {
        logicalName: 'postgres_data',
        physicalName: 'resolved-pg',
        driver: 'local',
      },
      uploads: {
        logicalName: 'uploads_data',
        physicalName: 'resolved-files',
        driver: 'local',
      },
    },
    services: { postgres: null, backend: null, frontend: null, migrate: [] },
  };
}
function internalSource(
  snapshot: PreflightSnapshot = source(),
): InternalSourceDiscovery {
  const platform = Object.freeze({
    context: 'default' as const,
    endpoint: 'local-unix-default' as const,
    engineVersion: '29.8.1' as const,
    serverApiVersion: '1.56' as const,
    osType: 'linux' as const,
    architecture: 'amd64' as const,
    dockerRootDir: '/var/lib/docker',
    rootless: false as const,
    clientVersion: '31.0.0',
  });
  const identity = (
    logicalName: 'postgres_data' | 'uploads_data',
    physicalName: string,
  ) =>
    Object.freeze({
      logicalName,
      physicalName,
      driver: 'local' as const,
      scope: 'local' as const,
      labels: Object.freeze({
        'com.docker.compose.project': 'portable',
        'com.docker.compose.volume': logicalName,
      }),
      options: Object.freeze({}),
      mountpoint: `/var/lib/docker/volumes/${physicalName}/_data`,
      dockerRootDir: '/var/lib/docker',
      userIds: Object.freeze([] as string[]),
    });
  return Object.freeze({
    publicSnapshot: snapshot,
    platform,
    volumeIdentities: Object.freeze({
      postgres: identity('postgres_data', 'resolved-pg'),
      uploads: identity('uploads_data', 'resolved-files'),
    }),
  });
}
function withPostgresIdentity(
  discovery: InternalSourceDiscovery,
  changes: Readonly<{
    labels?: Readonly<Record<string, string>>;
    userIds?: readonly string[];
  }>,
): InternalSourceDiscovery {
  return {
    ...discovery,
    volumeIdentities: {
      ...discovery.volumeIdentities,
      postgres: {
        ...discovery.volumeIdentities.postgres,
        ...changes,
      },
    },
  };
}

function withoutLabel(
  labels: Readonly<Record<string, string>>,
  removed: string,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(labels).filter(([key]) => key !== removed),
  );
}
function sourceContainer(id = 'c'.repeat(64)): ContainerSnapshot {
  return {
    id,
    service: 'postgres',
    projectName: 'portable',
    oneOff: false,
    state: 'running',
    running: true,
    health: 'healthy',
    mounts: [
      {
        type: 'volume',
        name: 'resolved-pg',
        destination: '/var/lib/postgresql/data',
        readWrite: true,
      },
    ],
    networks: [
      {
        name: 'portable_default',
        id: 'd'.repeat(64),
        aliases: ['postgres', 'database'],
      },
    ],
  };
}
function lock() {
  return {
    Id: lockId,
    Name: '/' + lockName,
    Image: imageId,
    Config: {
      Image: imageId,
      Labels: {
        'org.jobtracker.maintenance.kind': 'lock',
        'org.jobtracker.maintenance.project': 'portable',
        'org.jobtracker.maintenance.operation': operation,
        'org.jobtracker.maintenance.created-at': date,
      },
      Entrypoint: ['node'],
      Cmd: ['-e', 'process.exit(0)'],
      Env: [
        'PATH=/usr/local/bin:/usr/bin:/bin',
        'NODE_ENV=production',
        ...proxyKeys.map((key) => `${key}=`),
      ],
      Healthcheck: { Test: ['NONE'] },
      Volumes: null,
    },
    State: {
      Status: 'created',
      Running: false,
      Paused: false,
      Restarting: false,
      Dead: false,
      StartedAt: '0001-01-01T00:00:00Z',
    },
    Mounts: [],
    HostConfig: {
      NetworkMode: 'none',
      RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
      Privileged: false,
      ReadonlyRootfs: true,
      AutoRemove: false,
      Binds: null,
      Mounts: [],
      VolumesFrom: null,
      Tmpfs: null,
      Devices: [],
      DeviceRequests: null,
      CapAdd: null,
      PortBindings: {},
      PidMode: '',
    },
    NetworkSettings: {
      Networks: {
        none: {
          NetworkID: 'e'.repeat(64),
          IPAddress: '',
          Gateway: '',
          GlobalIPv6Address: '',
          IPv6Gateway: '',
        },
      },
    },
  };
}
function fixture() {
  const image = {
    Id: imageId,
    Config: {
      Env: lock().Config.Env.filter(
        (entry) => !proxyKeys.includes(entry.split('=')[0]),
      ),
      Volumes: null,
      Labels: {},
      OnBuild: null,
    },
  };
  const state = {
    created: false,
    present: false,
    container: lock(),
    createExit: 0,
    removeExit: 0,
    inspectExit: 0,
    listExit: 0,
    imageExit: 0,
    createdOutput: lockId + '\n',
  };
  const initial = source();
  const discover = jest.fn<
    ReturnType<typeof discoverPortableSource>,
    Parameters<typeof discoverPortableSource>
  >(() => Promise.resolve(initial));
  const execute = jest.fn<
    ReturnType<DockerExecutor>,
    Parameters<DockerExecutor>
  >((r) => {
    const a = r.args;
    let stdout = '';
    let exitCode = 0;
    if (a[0] === 'image' && a[1] === 'inspect') {
      stdout = JSON.stringify([image]);
      exitCode = state.imageExit;
    } else if (a[0] === 'container' && a[1] === 'ls') {
      stdout = state.present
        ? JSON.stringify({
            ID: state.container.Id,
            Names: state.container.Name.slice(1),
          })
        : '';
      exitCode = state.listExit;
    } else if (a[0] === 'create') {
      exitCode = state.createExit;
      if (!exitCode) {
        state.created = true;
        state.present = true;
        stdout = state.createdOutput;
      }
    } else if (a[0] === 'container' && a[1] === 'inspect') {
      stdout = JSON.stringify([state.container]);
      exitCode = state.inspectExit;
    } else if (a[0] === 'container' && a[1] === 'rm') {
      exitCode = state.removeExit;
      if (!exitCode) state.present = false;
    } else throw new Error('Unexpected Docker command');
    return Promise.resolve({ stdout, stderr: secret, exitCode });
  });
  const dependencies = {
    execute,
    discover,
    uuid: () => operation,
    now: () => new Date(date),
  };
  return {
    state,
    image,
    initial,
    execute,
    discover,
    dependencies,
    prepare: () => preparePortableMaintenance(options, dependencies),
  };
}
const removals = (f: ReturnType<typeof fixture>) =>
  f.execute.mock.calls.filter(
    ([r]) => r.args[0] === 'container' && r.args[1] === 'rm',
  );

describe('maintenance acquisition', () => {
  it('returns verified source and explicit lease, retaining the lock', async () => {
    const f = fixture();
    const lease = await f.prepare();
    expect(lease.operationId).toBe(operation);
    expect(lease.source).toBe(f.initial);
    expect(lease.lock).toEqual({ id: lockId, name: lockName });
    expect(f.discover).toHaveBeenCalledTimes(2);
    expect(f.state.present).toBe(true);
    expect(removals(f)).toHaveLength(0);
    expect(Object.isFrozen(lease)).toBe(true);
    expect(Object.isFrozen(lease.lock)).toBe(true);
  });
  it('creates an atomic reservation with exact no-pull/no-mount/no-start arguments', async () => {
    const f = fixture();
    await f.prepare();
    const request = f.execute.mock.calls.find(
      ([r]) => r.args[0] === 'create',
    )![0];
    expect(request.args).toEqual([
      'create',
      '--pull',
      'never',
      '--name',
      lockName,
      '--network',
      'none',
      '--restart',
      'no',
      '--read-only',
      '--no-healthcheck',
      '--entrypoint',
      'node',
      '--label',
      'org.jobtracker.maintenance.kind=lock',
      '--label',
      'org.jobtracker.maintenance.project=portable',
      '--label',
      `org.jobtracker.maintenance.operation=${operation}`,
      '--label',
      `org.jobtracker.maintenance.created-at=${date}`,
      ...proxyKeys.flatMap((key) => ['--env', `${key}=`]),
      imageId,
      '-e',
      'process.exit(0)',
    ]);
    expect(JSON.stringify(request)).not.toContain(secret);
    expect(request.args.join(' ')).not.toContain('com.docker.compose');
    expect(f.execute.mock.calls[1][0].args).toEqual([
      'image',
      'inspect',
      options.image,
    ]);
  });
  it('refuses a preexisting lock without create or deletion', async () => {
    const f = fixture();
    f.state.present = true;
    await expect(f.prepare()).rejects.toMatchObject({ code: 'lock-held' });
    expect(f.state.created).toBe(false);
    expect(removals(f)).toHaveLength(0);
  });
  it('classifies atomic create conflict without deleting the winner', async () => {
    const f = fixture();
    const original = f.execute.getMockImplementation()!;
    f.execute.mockImplementation((r) => {
      if (r.args[0] === 'create') {
        f.state.present = true;
        f.state.createExit = 1;
        f.state.container.Id = 'c'.repeat(64);
      }
      return original(r);
    });
    await expect(f.prepare()).rejects.toMatchObject({ code: 'lock-held' });
    expect(removals(f)).toHaveLength(0);
  });
  it('reports create failure without deleting anything', async () => {
    const f = fixture();
    f.state.createExit = 1;
    await expect(f.prepare()).rejects.toMatchObject({ code: 'docker-runner' });
    expect(removals(f)).toHaveLength(0);
  });
  it('reports uncertain ownership after runner failure during create', async () => {
    const f = fixture();
    f.state.inspectExit = 1;
    const original = f.execute.getMockImplementation()!;
    f.execute.mockImplementation((r) =>
      r.args[0] === 'create' ? Promise.reject(new Error(secret)) : original(r),
    );
    await expect(f.prepare()).rejects.toMatchObject({
      code: 'docker-runner',
      cleanupFailure: 'ownership-unconfirmed',
    });
    expect(removals(f)).toHaveLength(0);
  });
  it('never guesses an ID when successful create output is malformed', async () => {
    const f = fixture();
    f.state.createdOutput = secret;
    f.state.container.Config.Labels['org.jobtracker.maintenance.operation'] =
      'other';
    await expect(f.prepare()).rejects.toMatchObject({
      code: 'lock-invalid',
      cleanupFailure: 'ownership-unconfirmed',
    });
    expect(removals(f)).toHaveLength(0);
  });
  it('does not pull a missing image', async () => {
    const f = fixture();
    f.state.imageExit = 1;
    await expect(f.prepare()).rejects.toMatchObject({ code: 'image-invalid' });
    expect(f.state.created).toBe(false);
    expect(f.execute.mock.calls.some(([r]) => r.args[0] === 'pull')).toBe(
      false,
    );
  });
  it('rejects image-declared volumes before create', async () => {
    const f = fixture();
    Object.assign(f.image.Config, { Volumes: { '/data': {} } });
    await expect(f.prepare()).rejects.toMatchObject({ code: 'image-invalid' });
    expect(f.state.created).toBe(false);
  });
  it('rejects inherited application credentials', async () => {
    const f = fixture();
    f.image.Config.Env.push(`POSTGRES_PASSWORD=${secret}`);
    await expect(f.prepare()).rejects.toMatchObject({ code: 'image-invalid' });
    expect(f.state.created).toBe(false);
  });
  it('rejects inherited Compose labels', async () => {
    const f = fixture();
    Object.assign(f.image.Config.Labels, {
      'com.docker.compose.project': 'portable',
    });
    await expect(f.prepare()).rejects.toMatchObject({ code: 'image-invalid' });
    expect(f.state.created).toBe(false);
  });
  it('cleans a proven-created lock after configuration mismatch', async () => {
    const f = fixture();
    f.state.container.HostConfig.RestartPolicy.Name = 'always';
    await expect(f.prepare()).rejects.toMatchObject({ code: 'lock-invalid' });
    expect(removals(f).map(([r]) => r.args)).toEqual([
      ['container', 'rm', lockId],
    ]);
    expect(f.discover).toHaveBeenCalledTimes(1);
  });
  it.each(['Id', 'Name', 'operation'])(
    'does not delete an identity mismatch: %s',
    async (field) => {
      const f = fixture();
      if (field === 'operation')
        f.state.container.Config.Labels[
          'org.jobtracker.maintenance.operation'
        ] = 'other';
      else f.state.container[field as 'Id' | 'Name'] = 'other';
      await expect(f.prepare()).rejects.toMatchObject({
        code: 'lock-invalid',
        cleanupFailure: 'lock-invalid',
      });
      expect(removals(f)).toHaveLength(0);
    },
  );
  it('does not delete when inspection cannot prove ownership', async () => {
    const f = fixture();
    f.state.inspectExit = 1;
    await expect(f.prepare()).rejects.toMatchObject({
      code: 'lock-invalid',
      cleanupFailure: 'cleanup-failed',
    });
    expect(removals(f)).toHaveLength(0);
  });
  it('keeps primary failure separate from cleanup failure', async () => {
    const f = fixture();
    f.state.container.Config.Cmd = ['bad'];
    f.state.removeExit = 1;
    await expect(f.prepare()).rejects.toMatchObject({
      code: 'lock-invalid',
      cleanupFailure: 'cleanup-failed',
    });
  });
  it('refuses cleanup of a started lock', async () => {
    const f = fixture();
    f.state.container.State.Status = 'running';
    f.state.container.State.Running = true;
    await expect(f.prepare()).rejects.toMatchObject({
      code: 'lock-invalid',
      cleanupFailure: 'lock-invalid',
    });
    expect(removals(f)).toHaveLength(0);
  });
  it.each(['image', 'entrypoint', 'network', 'mount', 'privileged'])(
    'rejects critical configuration mismatch %s',
    async (field) => {
      const f = fixture();
      const c = f.state.container;
      if (field === 'image') c.Image = 'sha256:' + 'f'.repeat(64);
      if (field === 'entrypoint') c.Config.Entrypoint = ['postgres'];
      if (field === 'network') c.HostConfig.NetworkMode = 'bridge';
      if (field === 'mount')
        Object.assign(c, { Mounts: [{ Type: 'volume', Name: 'unsafe' }] });
      if (field === 'privileged') c.HostConfig.Privileged = true;
      await expect(f.prepare()).rejects.toMatchObject({ code: 'lock-invalid' });
    },
  );
  it('preserves sanitized initial preflight refusal without lock commands', async () => {
    const f = fixture();
    f.discover.mockRejectedValueOnce(new PreflightError('source-missing'));
    await expect(f.prepare()).rejects.toMatchObject({ code: 'source-missing' });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('rejects invalid operation ID before discovery', async () => {
    const f = fixture();
    await expect(
      preparePortableMaintenance(options, {
        ...f.dependencies,
        uuid: () => secret,
      }),
    ).rejects.toMatchObject({ code: 'configuration' });
    expect(f.discover).not.toHaveBeenCalled();
  });
});

describe('explicit snapshot revalidation', () => {
  const changes: [string, (s: PreflightSnapshot) => PreflightSnapshot][] = [
    ['project', (s) => ({ ...s, projectName: 'changed' })],
    ['compose file', (s) => ({ ...s, composeFile: '/different.yaml' })],
    [
      'postgres volume',
      (s) => ({
        ...s,
        volumes: {
          ...s.volumes,
          postgres: { ...s.volumes.postgres, physicalName: 'other' },
        },
      }),
    ],
    [
      'uploads volume',
      (s) => ({
        ...s,
        volumes: {
          ...s.volumes,
          uploads: { ...s.volumes.uploads, physicalName: 'other' },
        },
      }),
    ],
    [
      'container ID',
      (s) => ({
        ...s,
        services: {
          ...s.services,
          postgres: { ...s.services.postgres!, id: 'f'.repeat(64) },
        },
      }),
    ],
    [
      'service',
      (s) => ({
        ...s,
        services: {
          ...s.services,
          postgres: { ...s.services.postgres!, service: 'backend' },
        },
      }),
    ],
    [
      'state',
      (s) => ({
        ...s,
        services: {
          ...s.services,
          postgres: {
            ...s.services.postgres!,
            state: 'exited',
            running: false,
          },
        },
      }),
    ],
    [
      'health',
      (s) => ({
        ...s,
        services: {
          ...s.services,
          postgres: { ...s.services.postgres!, health: 'unhealthy' },
        },
      }),
    ],
    [
      'mount',
      (s) => ({
        ...s,
        services: {
          ...s.services,
          postgres: { ...s.services.postgres!, mounts: [] },
        },
      }),
    ],
    [
      'network',
      (s) => ({
        ...s,
        services: {
          ...s.services,
          postgres: { ...s.services.postgres!, networks: [] },
        },
      }),
    ],
    [
      'alias',
      (s) => ({
        ...s,
        services: {
          ...s.services,
          postgres: {
            ...s.services.postgres!,
            networks: [
              { ...s.services.postgres!.networks[0], aliases: ['changed'] },
            ],
          },
        },
      }),
    ],
  ];
  it.each(changes)(
    'refuses changed %s and releases only its lock',
    async (_name, change) => {
      const f = fixture();
      const initial = {
        ...source(),
        services: { ...source().services, postgres: sourceContainer() },
      };
      f.discover
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(change(initial));
      await expect(f.prepare()).rejects.toMatchObject({
        code: 'source-changed',
      });
      expect(removals(f)).toHaveLength(1);
      expect(f.state.present).toBe(false);
      expect(
        f.execute.mock.calls.some(([r]) =>
          ['start', 'run', 'exec'].includes(r.args[0]),
        ),
      ).toBe(false);
    },
  );
  it('refuses disappeared source after lock and performs lock cleanup only', async () => {
    const f = fixture();
    f.discover
      .mockResolvedValueOnce(source())
      .mockRejectedValueOnce(new PreflightError('source-partial'));
    await expect(f.prepare()).rejects.toMatchObject({ code: 'source-changed' });
    expect(removals(f)).toHaveLength(1);
  });
  it('reports cleanup failure separately after revalidation failure', async () => {
    const f = fixture();
    f.discover
      .mockResolvedValueOnce(source())
      .mockRejectedValueOnce(new Error(secret));
    f.state.removeExit = 1;
    const error = await f.prepare().catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: 'source-changed',
      cleanupFailure: 'cleanup-failed',
    });
    expect(JSON.stringify(error)).not.toContain(secret);
    expect((error as Error).message).not.toContain(secret);
  });
  it('ignores harmless array ordering without modifying snapshots', () => {
    const a = sourceContainer();
    const b = {
      ...a,
      networks: a.networks.map((n) => ({
        ...n,
        aliases: [...n.aliases].reverse(),
      })),
    };
    const initial = {
      ...source(),
      services: {
        ...source().services,
        postgres: a,
        migrate: [
          { ...a, id: 'd'.repeat(64), service: 'migrate' as const },
          { ...a, id: 'e'.repeat(64), service: 'migrate' as const },
        ],
      },
    };
    const verified = {
      ...initial,
      services: {
        ...initial.services,
        postgres: b,
        migrate: [...initial.services.migrate].reverse(),
      },
    };
    expect(() => assertSameSource(initial, verified)).not.toThrow();
    expect(a.networks[0].aliases).toEqual(['postgres', 'database']);
  });
});

describe('internal source revalidation', () => {
  it('returns only the revalidated internal source beside a redacted public lease', async () => {
    const f = fixture();
    const initial = internalSource();
    const verified = Object.freeze({
      ...initial,
      platform: Object.freeze({ ...initial.platform, clientVersion: '40.0.0' }),
    });
    const discoverInternal = jest
      .fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(verified);
    const context = await preparePortableMaintenanceInternal(options, {
      execute: f.execute,
      discoverInternal,
      uuid: () => operation,
      now: () => new Date(date),
    });
    expect(context.source).toBe(verified);
    expect(context.imageId).toBe(imageId);
    expect(JSON.stringify(context.lease)).not.toContain(
      verified.volumeIdentities.postgres.mountpoint,
    );
    await context.lease.release();
  });

  function prepareWithSources(
    initial: InternalSourceDiscovery,
    verified: InternalSourceDiscovery,
  ) {
    const f = fixture();
    const discoverInternal = jest
      .fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(verified);
    const result = preparePortableMaintenance(options, {
      ...f.dependencies,
      discover: undefined,
      discoverInternal,
    });
    return { f, result };
  }

  it.each(['mountpoint', 'scope', 'labels', 'options', 'docker-root'])(
    'rejects changed internal %s without exposing host paths',
    async (field) => {
      const f = fixture();
      const initial = internalSource();
      const changed = structuredClone(initial);
      const postgres = changed.volumeIdentities.postgres as unknown as Record<
        string,
        unknown
      >;
      if (field === 'mountpoint')
        postgres.mountpoint = '/var/lib/docker/volumes/replacement/_data';
      if (field === 'scope') postgres.scope = 'global';
      if (field === 'labels') postgres.labels = { changed: 'true' };
      if (field === 'options') postgres.options = { device: '/secret' };
      if (field === 'docker-root') {
        postgres.dockerRootDir = '/different';
        (changed.platform as unknown as Record<string, unknown>).dockerRootDir =
          '/different';
      }
      const discoverInternal = jest
        .fn()
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(changed);
      await expect(
        preparePortableMaintenance(options, {
          ...f.dependencies,
          discover: undefined,
          discoverInternal,
        }),
      ).rejects.toMatchObject({ code: 'source-changed' });
      expect(removals(f)).toHaveLength(1);
      const serializedCalls = JSON.stringify(f.execute.mock.calls);
      expect(serializedCalls).not.toContain(
        initial.volumeIdentities.postgres.mountpoint,
      );
    },
  );

  it('accepts reordered complete labels and user IDs', async () => {
    const initial = withPostgresIdentity(internalSource(), {
      labels: {
        zeta: 'last',
        'com.docker.compose.volume': 'postgres_data',
        alpha: 'first',
        'com.docker.compose.project': 'portable',
      },
      userIds: ['b'.repeat(64), 'a'.repeat(64)],
    });
    const verified = withPostgresIdentity(initial, {
      labels: {
        'com.docker.compose.project': 'portable',
        alpha: 'first',
        'com.docker.compose.volume': 'postgres_data',
        zeta: 'last',
      },
      userIds: ['a'.repeat(64), 'b'.repeat(64)],
    });
    const { result } = prepareWithSources(initial, verified);
    await expect(result).resolves.toMatchObject({ source: source() });
  });

  it.each([
    ['added label', { added: 'value' }, undefined],
    ['removed label', undefined, 'extra'],
    ['changed label', { extra: 'changed' }, undefined],
  ] as const)('rejects %s during revalidation', async (_name, add, remove) => {
    const initial = withPostgresIdentity(internalSource(), {
      labels: {
        ...internalSource().volumeIdentities.postgres.labels,
        extra: 'stable',
      },
    });
    const verified = withPostgresIdentity(initial, {
      labels: remove
        ? withoutLabel(initial.volumeIdentities.postgres.labels, remove)
        : { ...initial.volumeIdentities.postgres.labels, ...add },
    });
    const { f, result } = prepareWithSources(initial, verified);
    await expect(result).rejects.toMatchObject({ code: 'source-changed' });
    expect(removals(f)).toHaveLength(1);
  });

  it.each(['added', 'removed'] as const)(
    'rejects an %s volume user',
    async (change) => {
      const initial = withPostgresIdentity(internalSource(), {
        userIds: ['a'.repeat(64)],
      });
      const verified = withPostgresIdentity(initial, {
        userIds: change === 'added' ? ['a'.repeat(64), 'b'.repeat(64)] : [],
      });
      const { f, result } = prepareWithSources(initial, verified);
      await expect(result).rejects.toMatchObject({ code: 'source-changed' });
      expect(removals(f)).toHaveLength(1);
    },
  );

  it('keeps the lease source public and ignores diagnostic client version changes', async () => {
    const f = fixture();
    const initial = withPostgresIdentity(internalSource(), {
      labels: {
        ...internalSource().volumeIdentities.postgres.labels,
        'internal-extra-label': 'internal-extra-label-value',
      },
    });
    const verified = {
      ...initial,
      platform: Object.freeze({ ...initial.platform, clientVersion: '40.0.0' }),
    };
    const discoverInternal = jest
      .fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(verified);
    const lease = await preparePortableMaintenance(options, {
      ...f.dependencies,
      discover: undefined,
      discoverInternal,
    });
    expect(lease.source).toEqual(source());
    expect(JSON.stringify(lease)).not.toContain(
      initial.volumeIdentities.postgres.mountpoint,
    );
    expect(JSON.stringify(lease)).not.toContain('internal-extra-label');
  });
});

describe('lease release', () => {
  it('inspects before removing by exact ID and supports double release', async () => {
    const f = fixture();
    const lease = await f.prepare();
    f.execute.mockClear();
    expect(await lease.release()).toEqual({ released: true });
    expect(f.execute.mock.calls.map(([r]) => r.args)).toEqual([
      ['container', 'ls', '--all', '--no-trunc', '--format', '{{json .}}'],
      ['container', 'inspect', lockId],
      ['container', 'rm', lockId],
    ]);
    f.execute.mockClear();
    expect(await lease.release()).toEqual({ released: true });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('shares concurrent release attempts', async () => {
    const f = fixture();
    const lease = await f.prepare();
    await Promise.all([lease.release(), lease.release()]);
    expect(removals(f)).toHaveLength(1);
  });
  it('accepts already absent ID and name without deletion', async () => {
    const f = fixture();
    const lease = await f.prepare();
    f.state.present = false;
    expect(await lease.release()).toEqual({ released: true });
    expect(removals(f)).toHaveLength(0);
  });
  it('never removes a replacement ID under the same name', async () => {
    const f = fixture();
    const lease = await f.prepare();
    f.state.container.Id = 'f'.repeat(64);
    expect(await lease.release()).toEqual({
      released: false,
      error: 'lock-invalid',
    });
    expect(removals(f)).toHaveLength(0);
  });
  it('never removes a renamed lock', async () => {
    const f = fixture();
    const lease = await f.prepare();
    f.state.container.Name = '/different';
    expect(await lease.release()).toEqual({
      released: false,
      error: 'lock-invalid',
    });
    expect(removals(f)).toHaveLength(0);
  });
  it('never removes modified ownership labels', async () => {
    const f = fixture();
    const lease = await f.prepare();
    f.state.container.Config.Labels['org.jobtracker.maintenance.operation'] =
      'other';
    expect(await lease.release()).toEqual({
      released: false,
      error: 'lock-invalid',
    });
    expect(removals(f)).toHaveLength(0);
  });
  it('returns cleanup failure and permits an explicit retry', async () => {
    const f = fixture();
    const lease = await f.prepare();
    f.state.removeExit = 1;
    expect(await lease.release()).toEqual({
      released: false,
      error: 'cleanup-failed',
    });
    f.state.removeExit = 0;
    expect(await lease.release()).toEqual({ released: true });
  });
  it('does not confuse a daemon listing failure with absence', async () => {
    const f = fixture();
    const lease = await f.prepare();
    f.state.listExit = 1;
    expect(await lease.release()).toEqual({
      released: false,
      error: 'cleanup-failed',
    });
    expect(removals(f)).toHaveLength(0);
  });
  it('contains no environment, credentials or raw image metadata', async () => {
    const f = fixture();
    const lease = await f.prepare();
    const serialized = JSON.stringify(lease);
    for (const value of [
      secret,
      'DATABASE_URL',
      'POSTGRES_PASSWORD',
      'Env',
      'Config',
    ])
      expect(serialized).not.toContain(value);
  });
});

describe('architecture with the actual preflight and simulated Docker', () => {
  it('does not pollute Compose discovery and never requests data access', async () => {
    const f = fixture();
    const original = f.execute.getMockImplementation()!;
    f.execute.mockImplementation((r) => {
      const a = r.args;
      let value: unknown;
      if (a[0] === 'context' && a[1] === 'show')
        return Promise.resolve({
          stdout: 'default\n',
          stderr: '',
          exitCode: 0,
        });
      if (a[0] === 'context')
        value = {
          Name: 'default',
          Endpoints: {
            docker: {
              Host: 'unix:///var/run/docker.sock',
              SkipTLSVerify: false,
            },
          },
        };
      else if (a[0] === 'version')
        value = {
          Client: { Version: '31.0.0' },
          Server: {
            Version: '29.8.1',
            ApiVersion: '1.56',
            Os: 'linux',
            Arch: 'amd64',
          },
        };
      else if (a[0] === 'info')
        value = {
          ServerVersion: '29.8.1',
          OSType: 'linux',
          Architecture: 'x86_64',
          OperatingSystem: 'Ubuntu 24.04.5 LTS',
          KernelVersion: '6.8.0-137-generic',
          DockerRootDir: '/var/lib/docker',
          SecurityOptions: ['name=seccomp,profile=builtin'],
          Name: 'native-host',
        };
      else if (a[0] === 'compose')
        value = {
          name: 'portable',
          volumes: {
            postgres_data: { name: 'resolved-pg' },
            uploads_data: { name: 'resolved-files' },
          },
          services: {
            postgres: {
              volumes: [
                {
                  type: 'volume',
                  source: 'postgres_data',
                  target: '/var/lib/postgresql/data',
                },
              ],
            },
            backend: {
              volumes: [
                {
                  type: 'volume',
                  source: 'uploads_data',
                  target: '/app/apps/backend/uploads',
                },
              ],
            },
            frontend: {},
            migrate: {},
          },
        };
      else if (a[0] === 'volume' && a[1] === 'ls')
        return Promise.resolve({
          stdout: '"resolved-pg"\n"resolved-files"\n',
          stderr: '',
          exitCode: 0,
        });
      else if (a[0] === 'volume' && a[1] === 'inspect')
        value = [
          {
            Name: a[2],
            Driver: 'local',
            Scope: 'local',
            Options: null,
            Labels: {
              'com.docker.compose.project': 'portable',
              'com.docker.compose.volume':
                a[2] === 'resolved-pg' ? 'postgres_data' : 'uploads_data',
            },
            Mountpoint: `/var/lib/docker/volumes/${a[2]}/_data`,
          },
        ];
      else if (a[0] === 'ps') {
        // The lock has no Compose labels or mounts, so neither filter selects it.
        expect(f.state.container.Config.Labels).not.toHaveProperty(
          'com.docker.compose.project',
        );
        expect(f.state.container.Mounts).toEqual([]);
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      } else return original(r);
      return Promise.resolve({
        stdout: JSON.stringify(value),
        stderr: '',
        exitCode: 0,
      });
    });
    const lease = await preparePortableMaintenance(options, {
      ...f.dependencies,
      discover: discoverPortableSource,
    });
    expect(lease.source.services).toEqual({
      postgres: null,
      backend: null,
      frontend: null,
      migrate: [],
    });
    expect(f.state.present).toBe(true);
    await lease.release();
    for (const [r] of f.execute.mock.calls) {
      for (const forbidden of [
        '--mount',
        '--volume',
        '-v',
        'pg_dump',
        'PG_VERSION',
        'initdb',
        'start',
        'stop',
        'run',
        'exec',
        'pull',
      ])
        expect(r.args).not.toContain(forbidden);
      expect(
        r.args.some(
          (arg) => arg.includes('type=volume') || arg.includes('type=bind'),
        ),
      ).toBe(false);
    }
    expect(
      f.execute.mock.calls.filter(([r]) => r.args[0] === 'compose'),
    ).toHaveLength(2);
  });
});

describe('proxy neutralization and ambiguous creation recovery', () => {
  it.each(['http://user:password@proxy:3128', 'http://proxy:3128'])(
    'explicit empty arguments override configured proxy %s',
    async (proxy) => {
      const f = fixture();
      const original = f.execute.getMockImplementation()!;
      f.execute.mockImplementation((r) => {
        if (r.args[0] === 'create') {
          // Model only the documented precedence, not Docker integration.
          const effective = Object.fromEntries(
            proxyKeys.map((key) => [key, proxy]),
          );
          for (let i = 0; i < r.args.length; i++)
            if (r.args[i] === '--env') {
              const entry = r.args[++i];
              expect(entry).toMatch(/^[A-Za-z_]+=$/);
              effective[entry.slice(0, -1)] = '';
            }
          expect(Object.values(effective)).toEqual(proxyKeys.map(() => ''));
          f.state.container.Config.Env = [
            ...f.image.Config.Env,
            ...Object.entries(effective).map(([k, v]) => `${k}=${v}`),
          ].reverse();
        }
        return original(r);
      });
      const lease = await f.prepare();
      expect(JSON.stringify(lease)).not.toContain(proxy);
      expect(JSON.stringify(f.state.container)).not.toContain(proxy);
    },
  );
  it.each([
    'HTTP_PROXY',
    'http_proxy',
    'duplicate',
    'unexpected',
    'malformed',
    'missing',
  ])(
    'rejects invalid environment %s without values in errors',
    async (kind) => {
      const f = fixture();
      if (kind === 'duplicate')
        f.state.container.Config.Env.push(`HTTP_PROXY=${secret}`);
      else if (kind === 'unexpected')
        f.state.container.Config.Env.push(`EXTRA=${secret}`);
      else if (kind === 'malformed')
        Object.assign(f.state.container.Config, { Env: [null] });
      else if (kind === 'missing') f.state.container.Config.Env.pop();
      else
        f.state.container.Config.Env = f.state.container.Config.Env.map((v) =>
          v === `${kind}=` ? `${kind}=${secret}` : v,
        );
      const error = await f.prepare().catch((e: unknown) => e);
      expect(error).toMatchObject({ code: 'lock-invalid' });
      expect(JSON.stringify(error)).not.toContain(secret);
      expect((error as Error).message).not.toContain(secret);
    },
  );
  function ambiguous(f: ReturnType<typeof fixture>, mode = 'throw') {
    const original = f.execute.getMockImplementation()!;
    f.execute.mockImplementation(async (r) => {
      const result = await original(r);
      if (r.args[0] === 'create') {
        if (mode === 'throw') throw new Error(secret);
        if (mode === 'signal') return { ...result, exitCode: null };
        return { ...result, stdout: '' };
      }
      return result;
    });
  }
  it.each(['throw', 'signal', 'missing-id'])(
    'recovers own lock after %s, reinspects and removes by ID',
    async (mode) => {
      const f = fixture();
      ambiguous(f, mode);
      const error = await f.prepare().catch((e: unknown) => e);
      expect(error).toMatchObject({
        code: mode === 'missing-id' ? 'lock-invalid' : 'docker-runner',
      });
      expect(
        (error as { cleanupFailure?: string }).cleanupFailure,
      ).toBeUndefined();
      expect(f.execute.mock.calls.slice(-3).map(([r]) => r.args)).toEqual([
        ['container', 'inspect', lockName],
        ['container', 'inspect', lockId],
        ['container', 'rm', lockId],
      ]);
    },
  );
  it.each([
    'operation',
    'date',
    'image',
    'state',
    'env',
    'multiple',
    'absent',
    'second-inspection',
  ])('does not remove ambiguous candidate with %s mismatch', async (kind) => {
    const f = fixture();
    ambiguous(f);
    if (kind === 'operation')
      f.state.container.Config.Labels['org.jobtracker.maintenance.operation'] =
        'other';
    if (kind === 'date')
      f.state.container.Config.Labels['org.jobtracker.maintenance.created-at'] =
        'other';
    if (kind === 'image') f.state.container.Image = 'sha256:' + 'f'.repeat(64);
    if (kind === 'state') f.state.container.State.StartedAt = date;
    if (kind === 'env') f.state.container.Config.Env.push('HTTP_PROXY=secret');
    if (kind === 'absent') f.state.inspectExit = 1;
    const original = f.execute.getMockImplementation()!;
    f.execute.mockImplementation(async (r) => {
      if (r.args[1] === 'inspect' && r.args[0] === 'container') {
        if (kind === 'multiple')
          return {
            stdout: JSON.stringify([lock(), lock()]),
            stderr: '',
            exitCode: 0,
          };
        if (kind === 'second-inspection' && r.args[2] === lockId)
          return { stdout: '[]', stderr: '', exitCode: 0 };
      }
      return original(r);
    });
    await expect(f.prepare()).rejects.toMatchObject({
      cleanupFailure: 'ownership-unconfirmed',
    });
    expect(removals(f)).toHaveLength(0);
  });
  it('does not recover an explicit nonzero create conflict', async () => {
    const f = fixture();
    f.state.createExit = 1;
    await expect(f.prepare()).rejects.toMatchObject({ code: 'docker-runner' });
    expect(
      f.execute.mock.calls.some(
        ([r]) => r.args[0] === 'container' && r.args[1] === 'inspect',
      ),
    ).toBe(false);
  });
  it('reports recovered lock removal failure separately', async () => {
    const f = fixture();
    ambiguous(f);
    f.state.removeExit = 1;
    await expect(f.prepare()).rejects.toMatchObject({
      code: 'docker-runner',
      cleanupFailure: 'cleanup-failed',
    });
  });
});
