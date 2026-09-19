/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import type { InternalMaintenanceContext } from './portable-maintenance';
import {
  PORTABLE_BACKUP_TARGET,
  PORTABLE_UPLOADS_TARGET,
  type PortableBackupMounts,
} from './portable-backup-mounts';
import {
  PortableBackupError,
  runPortableBackup,
} from './portable-backup-orchestrator';
import type { DockerExecutor } from './portable-preflight';

const uuid = '12345678-1234-4234-8234-123456789abc';
const operationId = 'abcdef12-3456-4789-8abc-def012345678';
const containerId = 'a'.repeat(64);
const postgresId = 'b'.repeat(64);
const imageId = `sha256:${'c'.repeat(64)}`;
const password = 'PG_SECRET_SENTINEL';
const name = `portable-jobtracker-backup-${uuid}`;
const uploadsSource = '/var/lib/docker/volumes/uploads/_data';
const outputSource = '/srv/jobtracker/backups';
const proxies = [
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
] as const;
const pg = {
  PGHOST: '127.0.0.1',
  PGPORT: '5432',
  PGDATABASE: 'jobtracker',
  PGUSER: 'jobtracker',
  PGPASSWORD: password,
};

function fixture() {
  const events: string[] = [];
  const state = {
    present: false,
    started: false,
    createExit: 0 as number | null,
    createOutput: `${containerId}\n`,
    startExit: 0 as number | null,
    waitCommandExit: 0 as number | null,
    containerExit: 0,
    logsExit: 0 as number | null,
    logsOutput: `${JSON.stringify({
      result: {
        status: 'published',
        backupName: 'jobtracker-backup-20260919-120000',
        extraFiles: 2,
        cleanupWarning: false,
      },
    })}\n`,
    removeExit: 0 as number | null,
  };
  const uploadsMount = Object.freeze({
    type: 'bind',
    source: uploadsSource,
    destination: PORTABLE_UPLOADS_TARGET,
    readOnly: true,
    bindCreateSource: false as const,
  });
  const destinationMount = Object.freeze({
    type: 'bind',
    source: outputSource,
    destination: PORTABLE_BACKUP_TARGET,
    readOnly: false,
    bindCreateSource: false as const,
  });
  const mounts: PortableBackupMounts = Object.freeze({
    destinationHostPath: outputSource,
    uploads: uploadsMount,
    backupDestination: destinationMount,
    mounts: Object.freeze([uploadsMount, destinationMount] as const),
  });
  const release = jest.fn();
  const context = {
    lease: { operationId, release },
    source: {
      publicSnapshot: { projectName: 'portable', projectRoot: '/project' },
      serviceIdentities: {
        postgres: { id: postgresId, state: 'running' },
      },
      postgresCredentials: {
        database: pg.PGDATABASE,
        user: pg.PGUSER,
        password,
      },
    },
    imageId,
    env: { PATH: '/bin' },
  } as unknown as InternalMaintenanceContext;
  const labels = {
    'org.jobtracker.maintenance.kind': 'backup',
    'org.jobtracker.maintenance.project': 'portable',
    'org.jobtracker.maintenance.operation': operationId,
  };
  const container: Record<string, any> = {
    Id: containerId,
    Name: `/${name}`,
    Image: imageId,
    Config: {
      Image: imageId,
      Labels: labels,
      Entrypoint: ['node'],
      Cmd: [
        '/app/backup-cli.js',
        '--uploads-root',
        PORTABLE_UPLOADS_TARGET,
        '--destination',
        PORTABLE_BACKUP_TARGET,
      ],
      Env: [
        'PATH=/bin',
        ...proxies.map((key) => `${key}=`),
        ...Object.entries(pg).map(([key, value]) => `${key}=${value}`),
      ],
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
      NetworkMode: `container:${postgresId}`,
      RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
      AutoRemove: false,
      Privileged: false,
      Mounts: [
        {
          Type: 'bind',
          Source: uploadsSource,
          Target: PORTABLE_UPLOADS_TARGET,
          ReadOnly: true,
          BindOptions: {},
        },
        {
          Type: 'bind',
          Source: outputSource,
          Target: PORTABLE_BACKUP_TARGET,
          BindOptions: {},
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
    NetworkSettings: { Networks: {} },
  };
  const execute = jest.fn<
    ReturnType<DockerExecutor>,
    Parameters<DockerExecutor>
  >(async (request) => {
    await Promise.resolve();
    const args = request.args;
    if (args[0] === 'container' && args[1] === 'ls')
      return {
        stdout: state.present
          ? `${JSON.stringify({ ID: container.Id, Names: container.Name.slice(1) })}\n`
          : '',
        stderr: password,
        exitCode: 0,
      };
    if (args[0] === 'create') {
      events.push('create');
      if (state.createExit === 0 || state.createExit === null)
        state.present = true;
      return {
        stdout: state.createOutput,
        stderr: password,
        exitCode: state.createExit,
      };
    }
    if (args[0] === 'container' && args[1] === 'inspect')
      return {
        stdout: JSON.stringify([container]),
        stderr: password,
        exitCode: 0,
      };
    if (args[0] === 'container' && args[1] === 'start') {
      events.push('start');
      if (state.startExit === 0) {
        state.started = true;
        container.State.Status = 'running';
        container.State.Running = true;
        container.State.StartedAt = '2026-09-19T12:00:00Z';
      }
      return { stdout: '', stderr: password, exitCode: state.startExit };
    }
    if (args[0] === 'container' && args[1] === 'logs') {
      events.push('logs');
      return {
        stdout: state.logsOutput,
        stderr: password,
        exitCode: state.logsExit,
      };
    }
    if (args[0] === 'container' && args[1] === 'rm') {
      events.push('cleanup');
      if (state.removeExit === 0) state.present = false;
      return { stdout: '', stderr: password, exitCode: state.removeExit };
    }
    throw new Error(`unexpected ${args.join(' ')}`);
  });
  const waitExecute = jest.fn<
    ReturnType<DockerExecutor>,
    Parameters<DockerExecutor>
  >(async () => {
    await Promise.resolve();
    events.push('wait');
    container.State.Status = 'exited';
    container.State.Running = false;
    return {
      stdout: `${state.containerExit}\n`,
      stderr: password,
      exitCode: state.waitCommandExit,
    };
  });
  const run = (runMounts = mounts, runUuid = uuid) =>
    runPortableBackup(context, runMounts, {
      execute,
      waitExecute,
      uuid: () => runUuid,
    });
  return {
    container,
    context,
    events,
    execute,
    labels,
    mounts,
    release,
    run,
    state,
    waitExecute,
  };
}

async function error(action: () => Promise<unknown>, code: string) {
  const value = await action().catch((caught: unknown) => caught);
  expect(value).toBeInstanceOf(PortableBackupError);
  expect(value).toMatchObject({ code });
  const serialized = JSON.stringify(value) + (value as Error).message;
  for (const hidden of [password, containerId, uploadsSource, outputSource])
    expect(serialized).not.toContain(hidden);
  return value as PortableBackupError;
}

describe('Portable backup container orchestration', () => {
  it('uses the exact strict create contract and the dedicated wait executor', async () => {
    const f = fixture();
    await expect(f.run()).resolves.toEqual({
      status: 'published',
      backupName: 'jobtracker-backup-20260919-120000',
      extraFiles: 2,
      cleanupWarning: false,
    });
    expect(f.events).toEqual(['create', 'start', 'wait', 'logs', 'cleanup']);
    expect(f.release).not.toHaveBeenCalled();
    expect(f.waitExecute).toHaveBeenCalledTimes(1);
    expect(
      f.execute.mock.calls.some(([request]) => request.args[1] === 'wait'),
    ).toBe(false);
    const create = f.execute.mock.calls.find(
      ([request]) => request.args[0] === 'create',
    )![0];
    expect(create.cwd).toBe('/project');
    expect(create.env).toBe(f.context.env);
    expect(create.args).toEqual([
      'create',
      '--pull',
      'never',
      '--name',
      name,
      '--network',
      `container:${postgresId}`,
      '--restart',
      'no',
      '--read-only',
      '--no-healthcheck',
      '--entrypoint',
      'node',
      ...Object.entries(f.labels).flatMap(([key, value]) => [
        '--label',
        `${key}=${value}`,
      ]),
      ...proxies.flatMap((key) => ['--env', `${key}=`]),
      ...Object.entries(pg).flatMap(([key, value]) => [
        '--env',
        `${key}=${value}`,
      ]),
      '--mount',
      `type=bind,src=${uploadsSource},dst=${PORTABLE_UPLOADS_TARGET},readonly,bind-create-src=false`,
      '--mount',
      `type=bind,src=${outputSource},dst=${PORTABLE_BACKUP_TARGET},bind-create-src=false`,
      imageId,
      '/app/backup-cli.js',
      '--uploads-root',
      PORTABLE_UPLOADS_TARGET,
      '--destination',
      PORTABLE_BACKUP_TARGET,
    ]);
  });

  it.each([
    [3, true],
    [0, false],
  ] as const)(
    'accepts published exit %i with cleanup warning %s',
    async (exit, warning) => {
      const f = fixture();
      f.state.containerExit = exit;
      f.state.logsOutput = `${JSON.stringify({
        result: {
          status: 'published',
          backupName: 'jobtracker-backup-valid',
          extraFiles: 0,
          cleanupWarning: warning,
        },
      })}\n`;
      await expect(f.run()).resolves.toMatchObject({
        status: 'published',
        cleanupWarning: warning,
      });
    },
  );

  it.each([
    [2, 'prerequisites'],
    [1, 'production'],
  ] as const)(
    'returns known failure for exit %i and %s',
    async (exit, operation) => {
      const f = fixture();
      f.state.containerExit = exit;
      f.state.logsOutput = `${JSON.stringify({
        result: { status: 'failed', operation },
      })}\n`;
      await expect(f.run()).resolves.toEqual({ status: 'failed', operation });
    },
  );

  it('refuses invalid UUID and absent PostgreSQL before Docker access', async () => {
    const invalid = fixture();
    await error(() => invalid.run(invalid.mounts, 'invalid'), 'configuration');
    expect(invalid.execute).not.toHaveBeenCalled();
    const absent = fixture();
    (absent.context.source.serviceIdentities as any).postgres = null;
    await error(absent.run, 'postgres-unavailable');
    expect(absent.execute).not.toHaveBeenCalled();
  });

  it('requires an explicit long-wait executor before Docker access', async () => {
    const f = fixture();
    await error(
      () =>
        runPortableBackup(f.context, f.mounts, {
          execute: f.execute,
          waitExecute: undefined as never,
        }),
      'configuration',
    );
    expect(f.execute).not.toHaveBeenCalled();
  });

  it('refuses a preexisting name collision and definite create failure', async () => {
    const collision = fixture();
    collision.state.present = true;
    collision.container.Id = 'd'.repeat(64);
    await error(collision.run, 'container-collision');
    expect(collision.events).toEqual([]);
    const failed = fixture();
    failed.state.createExit = 1;
    await error(failed.run, 'create-failed');
    expect(failed.events).toEqual(['create']);
  });

  it('recovers and removes a safe ambiguous create but never an unowned one', async () => {
    const safe = fixture();
    safe.state.createExit = null;
    const recovered = await error(safe.run, 'create-failed');
    expect(recovered.cleanupFailure).toBeUndefined();
    expect(safe.events).toContain('cleanup');
    const unowned = fixture();
    unowned.state.createExit = null;
    unowned.container.Config.Labels['org.jobtracker.maintenance.operation'] =
      'other';
    const refused = await error(unowned.run, 'create-failed');
    expect(refused.cleanupFailure).toBe('ownership-unconfirmed');
    expect(unowned.events).not.toContain('cleanup');
  });

  it.each([
    ['image', (f: ReturnType<typeof fixture>) => (f.container.Image = 'bad')],
    [
      'network',
      (f: ReturnType<typeof fixture>) =>
        (f.container.HostConfig.NetworkMode = 'none'),
    ],
    [
      'rootfs',
      (f: ReturnType<typeof fixture>) =>
        (f.container.HostConfig.ReadonlyRootfs = false),
    ],
    [
      'restart',
      (f: ReturnType<typeof fixture>) =>
        (f.container.HostConfig.RestartPolicy.Name = 'always'),
    ],
    [
      'healthcheck',
      (f: ReturnType<typeof fixture>) =>
        (f.container.Config.Healthcheck = { Test: ['CMD', 'true'] }),
    ],
    [
      'mount option',
      (f: ReturnType<typeof fixture>) =>
        (f.container.HostConfig.Mounts[0].BindOptions.Propagation = 'rslave'),
    ],
    [
      'reversed mounts',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.Mounts.reverse();
      },
    ],
    [
      'explicit false ReadOnly on destination mount',
      (f: ReturnType<typeof fixture>) => {
        f.container.HostConfig.Mounts[1].ReadOnly = false;
      },
    ],
    [
      'credential',
      (f: ReturnType<typeof fixture>) => {
        f.container.Config.Env.push('PGPASSWORD=other');
      },
    ],
    [
      'extra environment',
      (f: ReturnType<typeof fixture>) => {
        f.container.Config.Env.push('SECRET=hidden');
      },
    ],
    [
      'port',
      (f: ReturnType<typeof fixture>) =>
        (f.container.HostConfig.PortBindings = { '5432/tcp': [{}] }),
    ],
    [
      'privilege',
      (f: ReturnType<typeof fixture>) =>
        (f.container.HostConfig.Privileged = true),
    ],
    [
      'network attachment',
      (f: ReturnType<typeof fixture>) =>
        (f.container.NetworkSettings.Networks = { unexpected: {} }),
    ],
  ])('refuses unsafe inspect: %s', async (_name, alter) => {
    const f = fixture();
    alter(f);
    await error(f.run, 'ownership-unconfirmed');
    expect(f.events).not.toContain('start');
  });

  it('fails start closed and cleans up with force', async () => {
    const f = fixture();
    f.state.startExit = 1;
    await error(f.run, 'start-failed');
    expect(f.events).toEqual(['create', 'start', 'cleanup']);
    const removal = f.execute.mock.calls.find(
      ([request]) => request.args[1] === 'rm',
    )![0].args;
    expect(removal).toContain('--force');
  });

  it.each([
    [
      'wait transport failure',
      (f: ReturnType<typeof fixture>) =>
        f.waitExecute.mockRejectedValue(new Error(password)),
    ],
    [
      'wait command failure',
      (f: ReturnType<typeof fixture>) => (f.state.waitCommandExit = 1),
    ],
    ['logs failure', (f: ReturnType<typeof fixture>) => (f.state.logsExit = 1)],
    [
      'exit 1 without stdout',
      (f: ReturnType<typeof fixture>) => {
        f.state.containerExit = 1;
        f.state.logsOutput = '';
      },
    ],
    [
      'invalid JSON',
      (f: ReturnType<typeof fixture>) => (f.state.logsOutput = '{bad}\n'),
    ],
    [
      'multiple lines',
      (f: ReturnType<typeof fixture>) => (f.state.logsOutput += '{}\n'),
    ],
    [
      'exit mismatch',
      (f: ReturnType<typeof fixture>) => (f.state.containerExit = 3),
    ],
    [
      'bad backup name',
      (f: ReturnType<typeof fixture>) =>
        (f.state.logsOutput =
          '{"result":{"status":"published","backupName":"../bad","extraFiles":0,"cleanupWarning":false}}\n'),
    ],
    [
      'bad extra files',
      (f: ReturnType<typeof fixture>) =>
        (f.state.logsOutput =
          '{"result":{"status":"published","backupName":"jobtracker-backup-ok","extraFiles":-1,"cleanupWarning":false}}\n'),
    ],
    [
      'bad cleanup warning',
      (f: ReturnType<typeof fixture>) =>
        (f.state.logsOutput =
          '{"result":{"status":"published","backupName":"jobtracker-backup-ok","extraFiles":0,"cleanupWarning":"false"}}\n'),
    ],
  ])('reports publication unknown for %s', async (_name, alter) => {
    const f = fixture();
    alter(f);
    await error(f.run, 'publication-unknown');
  });

  it('preserves a published outcome when Docker cleanup fails', async () => {
    const f = fixture();
    f.state.removeExit = 1;
    await expect(f.run()).resolves.toMatchObject({
      status: 'published',
      containerCleanupFailure: 'container-cleanup-failed',
    });
  });

  it('preserves a known failure when Docker cleanup fails', async () => {
    const f = fixture();
    f.state.containerExit = 2;
    f.state.logsOutput =
      '{"result":{"status":"failed","operation":"prerequisites"}}\n';
    f.state.removeExit = 1;
    await expect(f.run()).resolves.toEqual({
      status: 'failed',
      operation: 'prerequisites',
      containerCleanupFailure: 'container-cleanup-failed',
    });
  });

  it('attaches cleanup failure to an error before any known outcome', async () => {
    const f = fixture();
    f.state.startExit = 1;
    f.state.removeExit = 1;
    await expect(f.run()).rejects.toMatchObject({
      code: 'start-failed',
      cleanupFailure: 'container-cleanup-failed',
    });
  });

  it('never removes a container whose ownership changes before cleanup', async () => {
    const f = fixture();
    const original = f.execute.getMockImplementation()!;
    f.execute.mockImplementation(async (request) => {
      const response = await original(request);
      if (request.args[1] === 'logs')
        f.container.Config.Labels['org.jobtracker.maintenance.operation'] =
          'other';
      return response;
    });
    await expect(f.run()).resolves.toMatchObject({
      status: 'published',
      containerCleanupFailure: 'ownership-unconfirmed',
    });
    expect(f.events).not.toContain('cleanup');
  });
});
