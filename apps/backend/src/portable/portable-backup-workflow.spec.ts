import { DockerRunnerError } from './portable-docker';
import {
  MaintenanceError,
  type InternalMaintenanceContext,
  type ReleaseResult,
} from './portable-maintenance';
import { PortableServicePlanError } from './portable-service-plan';
import {
  PortableServiceExecutionError,
  type PortableServiceExecutor,
} from './portable-service-executor';
import { PortablePgdataProbeError } from './portable-pgdata-orchestrator';
import { PortableBackupMountsError } from './portable-backup-mounts';
import {
  PortableBackupError,
  type PortableBackupResult,
} from './portable-backup-orchestrator';
import {
  PortableBackupWorkflowError,
  runPortableBackupWorkflow,
  type PortableBackupWorkflowDependencies,
  type PortableBackupWorkflowOptions,
} from './portable-backup-workflow';
import type { DockerExecutor } from './portable-preflight';

const password = 'WORKFLOW_SECRET_SENTINEL';
const hostPath = '/sensitive/backup/path';
const containerId = 'a'.repeat(64);

const published = Object.freeze({
  status: 'published' as const,
  backupName: 'jobtracker-backup-known',
  extraFiles: 2,
  cleanupWarning: false,
});

type InitialState = Readonly<{
  postgres: 'running' | 'exited';
  frontend: 'running' | 'exited' | 'absent';
  backend: 'running' | 'exited' | 'absent';
}>;

function dockerExecutor(): jest.MockedFunction<DockerExecutor> {
  return jest.fn<ReturnType<DockerExecutor>, Parameters<DockerExecutor>>(() =>
    Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
  );
}

function fixture(
  initial: InitialState = {
    postgres: 'running',
    frontend: 'running',
    backend: 'running',
  },
) {
  const events: string[] = [];
  const execute = dockerExecutor();
  const waitExecute = dockerExecutor();
  const release = jest.fn<Promise<ReleaseResult>, []>(() => {
    events.push('release');
    return Promise.resolve({ released: true });
  });
  const context = {
    lease: { operationId: 'operation', release },
    source: {
      initial,
      postgresCredentials: { password },
      serviceIdentities: {
        postgres: { id: containerId, state: initial.postgres },
        frontend:
          initial.frontend === 'absent' ? null : { state: initial.frontend },
        backend:
          initial.backend === 'absent' ? null : { state: initial.backend },
      },
    },
    imageId: `sha256:${'b'.repeat(64)}`,
    env: { PATH: '/bin' },
  } as unknown as InternalMaintenanceContext;
  const plan = { initial } as never;
  const transitions = { authentic: true } as never;
  const mounts = { destinationHostPath: hostPath } as never;
  const executor: PortableServiceExecutor = {
    transitions,
    quiesceApplication() {
      events.push('quiesce');
      return Promise.resolve();
    },
    ensurePostgresRunning() {
      events.push('postgres');
      return Promise.resolve();
    },
    restore() {
      events.push('restore');
      return Promise.resolve();
    },
  };
  const prepare = jest.fn(() => {
    events.push('prepare');
    return Promise.resolve(context);
  });
  const createPlan = jest.fn(() => {
    events.push('plan');
    return plan;
  });
  const initialTransitions = jest.fn(() => transitions);
  const createExecutor = jest.fn(() => {
    events.push('executor');
    return executor;
  });
  const probe = jest.fn(() => {
    events.push('probe');
    return Promise.resolve({ ok: true as const, postgresMajor: 17 as const });
  });
  const qualifyMounts = jest.fn(() => {
    events.push('mounts');
    return Promise.resolve(mounts);
  });
  const runBackup = jest.fn<Promise<PortableBackupResult>, []>(() => {
    events.push('backup');
    return Promise.resolve(published);
  });
  const createDockerRunner = jest.fn(() => execute);
  const dependencies = {
    execute,
    waitExecute,
    createDockerRunner,
    prepare,
    createPlan,
    initialTransitions,
    createExecutor,
    probe,
    qualifyMounts,
    runBackup,
    probeUuid: jest.fn(() => 'probe-uuid'),
    backupUuid: jest.fn(() => 'backup-uuid'),
  } as unknown as PortableBackupWorkflowDependencies;
  const options: PortableBackupWorkflowOptions = {
    projectRoot: '/project',
    composeFile: 'compose.yaml',
    projectName: 'portable',
    image: 'maintenance:local',
    destination: hostPath,
    waitTimeoutMs: 7_200_000,
    stopTimeoutSeconds: 45,
  };
  const run = () => runPortableBackupWorkflow(options, dependencies);
  return {
    context,
    createDockerRunner,
    createExecutor,
    createPlan,
    dependencies,
    events,
    execute,
    executor,
    initial,
    initialTransitions,
    mounts,
    options,
    prepare,
    probe,
    qualifyMounts,
    release,
    run,
    runBackup,
    waitExecute,
  };
}

