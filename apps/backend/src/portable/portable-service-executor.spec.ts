import {
  createPortableServiceExecutor,
  PortableServiceExecutionError,
} from './portable-service-executor';
import {
  createPortableServicePlan,
  initialPortableServiceTransitions,
  type PortableServiceTransitions,
} from './portable-service-plan';
import type {
  ContainerSnapshot,
  DockerExecutor,
  InternalContainerIdentity,
  InternalSourceDiscovery,
} from './portable-preflight';

const secret = 'POSTGRES_SECRET_SENTINEL';
const ids = {
  postgres: 'a'.repeat(64),
  backend: 'b'.repeat(64),
  frontend: 'c'.repeat(64),
};

function identity(
  service: 'postgres' | 'backend' | 'frontend',
  state: 'running' | 'exited',
): InternalContainerIdentity {
  return {
    id: ids[service],
    name: `/portable-${service}`,
    service,
    state,
    imageId: `sha256:${ids[service]}`,
    labels: {
      'com.docker.compose.oneoff': 'False',
      'com.docker.compose.project': 'portable',
      'com.docker.compose.service': service,
    },
    mounts:
      service === 'frontend'
        ? []
        : [
            {
              type: 'volume',
              name: service === 'postgres' ? 'portable-pg' : 'portable-uploads',
              destination:
                service === 'postgres'
                  ? '/var/lib/postgresql/data'
                  : '/app/apps/backend/uploads',
              readWrite: true,
            },
          ],
    networks: [
      {
        name: 'portable_default',
        id: 'd'.repeat(64),
        aliases: [service],
      },
    ],
    restartPolicy: { name: 'unless-stopped', maximumRetryCount: 0 },
    entrypoint: ['/entrypoint'],
    command: ['run', service],
    healthcheck: { Test: ['CMD', 'healthcheck'] },
  };
}

function snapshot(value: InternalContainerIdentity): ContainerSnapshot {
  return {
    id: value.id,
    service: value.service,
    projectName: 'portable',
    oneOff: false,
    state: value.state,
    running: value.state === 'running',
    health: value.state === 'running' ? 'healthy' : null,
    mounts: value.mounts,
    networks: value.networks,
  };
}

function source(
  postgresState: 'running' | 'exited' = 'running',
  backendState: 'running' | 'exited' = 'running',
  frontendState: 'running' | 'exited' = 'running',
): InternalSourceDiscovery {
  const postgres = identity('postgres', postgresState);
  const backend = identity('backend', backendState);
  const frontend = identity('frontend', frontendState);
  const volume = (
    logicalName: 'postgres_data' | 'uploads_data',
    physicalName: string,
    userId: string,
  ) => ({
    logicalName,
    physicalName,
    driver: 'local' as const,
    scope: 'local' as const,
    labels: {
      'com.docker.compose.project': 'portable',
      'com.docker.compose.volume': logicalName,
    },
    options: {},
    mountpoint: `/var/lib/docker/volumes/${physicalName}/_data`,
    dockerRootDir: '/var/lib/docker',
    userIds: [userId],
  });
  return {
    publicSnapshot: {
      projectName: 'portable',
      projectRoot: '/project',
      composeFile: '/project/compose.yaml',
      volumes: {
        postgres: {
          logicalName: 'postgres_data',
          physicalName: 'portable-pg',
          driver: 'local',
        },
        uploads: {
          logicalName: 'uploads_data',
          physicalName: 'portable-uploads',
          driver: 'local',
        },
      },
      services: {
        postgres: snapshot(postgres),
        backend: snapshot(backend),
        frontend: snapshot(frontend),
        migrate: [],
      },
    },
    platform: {
      context: 'default',
      endpoint: 'local-unix-default',
      engineVersion: '29.8.1',
      serverApiVersion: '1.56',
      osType: 'linux',
      architecture: 'amd64',
      dockerRootDir: '/var/lib/docker',
      rootless: false,
      clientVersion: '31.0.0',
    },
    volumeIdentities: {
      postgres: volume('postgres_data', 'portable-pg', postgres.id),
      uploads: volume('uploads_data', 'portable-uploads', backend.id),
    },
    serviceIdentities: { postgres, backend, frontend, migrate: [] },
    postgresCredentials: {
      database: 'jobtracker',
      user: 'jobtracker',
      password: secret,
    },
  };
}

