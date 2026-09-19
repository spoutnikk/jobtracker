/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import {
  PortablePgdataProbeError,
  probePortablePgdata,
  probePortablePgdataWithContext,
} from './portable-pgdata-orchestrator';
import {
  MaintenanceError,
  type InternalMaintenanceContext,
} from './portable-maintenance';
import type {
  DockerExecutor,
  InternalSourceDiscovery,
} from './portable-preflight';

const operationId = '12345678-1234-4234-8234-123456789abc';
const probeUuid = '87654321-4321-4321-8321-cba987654321';
const containerId = 'a'.repeat(64);
const imageId = `sha256:${'b'.repeat(64)}`;
const mountpoint = '/var/lib/docker/volumes/private-secret/_data';
const name = `portable-jobtracker-pgdata-probe-${probeUuid}`;
const secret = 'SUPER_SECRET';
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

function fixture(externalOperationId = operationId) {
  const events: string[] = [];
  const state = {
    probeUuid,
    present: false,
    started: false,
    createExit: 0 as number | null,
    createOutput: `${containerId}\n`,
    startExit: 0 as number | null,
    waitExit: 0 as number | null,
    waitOutput: '0\n',
    logsExit: 0 as number | null,
    logsOutput: '{"ok":true,"postgresMajor":17}\n',
    removeExit: 0 as number | null,
    inspectExit: 0,
  };
  const labels = {
    'org.jobtracker.maintenance.kind': 'pgdata-probe',
    'org.jobtracker.maintenance.project': 'portable',
    'org.jobtracker.maintenance.operation': externalOperationId,
  };
  const container: Record<string, any> = {
    Id: containerId,
    Name: `/${name}`,
    Image: imageId,
    Config: {
      Image: imageId,
      Labels: labels,
      Entrypoint: ['node'],
      Cmd: ['/app/portable-pgdata-probe-cli.js'],
      Env: ['PATH=/bin', ...proxyKeys.map((key) => `${key}=`)],
      Healthcheck: { Test: ['NONE'] },
      Volumes: null,
      ExposedPorts: null,
    },
    State: {
      Status: 'created',
      Running: false,
      StartedAt: '0001-01-01T00:00:00Z',
    },
    HostConfig: {
      ReadonlyRootfs: true,
      NetworkMode: 'none',
      RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
      AutoRemove: false,
      Privileged: false,
      Mounts: [
        {
          Type: 'bind',
          Source: mountpoint,
          Target: '/probe/pgdata',
          ReadOnly: true,
          BindOptions: {
            Propagation: 'rslave',
            NonRecursive: true,
            CreateMountpoint: false,
          },
        },
      ],
      Binds: null,
      VolumesFrom: null,
      Tmpfs: null,
      Devices: [],
      DeviceRequests: null,
      CapAdd: null,
      PortBindings: {},
      PublishAllPorts: false,
    },
  };
  const release = jest.fn<
    Promise<
      | { readonly released: true }
      | { readonly released: false; readonly error: 'cleanup-failed' }
    >,
    []
  >(async () => {
    events.push('release');
    return { released: true };
  });
  const context: InternalMaintenanceContext = {
    lease: {
      operationId: externalOperationId,
      source: {} as never,
      lock: { id: 'c'.repeat(64), name: 'lock' },
      release,
    },
    source: {
      publicSnapshot: {
        projectName: 'portable',
        projectRoot: '/project',
        composeFile: '/project/compose.yaml',
        volumes: {},
        services: {},
      },
      platform: {},
      volumeIdentities: { postgres: { mountpoint }, uploads: {} },
    } as InternalSourceDiscovery,
    imageId,
    env: { PATH: '/bin' },
  };
  const prepare = jest.fn(async () => context);
  const execute = jest.fn<
    ReturnType<DockerExecutor>,
    Parameters<DockerExecutor>
  >(async (request) => {
    const args = request.args;
    let stdout = '';
    let exitCode: number | null = 0;
    if (args[0] === 'container' && args[1] === 'ls') {
      stdout = state.present
        ? `${JSON.stringify({ ID: container.Id, Names: container.Name.slice(1) })}\n`
        : '';
    } else if (args[0] === 'create') {
      events.push('create');
      exitCode = state.createExit;
      stdout = state.createOutput;
      if (exitCode === 0 || exitCode === null) state.present = true;
    } else if (args[0] === 'container' && args[1] === 'inspect') {
      exitCode = state.inspectExit;
      stdout = exitCode ? '' : JSON.stringify([container]);
    } else if (args[0] === 'container' && args[1] === 'start') {
      events.push('start');
      exitCode = state.startExit;
      if (exitCode === 0) {
        state.started = true;
        container.State.Status = 'running';
        container.State.Running = true;
        container.State.StartedAt = '2026-09-18T10:00:00Z';
      }
    } else if (args[0] === 'container' && args[1] === 'wait') {
      events.push('wait');
      exitCode = state.waitExit;
      stdout = state.waitOutput;
      container.State.Status = 'exited';
      container.State.Running = false;
    } else if (args[0] === 'container' && args[1] === 'logs') {
      events.push('logs');
      exitCode = state.logsExit;
      stdout = state.logsOutput;
    } else if (args[0] === 'container' && args[1] === 'rm') {
      events.push('cleanup');
      exitCode = state.removeExit;
      if (exitCode === 0) state.present = false;
    } else throw new Error(`unexpected ${args.join(' ')}`);
    return { stdout, stderr: secret, exitCode };
  });
  const options = {
    projectRoot: '/project',
    composeFile: 'compose.yaml',
    image: 'maintenance:local',
  };
  const run = () =>
    probePortablePgdata(options, {
      execute,
      prepare,
      uuid: () => state.probeUuid,
    });
  const runWithContext = () =>
    probePortablePgdataWithContext(context, {
      execute,
      uuid: () => probeUuid,
    });
  return {
    state,
    container,
    context,
    events,
    execute,
    prepare,
    release,
    run,
    runWithContext,
  };
}