async function workflowError(action: () => Promise<unknown>) {
  const error = await action().catch((value: unknown) => value);
  expect(error).toBeInstanceOf(PortableBackupWorkflowError);
  const serialized = JSON.stringify(error) + (error as Error).message;
  for (const hidden of [password, hostPath, containerId])
    expect(serialized).not.toContain(hidden);
  return error as PortableBackupWorkflowError;
}

describe('Portable backup workflow', () => {
  it.each([
    ['all running', 'running', 'running', 'running'],
    ['postgres exited', 'exited', 'running', 'running'],
    ['application already quiescent', 'running', 'exited', 'absent'],
    ['mixed application state', 'exited', 'absent', 'running'],
  ] as const)(
    'runs the strict workflow for %s',
    async (_name, postgres, frontend, backend) => {
      const f = fixture({ postgres, frontend, backend });
      await expect(f.run()).resolves.toEqual({ backup: published });
      expect(f.events).toEqual([
        'prepare',
        'plan',
        'executor',
        'quiesce',
        'postgres',
        'probe',
        'mounts',
        'backup',
        'restore',
        'release',
      ]);
      expect(f.createPlan).toHaveBeenCalledWith(f.context.source);
      expect(f.createExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          source: f.context.source,
          execute: f.execute,
          env: f.context.env,
          stopTimeoutSeconds: 45,
        }),
      );
    },
  );

  it('passes the same context and the dedicated wait runner to d4-d6', async () => {
    const f = fixture();
    await f.run();
    expect(f.prepare).toHaveBeenCalledTimes(1);
    expect(f.probe).toHaveBeenCalledWith(f.context, {
      execute: f.execute,
      uuid: f.dependencies.probeUuid,
    });
    expect(f.qualifyMounts).toHaveBeenCalledWith(
      f.context,
      hostPath,
      undefined,
    );
    expect(f.runBackup).toHaveBeenCalledWith(f.context, f.mounts, {
      execute: f.execute,
      waitExecute: f.waitExecute,
      uuid: f.dependencies.backupUuid,
    });
  });

  it.each([undefined, 0, -1, Infinity, Number.NaN, 2_147_483_648])(
    'refuses invalid wait timeout %s before acquisition',
    async (waitTimeoutMs) => {
      const f = fixture();
      const action = () =>
        runPortableBackupWorkflow(
          { ...f.options, waitTimeoutMs } as PortableBackupWorkflowOptions,
          f.dependencies,
        );
      await expect(action()).rejects.toMatchObject({
        stage: 'workflow',
        code: 'configuration',
      });
      expect(f.prepare).not.toHaveBeenCalled();
    },
  );

  it('constructs a distinct bounded wait runner when none is injected', async () => {
    const f = fixture();
    const dedicated = dockerExecutor();
    f.createDockerRunner
      .mockReturnValueOnce(f.execute)
      .mockReturnValueOnce(dedicated);
    const dependencies = {
      ...f.dependencies,
      execute: undefined,
      waitExecute: undefined,
    };
    await runPortableBackupWorkflow(f.options, dependencies);
    expect(f.createDockerRunner).toHaveBeenNthCalledWith(1);
    expect(f.createDockerRunner).toHaveBeenNthCalledWith(2, {
      timeoutMs: f.options.waitTimeoutMs,
    });
    expect(f.runBackup).toHaveBeenCalledWith(
      f.context,
      f.mounts,
      expect.objectContaining({ execute: f.execute, waitExecute: dedicated }),
    );
  });

  it('maps runner construction failure without acquiring a lease', async () => {
    const f = fixture();
    f.createDockerRunner.mockImplementation(() => {
      throw new DockerRunnerError('configuration');
    });
    const error = await workflowError(() =>
      runPortableBackupWorkflow(f.options, {
        ...f.dependencies,
        execute: undefined,
        waitExecute: undefined,
      }),
    );
    expect(error).toMatchObject({ stage: 'workflow', code: 'configuration' });
    expect(f.prepare).not.toHaveBeenCalled();
  });

  it('does not release a lease that acquisition failed to return', async () => {
    const f = fixture();
    f.prepare.mockRejectedValue(new MaintenanceError('source-changed'));
    const error = await workflowError(f.run);
    expect(error).toMatchObject({
      stage: 'maintenance',
      code: 'source-changed',
    });
    expect(f.release).not.toHaveBeenCalled();
  });

  it('releases without inventing restore when plan creation fails', async () => {
    const f = fixture();
    f.createPlan.mockImplementation(() => {
      f.events.push('plan');
      throw new PortableServicePlanError('service-state-invalid');
    });
    const error = await workflowError(f.run);
    expect(error).toMatchObject({
      stage: 'service-plan',
      code: 'service-state-invalid',
    });
    expect(f.events).toEqual(['prepare', 'plan', 'release']);
  });

  it.each([
    [
      'quiescence',
      (f: ReturnType<typeof fixture>) =>
        jest
          .spyOn(f.executor, 'quiesceApplication')
          .mockRejectedValue(
            new PortableServiceExecutionError('stop-not-confirmed'),
          ),
      'service-execution',
      'stop-not-confirmed',
    ],
    [
      'postgres',
      (f: ReturnType<typeof fixture>) =>
        jest
          .spyOn(f.executor, 'ensurePostgresRunning')
          .mockRejectedValue(
            new PortableServiceExecutionError('start-not-confirmed'),
          ),
      'service-execution',
      'start-not-confirmed',
    ],
    [
      'probe',
      (f: ReturnType<typeof fixture>) =>
        f.probe.mockRejectedValue(new PortablePgdataProbeError('probe-failed')),
      'pgdata-probe',
      'probe-failed',
    ],
    [
      'mounts',
      (f: ReturnType<typeof fixture>) =>
        f.qualifyMounts.mockRejectedValue(
          new PortableBackupMountsError('destination-invalid'),
        ),
      'backup-mounts',
      'destination-invalid',
    ],
    [
      'backup',
      (f: ReturnType<typeof fixture>) =>
        f.runBackup.mockRejectedValue(
          new PortableBackupError('publication-unknown'),
        ),
      'backup',
      'publication-unknown',
    ],
  ] as const)(
    'restores then releases after %s failure',
    async (_name, fail, stage, code) => {
      const f = fixture();
      fail(f);
      const error = await workflowError(f.run);
      expect(error).toMatchObject({ stage, code });
      expect(f.events.slice(-2)).toEqual(['restore', 'release']);
    },
  );

  it('arms restoration before quiescence can partially mutate', async () => {
    const f = fixture();
    jest.spyOn(f.executor, 'quiesceApplication').mockImplementation(() => {
      f.events.push('frontend-stopped');
      return Promise.reject(
        new PortableServiceExecutionError('stop-not-confirmed'),
      );
    });
    await workflowError(f.run);
    expect(f.events).toEqual([
      'prepare',
      'plan',
      'executor',
      'frontend-stopped',
      'restore',
      'release',
    ]);
  });

  it.each([
    ['published', published],
    [
      'published warning',
      Object.freeze({ ...published, cleanupWarning: true }),
    ],
    [
      'published cleanup failure',
      Object.freeze({
        ...published,
        containerCleanupFailure: 'container-cleanup-failed' as const,
      }),
    ],
    [
      'failed prerequisites',
      Object.freeze({
        status: 'failed' as const,
        operation: 'prerequisites' as const,
      }),
    ],
    [
      'failed production',
      Object.freeze({
        status: 'failed' as const,
        operation: 'production' as const,
      }),
    ],
  ] as const)(
    'preserves the exact known d6 outcome: %s',
    async (_name, outcome) => {
      const f = fixture();
      f.runBackup.mockResolvedValue(outcome);
      const result = await f.run();
      expect(result.backup).toBe(outcome);
      expect(result).toEqual({ backup: outcome });
    },
  );

  it.each([
    ['lock-invalid', 'lock-invalid'],
    ['cleanup-failed', 'cleanup-failed'],
  ] as const)(
    'preserves published with release %s',
    async (_name, releaseFailure) => {
      const f = fixture();
      f.release.mockResolvedValue({ released: false, error: releaseFailure });
      await expect(f.run()).resolves.toEqual({
        backup: published,
        releaseFailure,
      });
      expect(f.release).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves published with restore and release failures', async () => {
    const f = fixture();
    jest
      .spyOn(f.executor, 'restore')
      .mockRejectedValue(
        new PortableServiceExecutionError('restoration-not-confirmed'),
      );
    f.release.mockResolvedValue({ released: false, error: 'lock-invalid' });
    await expect(f.run()).resolves.toEqual({
      backup: published,
      restoreFailure: 'restoration-not-confirmed',
      releaseFailure: 'lock-invalid',
    });
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it('preserves known failed outcome with restore failure', async () => {
    const f = fixture();
    const knownFailure: PortableBackupResult = Object.freeze({
      status: 'failed',
      operation: 'production',
    });
    f.runBackup.mockResolvedValue(knownFailure);
    jest
      .spyOn(f.executor, 'restore')
      .mockRejectedValue(new PortableServiceExecutionError('source-changed'));
    await expect(f.run()).resolves.toEqual({
      backup: knownFailure,
      restoreFailure: 'source-changed',
    });
  });

  it('preserves primary, restore and release failures together', async () => {
    const f = fixture();
    f.probe.mockRejectedValue(
      new PortablePgdataProbeError('probe-failed', 'probe-cleanup-failed'),
    );
    jest
      .spyOn(f.executor, 'restore')
      .mockRejectedValue(
        new PortableServiceExecutionError('restoration-not-confirmed'),
      );
    f.release.mockResolvedValue({ released: false, error: 'cleanup-failed' });
    const error = await workflowError(f.run);
    expect(error).toMatchObject({
      stage: 'pgdata-probe',
      code: 'probe-failed',
      componentCleanupFailure: 'probe-cleanup-failed',
      restoreFailure: 'restoration-not-confirmed',
      releaseFailure: 'cleanup-failed',
    });
  });

  it('maps a thrown release to unconfirmed and never retries', async () => {
    const f = fixture();
    f.release.mockRejectedValue(new Error(`${password} ${hostPath}`));
    await expect(f.run()).resolves.toEqual({
      backup: published,
      releaseFailure: 'release-unconfirmed',
    });
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it('waits for restore completion before beginning release', async () => {
    const f = fixture();
    let completeRestore: (() => void) | undefined;
    jest.spyOn(f.executor, 'restore').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          f.events.push('restore-start');
          completeRestore = resolve;
        }),
    );
    const running = f.run();
    await new Promise((resolve) => setImmediate(resolve));
    expect(f.events.at(-1)).toBe('restore-start');
    expect(f.release).not.toHaveBeenCalled();
    completeRestore!();
    await running;
    expect(f.events.at(-1)).toBe('release');
  });
});