function withState(
  input: InternalSourceDiscovery,
  service: 'postgres' | 'backend' | 'frontend',
  state: 'running' | 'exited' | 'created',
): InternalSourceDiscovery {
  const internal = input.serviceIdentities[service]!;
  const publicValue = input.publicSnapshot.services[service]!;
  return {
    ...input,
    serviceIdentities: {
      ...input.serviceIdentities,
      [service]: { ...internal, state },
    },
    publicSnapshot: {
      ...input.publicSnapshot,
      services: {
        ...input.publicSnapshot.services,
        [service]: {
          ...publicValue,
          state,
          running: state === 'running',
        },
      },
    },
  };
}

function fixture(
  postgresState: 'running' | 'exited' = 'running',
  backendState: 'running' | 'exited' = 'running',
  frontendState: 'running' | 'exited' = 'running',
) {
  const initial = source(postgresState, backendState, frontendState);
  const plan = createPortableServicePlan(initial);
  let current = structuredClone(initial);
  let behavior: Readonly<{
    apply: boolean;
    exitCode: number | null;
    throws: boolean;
    state?: 'created';
    alter?: (value: InternalSourceDiscovery) => InternalSourceDiscovery;
  }> = { apply: true, exitCode: 0, throws: false };
  const discoveries: string[] = [];
  const discover = jest.fn(() => {
    discoveries.push('discover');
    return Promise.resolve(structuredClone(current));
  });
  const execute = jest.fn<
    ReturnType<DockerExecutor>,
    Parameters<DockerExecutor>
  >((request) => {
    const args = request.args;
    const action = args[1];
    if (args[0] !== 'container' || (action !== 'stop' && action !== 'start'))
      throw new Error('unexpected command');
    const id = args.at(-1)!;
    const service = Object.entries(ids).find(
      ([, value]) => value === id,
    )?.[0] as 'postgres' | 'backend' | 'frontend' | undefined;
    if (!service) throw new Error('name target forbidden');
    if (behavior.apply)
      current = withState(
        current,
        service,
        behavior.state ?? (action === 'stop' ? 'exited' : 'running'),
      );
    if (behavior.alter) current = behavior.alter(current);
    if (behavior.throws) throw new Error(secret);
    return Promise.resolve({
      stdout: secret,
      stderr: secret,
      exitCode: behavior.exitCode,
    });
  });
  const transitions = initialPortableServiceTransitions(plan);
  const create = (value: PortableServiceTransitions = transitions) =>
    createPortableServiceExecutor({
      plan,
      transitions: value,
      source: initial,
      execute,
      env: { PATH: '/bin', POSTGRES_PASSWORD: secret },
      stopTimeoutSeconds: 20,
      discover: discover as never,
    });
  return {
    initial,
    plan,
    transitions,
    execute,
    discover,
    discoveries,
    create,
    behavior(value: typeof behavior) {
      behavior = value;
    },
  };
}

function commands(
  f: ReturnType<typeof fixture>,
): readonly (readonly string[])[] {
  return f.execute.mock.calls.map(([request]) => request.args);
}

