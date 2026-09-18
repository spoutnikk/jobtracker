/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import {
  assertPortableServiceObservation,
  createPortableServicePlan,
  initialPortableServiceTransitions,
  PortableServicePlanError,
  postgresCredentialsForPlan,
  recordPortableServiceTransition,
  type PortableServiceTransitions,
} from './portable-service-plan';
import type {
  ContainerSnapshot,
  InternalContainerIdentity,
  InternalSourceDiscovery,
} from './portable-preflight';

const secret = 'POSTGRES_SECRET_SENTINEL';
const root = '/var/lib/docker';

function service(
  name: 'postgres' | 'backend' | 'frontend' | 'migrate',
  digit: string,
  state: 'running' | 'exited' | 'created' = 'running',
): InternalContainerIdentity {
  const mount =
    name === 'postgres'
      ? [
          {
            type: 'volume' as const,
            name: 'private-pg',
            destination: '/var/lib/postgresql/data',
            readWrite: true as const,
          },
        ]
      : name === 'backend'
        ? [
            {
              type: 'volume' as const,
              name: 'private-uploads',
              destination: '/app/apps/backend/uploads',
              readWrite: true as const,
            },
          ]
        : [];
  return {
    id: digit.repeat(64),
    name: `/portable-${name}-${digit}`,
    service: name,
    state,
    imageId: `sha256:${digit.repeat(64)}`,
    labels: {
      'com.docker.compose.oneoff': name === 'migrate' ? 'True' : 'False',
      'com.docker.compose.project': 'portable',
      'com.docker.compose.service': name,
    },
    mounts: mount,
    networks: [
      { name: 'portable_default', id: 'f'.repeat(64), aliases: [name] },
    ],
    restartPolicy: {
      name: name === 'migrate' ? 'no' : 'unless-stopped',
      maximumRetryCount: 0,
    },
    entrypoint: ['/entrypoint'],
    command: ['run', name],
    healthcheck: { Interval: 5_000_000_000, Test: ['CMD', 'healthcheck'] },
  };
}

function publicContainer(
  identity: InternalContainerIdentity,
): ContainerSnapshot {
  return {
    id: identity.id,
    service: identity.service,
    projectName: 'portable',
    oneOff: identity.service === 'migrate',
    state: identity.state,
    running: identity.state === 'running',
    health: identity.state === 'running' ? 'healthy' : null,
    mounts: identity.mounts,
    networks: identity.networks,
  };
}

function source(
  postgresState: 'running' | 'exited' | 'created' = 'running',
): InternalSourceDiscovery {
  const postgres = service('postgres', 'a', postgresState);
  const backend = service('backend', 'b');
  const frontend = service('frontend', 'c');
  const migrate = service('migrate', 'd', 'exited');
  const volume = (
    logicalName: 'postgres_data' | 'uploads_data',
    physicalName: string,
    users: string[],
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
    dockerRootDir: root,
    userIds: users,
  });
  return {
    publicSnapshot: {
      projectName: 'portable',
      projectRoot: '/project',
      composeFile: '/project/compose.yaml',
      volumes: {
        postgres: {
          logicalName: 'postgres_data',
          physicalName: 'private-pg',
          driver: 'local',
        },
        uploads: {
          logicalName: 'uploads_data',
          physicalName: 'private-uploads',
          driver: 'local',
        },
      },
      services: {
        postgres: publicContainer(postgres),
        backend: publicContainer(backend),
        frontend: publicContainer(frontend),
        migrate: [publicContainer(migrate)],
      },
    },
    platform: {
      context: 'default',
      endpoint: 'local-unix-default',
      engineVersion: '29.8.1',
      serverApiVersion: '1.56',
      osType: 'linux',
      architecture: 'amd64',
      dockerRootDir: root,
      rootless: false,
      clientVersion: '31.0.0',
    },
    volumeIdentities: {
      postgres: volume('postgres_data', 'private-pg', [postgres.id]),
      uploads: volume('uploads_data', 'private-uploads', [backend.id]),
    },
    serviceIdentities: { postgres, backend, frontend, migrate: [migrate] },
    postgresCredentials: {
      database: 'jobtracker',
      user: 'jobtracker',
      password: secret,
    },
  };
}

function changed(input: InternalSourceDiscovery): InternalSourceDiscovery {
  return structuredClone(input);
}

function withServiceState(
  input: InternalSourceDiscovery,
  target: 'postgres' | 'backend' | 'frontend',
  state: 'running' | 'exited' | 'created',
): InternalSourceDiscovery {
  const identity = input.serviceIdentities[target];
  const snapshot = input.publicSnapshot.services[target];
  if (!identity || !snapshot) throw new Error('missing test service');
  return {
    ...input,
    publicSnapshot: {
      ...input.publicSnapshot,
      services: {
        ...input.publicSnapshot.services,
        [target]: { ...snapshot, state, running: state === 'running' },
      },
    },
    serviceIdentities: {
      ...input.serviceIdentities,
      [target]: { ...identity, state },
    },
  };
}