describe('orchestrated PGDATA probe', () => {
  describe('with an externally owned maintenance context', () => {
    it('runs and cleans up without preparing or releasing the lease', async () => {
      const f = fixture();
      await expect(f.runWithContext()).resolves.toEqual({
        ok: true,
        postgresMajor: 17,
      });
      expect(f.events).toEqual(['create', 'start', 'wait', 'logs', 'cleanup']);
      expect(f.prepare).not.toHaveBeenCalled();
      expect(f.release).not.toHaveBeenCalled();
    });

    it('preserves a primary error after successful cleanup', async () => {
      const f = fixture();
      f.state.waitOutput = '1\n';
      await expect(f.runWithContext()).rejects.toMatchObject({
        code: 'probe-failed',
        cleanupFailure: undefined,
      });
      expect(f.events.slice(-1)).toEqual(['cleanup']);
      expect(f.release).not.toHaveBeenCalled();
    });

    it('reports cleanup failure without attempting lease release', async () => {
      const f = fixture();
      f.state.removeExit = 1;
      await expect(f.runWithContext()).rejects.toMatchObject({
        code: 'cleanup-failed',
        cleanupFailure: 'probe-cleanup-failed',
      });
      expect(f.release).not.toHaveBeenCalled();
    });

    it('uses the operation label from the externally owned lease', async () => {
      const externalOperationId = 'abcdef12-3456-4789-8abc-def012345678';
      const f = fixture(externalOperationId);
      await f.runWithContext();
      const create = f.execute.mock.calls.find(
        ([request]) => request.args[0] === 'create',
      )![0].args;
      expect(create).toContain(
        `org.jobtracker.maintenance.operation=${externalOperationId}`,
      );
      expect(f.release).not.toHaveBeenCalled();
    });
  });

  it('runs the exact safe lifecycle and keeps the lease through cleanup', async () => {
    const f = fixture();
    await expect(f.run()).resolves.toEqual({ ok: true, postgresMajor: 17 });
    expect(f.events).toEqual([
      'create',
      'start',
      'wait',
      'logs',
      'cleanup',
      'release',
    ]);
    const create = f.execute.mock.calls.find(
      ([r]) => r.args[0] === 'create',
    )![0].args;
    expect(create).toContain('--read-only');
    expect(create).toContain('none');
    expect(create).toContain(imageId);
    expect(create).toContain(
      `type=bind,src=${mountpoint},dst=/probe/pgdata,readonly,bind-propagation=rslave,bind-nonrecursive,bind-create-src=false`,
    );
    expect(create.slice(-2)).toEqual([
      imageId,
      '/app/portable-pgdata-probe-cli.js',
    ]);
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it('releases the acquired lease when the probe UUID is invalid', async () => {
    const f = fixture();
    f.state.probeUuid = 'invalid';
    await expect(f.run()).rejects.toMatchObject({ code: 'configuration' });
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.events).toEqual(['release']);
  });

  it('preserves the configuration error when release fails after an invalid UUID', async () => {
    const f = fixture();
    f.state.probeUuid = 'invalid';
    f.release.mockResolvedValue({ released: false, error: 'cleanup-failed' });
    await expect(f.run()).rejects.toMatchObject({
      code: 'configuration',
      cleanupFailure: 'lease-release-failed',
    });
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'wait failure',
      (f: ReturnType<typeof fixture>) => {
        f.state.waitExit = 1;
      },
    ],
    [
      'wait malformed',
      (f: ReturnType<typeof fixture>) => {
        f.state.waitOutput = '0';
      },
    ],
    [
      'probe nonzero',
      (f: ReturnType<typeof fixture>) => {
        f.state.waitOutput = '1\n';
      },
    ],
    [
      'logs failure',
      (f: ReturnType<typeof fixture>) => {
        f.state.logsExit = 1;
      },
    ],
    [
      'stdout empty',
      (f: ReturnType<typeof fixture>) => {
        f.state.logsOutput = '';
      },
    ],
    [
      'stdout malformed',
      (f: ReturnType<typeof fixture>) => {
        f.state.logsOutput = '{bad}\n';
      },
    ],
    [
      'stdout extra',
      (f: ReturnType<typeof fixture>) => {
        f.state.logsOutput += 'extra\n';
      },
    ],
    [
      'extra key',
      (f: ReturnType<typeof fixture>) => {
        f.state.logsOutput = '{"ok":true,"postgresMajor":17,"extra":true}\n';
      },
    ],
    [
      'wrong major',
      (f: ReturnType<typeof fixture>) => {
        f.state.logsOutput = '{"ok":true,"postgresMajor":18}\n';
      },
    ],
  ])('fails closed for %s', async (_name, alter) => {
    const f = fixture();
    alter(f);
    await expect(f.run()).rejects.toMatchObject({ code: 'probe-failed' });
    expect(f.events.slice(-2)).toEqual(['cleanup', 'release']);
  });

  it.each([
    [
      'missing expected label',
      (f: ReturnType<typeof fixture>) => {
        delete f.container.Config.Labels[
          'org.jobtracker.maintenance.operation'
        ];
      },
    ],
    [
      'different expected label value',
      (f: ReturnType<typeof fixture>) => {
        f.container.Config.Labels['org.jobtracker.maintenance.operation'] =
          'other';
      },
    ],
    [
      'extra JobTracker label',
      (f: ReturnType<typeof fixture>) => {
        f.container.Config.Labels['org.jobtracker.maintenance.extra'] = 'true';
      },
    ],
    [
      'extra Compose label',
      (f: ReturnType<typeof fixture>) => {
        f.container.Config.Labels['com.docker.compose.project'] = 'portable';
      },
    ],
    [
      'healthcheck enabled',
      (f: ReturnType<typeof fixture>) => {
        f.container.Config.Healthcheck = { Test: ['CMD', 'true'] };
      },
    ],
    [
      'rootfs',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.ReadonlyRootfs = false;
      },
    ],
    [
      'propagation',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.Mounts[0].BindOptions.Propagation = 'rprivate';
      },
    ],
    [
      'nonrecursive',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.Mounts[0].BindOptions.NonRecursive = false;
      },
    ],
    [
      'source creation',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.Mounts[0].BindOptions.CreateMountpoint = true;
      },
    ],
    [
      'network mode',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.NetworkMode = 'bridge';
      },
    ],
    [
      'restart policy',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.RestartPolicy.Name = 'always';
      },
    ],
    [
      'auto remove',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.AutoRemove = true;
      },
    ],
    [
      'privileged',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.Privileged = true;
      },
    ],
    [
      'entrypoint',
      (f: ReturnType<typeof fixture>) => {
        f.container.Config.Entrypoint = ['sh'];
      },
    ],
    [
      'command',
      (f: ReturnType<typeof fixture>) => {
        f.container.Config.Cmd = ['/app/other.js'];
      },
    ],
    [
      'additional mount',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.Mounts.push({
          Type: 'bind',
          Source: '/tmp/other',
          Target: '/other',
          ReadOnly: true,
        });
      },
    ],
    [
      'bind destination',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.Mounts[0].Target = '/wrong';
      },
    ],
    [
      'writable bind',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.Mounts[0].ReadOnly = false;
      },
    ],
    [
      'device',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.Devices = [{ PathOnHost: '/dev/null' }];
      },
    ],
    [
      'added capability',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.CapAdd = ['SYS_ADMIN'];
      },
    ],
    [
      'port binding',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.PortBindings = {
          '5432/tcp': [{ HostPort: '5432' }],
        };
      },
    ],
    [
      'exposed port',
      (f: ReturnType<typeof fixture>) => {
        f.container.Config.ExposedPorts = { '5432/tcp': {} };
      },
    ],
  ])(
    'never starts an invalid pre-start configuration: %s',
    async (_name, alter) => {
      const f = fixture();
      alter(f);
      await expect(f.run()).rejects.toMatchObject({
        code: 'ownership-unconfirmed',
      });
      expect(f.events).not.toContain('start');
    },
  );

  it('reports definite create failure without starting', async () => {
    const f = fixture();
    f.state.createExit = 1;
    await expect(f.run()).rejects.toMatchObject({ code: 'create-failed' });
    expect(f.events).toEqual(['create', 'release']);
  });

  it('fails closed when the source disappears during leased revalidation', async () => {
    const f = fixture();
    f.prepare.mockRejectedValue(new MaintenanceError('source-changed'));
    await expect(f.run()).rejects.toMatchObject({ code: 'source-changed' });
    expect(f.execute).not.toHaveBeenCalled();
  });

  it('recovers an ambiguous create exception without assuming absence', async () => {
    const f = fixture();
    const original = f.execute.getMockImplementation()!;
    f.execute.mockImplementation(async (request) => {
      if (request.args[0] === 'create') {
        f.state.present = true;
        throw new Error(secret);
      }
      return original(request);
    });
    await expect(f.run()).rejects.toMatchObject({ code: 'create-failed' });
    expect(f.events).toContain('cleanup');
  });

  it('recovers and removes an owned ambiguous create by exact ID', async () => {
    const f = fixture();
    f.state.createExit = null;
    await expect(f.run()).rejects.toMatchObject({ code: 'create-failed' });
    const removals = f.execute.mock.calls.filter(([r]) => r.args[1] === 'rm');
    expect(removals).toHaveLength(1);
    expect(removals[0][0].args.at(-1)).toBe(containerId);
  });

  it('never removes an unowned ambiguous candidate', async () => {
    const f = fixture();
    f.state.createExit = null;
    f.container.Config.Labels['org.jobtracker.maintenance.operation'] = 'other';
    await expect(f.run()).rejects.toMatchObject({
      cleanupFailure: 'ownership-unconfirmed',
    });
    expect(f.execute.mock.calls.some(([r]) => r.args[1] === 'rm')).toBe(false);
  });

  it('does not start a preexisting name collision', async () => {
    const f = fixture();
    f.state.present = true;
    f.container.Id = 'd'.repeat(64);
    await expect(f.run()).rejects.toMatchObject({
      code: 'container-collision',
    });
    expect(f.events).toEqual(['release']);
  });

  it.each([
    ['definite', 1],
    ['ambiguous', null],
  ] as const)('fails closed on %s start failure', async (_name, exit) => {
    const f = fixture();
    f.state.startExit = exit;
    await expect(f.run()).rejects.toMatchObject({ code: 'start-failed' });
    expect(f.events.at(-1)).toBe('release');
  });

  it('keeps primary failure separate from cleanup failure', async () => {
    const f = fixture();
    f.state.waitOutput = '1\n';
    f.state.removeExit = 1;
    await expect(f.run()).rejects.toMatchObject({
      code: 'probe-failed',
      cleanupFailure: 'probe-cleanup-failed',
    });
  });

  it('does not let release failure overwrite primary and cleanup failures', async () => {
    const f = fixture();
    f.state.waitOutput = '1\n';
    f.state.removeExit = 1;
    f.release.mockResolvedValue({ released: false, error: 'cleanup-failed' });
    await expect(f.run()).rejects.toMatchObject({
      code: 'probe-failed',
      cleanupFailure: 'probe-cleanup-failed',
    });
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it('reports cleanup failure after otherwise successful probe', async () => {
    const f = fixture();
    f.state.removeExit = 1;
    await expect(f.run()).rejects.toMatchObject({
      code: 'cleanup-failed',
      cleanupFailure: 'probe-cleanup-failed',
    });
  });

  it('does not remove when ownership changes before cleanup', async () => {
    const f = fixture();
    const original = f.execute.getMockImplementation()!;
    f.execute.mockImplementation(async (request) => {
      const response = await original(request);
      if (request.args[1] === 'logs')
        f.container.Config.Labels['org.jobtracker.maintenance.operation'] =
          'other';
      return response;
    });
    await expect(f.run()).rejects.toMatchObject({
      cleanupFailure: 'ownership-unconfirmed',
    });
    expect(f.events).not.toContain('cleanup');
  });

  it('reports lease release separately', async () => {
    const f = fixture();
    f.release.mockResolvedValue({ released: false, error: 'cleanup-failed' });
    await expect(f.run()).rejects.toMatchObject({
      code: 'lease-release-failed',
    });
  });

  it('redacts host paths, IDs, daemon output and secrets', async () => {
    const f = fixture();
    f.state.logsOutput = secret;
    const error = await f.run().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(PortablePgdataProbeError);
    const serialized = JSON.stringify(error) + (error as Error).message;
    for (const hidden of [mountpoint, containerId, secret, name])
      expect(serialized).not.toContain(hidden);
  });
});