describe('controlled Portable service transitions', () => {
  it('stops frontend then backend by exact ID with an explicit timeout', async () => {
    const f = fixture();
    const executor = f.create();
    await executor.quiesceApplication();
    expect(commands(f)).toEqual([
      ['container', 'stop', '--timeout', '20', ids.frontend],
      ['container', 'stop', '--timeout', '20', ids.backend],
    ]);
    expect(executor.transitions).toMatchObject({
      frontendStoppedByUs: true,
      backendStoppedByUs: true,
    });
  });

  it('never stops backend before frontend is confirmed quiescent', async () => {
    const f = fixture();
    f.behavior({ apply: false, exitCode: 1, throws: false });
    await expect(f.create().quiesceApplication()).rejects.toMatchObject({
      code: 'stop-not-confirmed',
    });
    expect(commands(f)).toHaveLength(1);
    expect(commands(f)[0].at(-1)).toBe(ids.frontend);
  });

  it('starts initially exited postgres only after application quiescence', async () => {
    const f = fixture('exited');
    const executor = f.create();
    await expect(executor.ensurePostgresRunning()).rejects.toMatchObject({
      code: 'transition-invalid',
    });
    await executor.quiesceApplication();
    await executor.ensurePostgresRunning();
    expect(commands(f).at(-1)).toEqual(['container', 'start', ids.postgres]);
    expect(executor.transitions.postgresStartedByUs).toBe(true);
  });

  it('does not start initially running postgres', async () => {
    const f = fixture('running', 'exited', 'exited');
    const executor = f.create();
    await executor.ensurePostgresRunning();
    expect(commands(f)).toEqual([]);
  });

  it('accepts a nonzero stop result when rediscovery proves exited', async () => {
    const f = fixture('running', 'exited', 'running');
    f.behavior({ apply: true, exitCode: 1, throws: false });
    const executor = f.create();
    await executor.quiesceApplication();
    expect(executor.transitions.frontendStoppedByUs).toBe(true);
  });

  it('fails closed after an ambiguous stop when observation is unchanged', async () => {
    const f = fixture('running', 'exited', 'running');
    f.behavior({ apply: false, exitCode: null, throws: true });
    const executor = f.create();
    await expect(executor.quiesceApplication()).rejects.toMatchObject({
      code: 'stop-not-confirmed',
    });
    expect(f.discover).toHaveBeenCalled();
  });

  it('fails closed when start fails and postgres remains exited', async () => {
    const f = fixture('exited', 'exited', 'exited');
    f.behavior({ apply: false, exitCode: 1, throws: false });
    await expect(f.create().ensurePostgresRunning()).rejects.toMatchObject({
      code: 'start-not-confirmed',
    });
  });

  it('refuses concrete created after stop', async () => {
    const f = fixture('running', 'exited', 'running');
    f.behavior({ apply: true, exitCode: 0, throws: false, state: 'created' });
    await expect(f.create().quiesceApplication()).rejects.toMatchObject({
      code: 'stop-not-confirmed',
    });
  });

  it.each([
    [
      'container ID',
      (value: InternalSourceDiscovery) => ({
        ...value,
        serviceIdentities: {
          ...value.serviceIdentities,
          frontend: {
            ...value.serviceIdentities.frontend!,
            id: 'e'.repeat(64),
          },
        },
        publicSnapshot: {
          ...value.publicSnapshot,
          services: {
            ...value.publicSnapshot.services,
            frontend: {
              ...value.publicSnapshot.services.frontend!,
              id: 'e'.repeat(64),
            },
          },
        },
      }),
    ],
    [
      'network ID',
      (value: InternalSourceDiscovery) => ({
        ...value,
        serviceIdentities: {
          ...value.serviceIdentities,
          frontend: {
            ...value.serviceIdentities.frontend!,
            networks: [
              {
                ...value.serviceIdentities.frontend!.networks[0],
                id: 'e'.repeat(64),
              },
            ],
          },
        },
      }),
    ],
    [
      'image',
      (value: InternalSourceDiscovery) => ({
        ...value,
        serviceIdentities: {
          ...value.serviceIdentities,
          frontend: {
            ...value.serviceIdentities.frontend!,
            imageId: `sha256:${'e'.repeat(64)}`,
          },
        },
      }),
    ],
    [
      'labels',
      (value: InternalSourceDiscovery) => ({
        ...value,
        serviceIdentities: {
          ...value.serviceIdentities,
          frontend: {
            ...value.serviceIdentities.frontend!,
            labels: {
              ...value.serviceIdentities.frontend!.labels,
              extra: 'true',
            },
          },
        },
      }),
    ],
    [
      'restart policy',
      (value: InternalSourceDiscovery) => ({
        ...value,
        serviceIdentities: {
          ...value.serviceIdentities,
          frontend: {
            ...value.serviceIdentities.frontend!,
            restartPolicy: { name: 'always', maximumRetryCount: 0 },
          },
        },
      }),
    ],
    [
      'mount',
      (value: InternalSourceDiscovery) => ({
        ...value,
        serviceIdentities: {
          ...value.serviceIdentities,
          frontend: {
            ...value.serviceIdentities.frontend!,
            mounts: [
              {
                type: 'volume' as const,
                name: 'unexpected',
                destination: '/unexpected',
                readWrite: true as const,
              },
            ],
          },
        },
      }),
    ],
    [
      'volume',
      (value: InternalSourceDiscovery) => ({
        ...value,
        volumeIdentities: {
          ...value.volumeIdentities,
          uploads: { ...value.volumeIdentities.uploads, mountpoint: '/other' },
        },
      }),
    ],
    [
      'credentials',
      (value: InternalSourceDiscovery) => ({
        ...value,
        postgresCredentials: {
          ...value.postgresCredentials,
          password: 'changed-secret',
        },
      }),
    ],
  ] as const)('refuses changed %s after mutation', async (_name, alter) => {
    const f = fixture('running', 'exited', 'running');
    f.behavior({ apply: true, exitCode: 0, throws: false, alter });
    const error = await f
      .create()
      .quiesceApplication()
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ code: 'source-changed' });
    expect(JSON.stringify(error)).not.toContain(secret);
  });

  it('restores only confirmed changes in postgres/backend/frontend order', async () => {
    const f = fixture('exited');
    const executor = f.create();
    await executor.quiesceApplication();
    await executor.ensurePostgresRunning();
    await executor.restore();
    expect(commands(f).slice(-3)).toEqual([
      ['container', 'stop', '--timeout', '20', ids.postgres],
      ['container', 'start', ids.backend],
      ['container', 'start', ids.frontend],
    ]);
    expect(executor.transitions).toEqual({
      frontendStoppedByUs: false,
      backendStoppedByUs: false,
      postgresStartedByUs: false,
    });
  });

  it('never restores a service that was not changed by us', async () => {
    const f = fixture('running', 'exited', 'exited');
    const executor = f.create();
    await executor.quiesceApplication();
    await executor.ensurePostgresRunning();
    await executor.restore();
    expect(commands(f)).toEqual([]);
  });

  it('rediscovers and fails closed after ambiguous restoration', async () => {
    const f = fixture('exited');
    const executor = f.create();
    await executor.quiesceApplication();
    await executor.ensurePostgresRunning();
    f.behavior({ apply: false, exitCode: null, throws: true });
    const before = f.discover.mock.calls.length;
    await expect(executor.restore()).rejects.toMatchObject({
      code: 'restoration-not-confirmed',
    });
    expect(f.discover.mock.calls.length).toBeGreaterThan(before);
  });

  it('rejects forged or cloned transition state', () => {
    const f = fixture();
    const forged = structuredClone(f.transitions);
    expect(() => f.create(forged)).toThrow(PortableServiceExecutionError);
  });

  it('never uses Compose, service names, or secrets in public errors', async () => {
    const f = fixture('running', 'exited', 'running');
    f.behavior({ apply: false, exitCode: null, throws: true });
    const error = await f
      .create()
      .quiesceApplication()
      .catch((value: unknown) => value);
    expect(JSON.stringify(commands(f))).not.toContain('compose');
    expect(commands(f).flat()).not.toContain('frontend');
    expect(JSON.stringify(error) + (error as Error).message).not.toContain(
      secret,
    );
  });
});