function withoutPostgres(
  input: InternalSourceDiscovery,
): InternalSourceDiscovery {
  return {
    ...input,
    publicSnapshot: {
      ...input.publicSnapshot,
      services: { ...input.publicSnapshot.services, postgres: null },
    },
    serviceIdentities: { ...input.serviceIdentities, postgres: null },
  };
}

function withPostgresLabels(
  input: InternalSourceDiscovery,
  labels: Readonly<Record<string, string>>,
): InternalSourceDiscovery {
  const postgres = input.serviceIdentities.postgres;
  if (!postgres) throw new Error('missing test postgres');
  return {
    ...input,
    serviceIdentities: {
      ...input.serviceIdentities,
      postgres: { ...postgres, labels },
    },
  };
}

function withAddedMigration(
  input: InternalSourceDiscovery,
  migration: InternalContainerIdentity,
): InternalSourceDiscovery {
  return {
    ...input,
    publicSnapshot: {
      ...input.publicSnapshot,
      services: {
        ...input.publicSnapshot.services,
        migrate: [
          ...input.publicSnapshot.services.migrate,
          publicContainer(migration),
        ],
      },
    },
    serviceIdentities: {
      ...input.serviceIdentities,
      migrate: [...input.serviceIdentities.migrate, migration],
    },
  };
}

function withMigrationState(
  input: InternalSourceDiscovery,
  index: number,
  state: 'running' | 'exited',
): InternalSourceDiscovery {
  const identity = input.serviceIdentities.migrate[index];
  const snapshot = input.publicSnapshot.services.migrate[index];
  if (!identity || !snapshot) throw new Error('missing test migration');
  return {
    ...input,
    publicSnapshot: {
      ...input.publicSnapshot,
      services: {
        ...input.publicSnapshot.services,
        migrate: input.publicSnapshot.services.migrate.map((value, position) =>
          position === index
            ? { ...snapshot, state, running: state === 'running' }
            : value,
        ),
      },
    },
    serviceIdentities: {
      ...input.serviceIdentities,
      migrate: input.serviceIdentities.migrate.map((value, position) =>
        position === index ? { ...identity, state } : value,
      ),
    },
  };
}

function rejected(action: () => unknown, code = 'source-changed') {
  let error: unknown;
  try {
    action();
  } catch (value) {
    error = value;
  }
  expect(error).toBeInstanceOf(PortableServicePlanError);
  expect(error).toMatchObject({ code });
  expect((error as Error).message).not.toContain(secret);
  expect(JSON.stringify(error)).not.toContain(secret);
}

describe('initial Portable service plan', () => {
  it.each(['running', 'exited'] as const)(
    'accepts postgres %s and retains qualified identity',
    (state) => {
      const plan = createPortableServicePlan(source(state));
      expect(plan.services.postgres).toMatchObject({
        state,
        imageId: `sha256:${'a'.repeat(64)}`,
        restartPolicy: { name: 'unless-stopped', maximumRetryCount: 0 },
        entrypoint: ['/entrypoint'],
        command: ['run', 'postgres'],
        healthcheck: { Test: ['CMD', 'healthcheck'] },
      });
      expect(plan.services.postgres.labels['com.docker.compose.service']).toBe(
        'postgres',
      );
      expect(plan.services.postgres.mounts).toHaveLength(1);
      expect(plan.services.postgres.networks).toHaveLength(1);
    },
  );

  it.each(['absent', 'created'] as const)('refuses postgres %s', (kind) => {
    const initial = source(kind === 'created' ? 'created' : 'running');
    const observation = kind === 'absent' ? withoutPostgres(initial) : initial;
    return rejected(
      () => createPortableServicePlan(observation),
      'service-state-invalid',
    );
  });

  it('is deeply frozen, detached and excludes credentials from serialization', () => {
    const observation = source();
    const plan = createPortableServicePlan(observation);
    function check(value: unknown): void {
      if (!value || typeof value !== 'object') return;
      expect(Object.isFrozen(value)).toBe(true);
      for (const nested of Object.values(value)) check(nested);
    }
    check(plan);
    const laterObservation = withPostgresLabels(observation, {
      ...observation.serviceIdentities.postgres!.labels,
      changed: 'true',
    });
    expect(laterObservation.serviceIdentities.postgres!.labels).toHaveProperty(
      'changed',
    );
    expect(plan.services.postgres.labels).not.toHaveProperty('changed');
    expect(JSON.stringify(plan)).not.toContain(secret);
    expect(postgresCredentialsForPlan(plan)).toEqual({
      database: 'jobtracker',
      user: 'jobtracker',
      password: secret,
    });
  });
});

describe('Portable service transitions', () => {
  it('accepts an identical observation from the neutral state', () => {
    const observation = source();
    const plan = createPortableServicePlan(observation);
    expect(() =>
      assertPortableServiceObservation(
        plan,
        initialPortableServiceTransitions(plan),
        changed(observation),
      ),
    ).not.toThrow();
  });

  it.each([
    [
      'literal',
      () => ({
        frontendStoppedByUs: false,
        backendStoppedByUs: false,
        postgresStartedByUs: false,
      }),
    ],
    [
      'spread',
      (authentic: ReturnType<typeof initialPortableServiceTransitions>) => ({
        ...authentic,
      }),
    ],
    [
      'structured clone',
      (authentic: ReturnType<typeof initialPortableServiceTransitions>) =>
        structuredClone(authentic),
    ],
    [
      'JSON round-trip',
      (authentic: ReturnType<typeof initialPortableServiceTransitions>) =>
        JSON.parse(JSON.stringify(authentic)) as PortableServiceTransitions,
    ],
  ] as Array<
    [
      string,
      (authentic: PortableServiceTransitions) => PortableServiceTransitions,
    ]
  >)('refuses a forged transition state produced by %s', (_name, forge) => {
    const observation = source();
    const plan = createPortableServicePlan(observation);
    const authentic = initialPortableServiceTransitions(plan);
    const forged = forge(authentic);
    rejected(
      () => assertPortableServiceObservation(plan, forged, observation),
      'transition-invalid',
    );
    rejected(
      () => recordPortableServiceTransition(plan, forged, 'frontend-stopped'),
      'transition-invalid',
    );
  });

  it('binds every transition state to the exact plan that created it', () => {
    const observation = source();
    const planA = createPortableServicePlan(observation);
    const planB = createPortableServicePlan(changed(observation));
    const transitions = initialPortableServiceTransitions(planA);
    rejected(
      () => assertPortableServiceObservation(planB, transitions, observation),
      'transition-invalid',
    );
    rejected(
      () =>
        recordPortableServiceTransition(planB, transitions, 'frontend-stopped'),
      'transition-invalid',
    );
  });

  it('keeps each successor authentic and consumes its previous branch', () => {
    const initial = source('exited');
    const plan = createPortableServicePlan(initial);
    const neutral = initialPortableServiceTransitions(plan);
    const frontend = recordPortableServiceTransition(
      plan,
      neutral,
      'frontend-stopped',
    );
    const afterFrontend = withServiceState(
      changed(initial),
      'frontend',
      'exited',
    );
    expect(() =>
      assertPortableServiceObservation(plan, frontend, afterFrontend),
    ).not.toThrow();
    rejected(
      () => recordPortableServiceTransition(plan, neutral, 'backend-stopped'),
      'transition-invalid',
    );
    rejected(
      () => assertPortableServiceObservation(plan, neutral, initial),
      'transition-invalid',
    );

    const backend = recordPortableServiceTransition(
      plan,
      frontend,
      'backend-stopped',
    );
    const afterBackend = withServiceState(
      changed(afterFrontend),
      'backend',
      'exited',
    );
    expect(() =>
      assertPortableServiceObservation(plan, backend, afterBackend),
    ).not.toThrow();

    const postgres = recordPortableServiceTransition(
      plan,
      backend,
      'postgres-started',
    );
    const afterPostgres = withServiceState(
      changed(afterBackend),
      'postgres',
      'running',
    );
    expect(() =>
      assertPortableServiceObservation(plan, postgres, afterPostgres),
    ).not.toThrow();
  });

  it('accepts only the recorded frontend then backend stops', () => {
    const initial = source();
    const plan = createPortableServicePlan(initial);
    const frontend = recordPortableServiceTransition(
      plan,
      initialPortableServiceTransitions(plan),
      'frontend-stopped',
    );
    const afterFrontend = withServiceState(
      changed(initial),
      'frontend',
      'exited',
    );
    expect(() =>
      assertPortableServiceObservation(plan, frontend, afterFrontend),
    ).not.toThrow();
    const backend = recordPortableServiceTransition(
      plan,
      frontend,
      'backend-stopped',
    );
    const afterBackend = withServiceState(
      changed(afterFrontend),
      'backend',
      'exited',
    );
    expect(() =>
      assertPortableServiceObservation(plan, backend, afterBackend),
    ).not.toThrow();
  });

  it('keeps the stopped transition abstract until Docker semantics are qualified in d2', () => {
    const initial = source();
    const plan = createPortableServicePlan(initial);
    const transitions = recordPortableServiceTransition(
      plan,
      initialPortableServiceTransitions(plan),
      'frontend-stopped',
    );
    const observation = withServiceState(
      changed(initial),
      'frontend',
      'created',
    );
    expect(() =>
      assertPortableServiceObservation(plan, transitions, observation),
    ).not.toThrow();
  });

  it('accepts the abstract postgres start only after quiescence', () => {
    const initial = source('exited');
    const plan = createPortableServicePlan(initial);
    let transitions = initialPortableServiceTransitions(plan);
    transitions = recordPortableServiceTransition(
      plan,
      transitions,
      'frontend-stopped',
    );
    transitions = recordPortableServiceTransition(
      plan,
      transitions,
      'backend-stopped',
    );
    transitions = recordPortableServiceTransition(
      plan,
      transitions,
      'postgres-started',
    );
    const observation = withServiceState(
      withServiceState(
        withServiceState(changed(initial), 'frontend', 'exited'),
        'backend',
        'exited',
      ),
      'postgres',
      'running',
    );
    expect(() =>
      assertPortableServiceObservation(plan, transitions, observation),
    ).not.toThrow();
  });

  it('refuses an unrecorded state change and an incoherent transition order', () => {
    const initial = source();
    const plan = createPortableServicePlan(initial);
    const observation = withServiceState(changed(initial), 'backend', 'exited');
    rejected(() =>
      assertPortableServiceObservation(
        plan,
        initialPortableServiceTransitions(plan),
        observation,
      ),
    );
    rejected(
      () =>
        recordPortableServiceTransition(
          plan,
          initialPortableServiceTransitions(plan),
          'backend-stopped',
        ),
      'transition-invalid',
    );
  });

  it.each([
    [
      'id',
      (o: any) => {
        o.serviceIdentities.backend.id = 'e'.repeat(64);
      },
    ],
    [
      'image',
      (o: any) => {
        o.serviceIdentities.backend.imageId = `sha256:${'e'.repeat(64)}`;
      },
    ],
    [
      'label added',
      (o: any) => {
        o.serviceIdentities.backend.labels.extra = 'true';
      },
    ],
    [
      'label removed',
      (o: any) => {
        delete o.serviceIdentities.backend.labels['com.docker.compose.oneoff'];
      },
    ],
    [
      'label modified',
      (o: any) => {
        o.serviceIdentities.backend.labels['com.docker.compose.service'] =
          'other';
      },
    ],
    [
      'mount',
      (o: any) => {
        o.serviceIdentities.backend.mounts[0].destination = '/other';
      },
    ],
    [
      'restart',
      (o: any) => {
        o.serviceIdentities.backend.restartPolicy.name = 'always';
      },
    ],
    [
      'entrypoint',
      (o: any) => {
        o.serviceIdentities.backend.entrypoint = ['other'];
      },
    ],
    [
      'command',
      (o: any) => {
        o.serviceIdentities.backend.command = ['other'];
      },
    ],
    [
      'healthcheck',
      (o: any) => {
        o.serviceIdentities.backend.healthcheck.Test = ['NONE'];
      },
    ],
    [
      'network',
      (o: any) => {
        o.serviceIdentities.backend.networks[0].id = 'e'.repeat(64);
      },
    ],
  ])('refuses changed service %s', (_name, alter) => {
    const initial = source();
    const plan = createPortableServicePlan(initial);
    const observation = changed(initial);
    alter(observation);
    rejected(() =>
      assertPortableServiceObservation(
        plan,
        initialPortableServiceTransitions(plan),
        observation,
      ),
    );
  });

  it('refuses a new or active migrate', () => {
    const initial = source();
    const plan = createPortableServicePlan(initial);
    const migration = service('migrate', 'e', 'exited');
    const added = withAddedMigration(changed(initial), migration);
    rejected(() =>
      assertPortableServiceObservation(
        plan,
        initialPortableServiceTransitions(plan),
        added,
      ),
    );
    const active = withMigrationState(changed(initial), 0, 'running');
    rejected(
      () =>
        assertPortableServiceObservation(
          plan,
          initialPortableServiceTransitions(plan),
          active,
        ),
      'service-state-invalid',
    );
  });

  it.each([
    [
      'volume identity',
      (o: any) => {
        o.volumeIdentities.postgres.mountpoint = '/other';
      },
    ],
    [
      'volume user',
      (o: any) => {
        o.volumeIdentities.uploads.userIds.push('e'.repeat(64));
      },
    ],
  ])('refuses changed %s', (_name, alter) => {
    const initial = source();
    const plan = createPortableServicePlan(initial);
    const observation = changed(initial);
    alter(observation);
    rejected(() =>
      assertPortableServiceObservation(
        plan,
        initialPortableServiceTransitions(plan),
        observation,
      ),
    );
  });

  it('performs no Docker command', () => {
    const execute = jest.fn();
    const observation = source();
    const plan = createPortableServicePlan(observation);
    assertPortableServiceObservation(
      plan,
      initialPortableServiceTransitions(plan),
      observation,
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
