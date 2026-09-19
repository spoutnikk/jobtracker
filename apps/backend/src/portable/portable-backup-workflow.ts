import {
  createDockerRunner,
  DockerRunnerError,
  type DockerLimits,
} from './portable-docker';
import {
  MaintenanceError,
  preparePortableMaintenanceInternal,
  type CleanupFailure as MaintenanceCleanupFailure,
  type InternalMaintenanceContext,
  type MaintenanceCode,
  type MaintenanceDependencies,
  type MaintenanceOptions,
} from './portable-maintenance';
import {
  createPortableServicePlan,
  initialPortableServiceTransitions,
  PortableServicePlanError,
  type PortableServicePlanCode,
} from './portable-service-plan';
import {
  createPortableServiceExecutor,
  PortableServiceExecutionError,
  type PortableServiceExecutionCode,
  type PortableServiceExecutor,
} from './portable-service-executor';
import {
  probePortablePgdataWithContext,
  PortablePgdataProbeError,
  type PortablePgdataCleanupFailure,
  type PortablePgdataProbeCode,
} from './portable-pgdata-orchestrator';
import {
  qualifyPortableBackupMounts,
  PortableBackupMountsError,
  type PortableBackupMountsCode,
  type PortableBackupMountsFileSystem,
} from './portable-backup-mounts';
import {
  runPortableBackup,
  PortableBackupError,
  type PortableBackupCleanupFailure,
  type PortableBackupCode,
  type PortableBackupResult,
} from './portable-backup-orchestrator';
import type {
  DockerExecutor,
  discoverPortableSourceInternal,
} from './portable-preflight';

export interface PortableBackupWorkflowOptions extends MaintenanceOptions {
  readonly destination: string;
  /** Finite transport bound for docker wait, not a business-duration SLA. */
  readonly waitTimeoutMs: number;
  readonly stopTimeoutSeconds?: number;
}

export type PortableBackupWorkflowStage =
  | 'workflow'
  | 'maintenance'
  | 'service-plan'
  | 'service-execution'
  | 'pgdata-probe'
  | 'backup-mounts'
  | 'backup';

export type PortableBackupWorkflowCode =
  | 'workflow-failed'
  | MaintenanceCode
  | PortableServicePlanCode
  | PortableServiceExecutionCode
  | PortablePgdataProbeCode
  | PortableBackupMountsCode
  | PortableBackupCode;

export type PortableBackupWorkflowComponentCleanupFailure =
  | MaintenanceCleanupFailure
  | PortablePgdataCleanupFailure
  | PortableBackupCleanupFailure;

export type PortableBackupRestoreFailure =
  PortableServiceExecutionCode | 'workflow-failed';
export type PortableBackupReleaseFailure =
  'lock-invalid' | 'cleanup-failed' | 'release-unconfirmed';

const WORKFLOW_MESSAGE = 'Portable backup workflow failed';

export class PortableBackupWorkflowError extends Error {
  constructor(
    public readonly stage: PortableBackupWorkflowStage,
    public readonly code: PortableBackupWorkflowCode,
    public readonly componentCleanupFailure?: PortableBackupWorkflowComponentCleanupFailure,
    public readonly restoreFailure?: PortableBackupRestoreFailure,
    public readonly releaseFailure?: PortableBackupReleaseFailure,
  ) {
    super(WORKFLOW_MESSAGE);
    this.name = 'PortableBackupWorkflowError';
  }
}

export interface PortableBackupWorkflowResult {
  readonly backup: PortableBackupResult;
  readonly restoreFailure?: PortableBackupRestoreFailure;
  readonly releaseFailure?: PortableBackupReleaseFailure;
}

type Prepare = typeof preparePortableMaintenanceInternal;
type CreatePlan = typeof createPortableServicePlan;
type InitialTransitions = typeof initialPortableServiceTransitions;
type CreateExecutor = typeof createPortableServiceExecutor;
type Probe = typeof probePortablePgdataWithContext;
type QualifyMounts = typeof qualifyPortableBackupMounts;
type RunBackup = typeof runPortableBackup;

export interface PortableBackupWorkflowDependencies {
  readonly execute?: DockerExecutor;
  readonly waitExecute?: DockerExecutor;
  readonly createDockerRunner?: (
    overrides?: Partial<DockerLimits>,
  ) => DockerExecutor;
  readonly prepare?: Prepare;
  readonly createPlan?: CreatePlan;
  readonly initialTransitions?: InitialTransitions;
  readonly createExecutor?: CreateExecutor;
  readonly probe?: Probe;
  readonly qualifyMounts?: QualifyMounts;
  readonly runBackup?: RunBackup;
  readonly maintenance?: Omit<MaintenanceDependencies, 'execute' | 'discover'>;
  readonly serviceDiscover?: typeof discoverPortableSourceInternal;
  readonly mountFileSystem?: PortableBackupMountsFileSystem;
  readonly probeUuid?: () => string;
  readonly backupUuid?: () => string;
}

interface CapturedFailure {
  readonly stage: PortableBackupWorkflowStage;
  readonly code: PortableBackupWorkflowCode;
  readonly componentCleanupFailure?: PortableBackupWorkflowComponentCleanupFailure;
}

function capture(error: unknown): CapturedFailure {
  if (error instanceof MaintenanceError)
    return {
      stage: 'maintenance',
      code: error.code,
      componentCleanupFailure: error.cleanupFailure,
    };
  if (error instanceof PortableServicePlanError)
    return { stage: 'service-plan', code: error.code };
  if (error instanceof PortableServiceExecutionError)
    return { stage: 'service-execution', code: error.code };
  if (error instanceof PortablePgdataProbeError)
    return {
      stage: 'pgdata-probe',
      code: error.code,
      componentCleanupFailure: error.cleanupFailure,
    };
  if (error instanceof PortableBackupMountsError)
    return { stage: 'backup-mounts', code: error.code };
  if (error instanceof PortableBackupError)
    return {
      stage: 'backup',
      code: error.code,
      componentCleanupFailure: error.cleanupFailure,
    };
  return { stage: 'workflow', code: 'workflow-failed' };
}

function configuration(): PortableBackupWorkflowError {
  return new PortableBackupWorkflowError('workflow', 'configuration');
}

function maintenanceOptions(
  options: PortableBackupWorkflowOptions,
): MaintenanceOptions {
  return Object.freeze({
    projectRoot: options.projectRoot,
    composeFile: options.composeFile,
    projectName: options.projectName,
    env: options.env,
    image: options.image,
  });
}

export async function runPortableBackupWorkflow(
  options: PortableBackupWorkflowOptions,
  dependencies: PortableBackupWorkflowDependencies = {},
): Promise<PortableBackupWorkflowResult> {
  if (
    !Number.isSafeInteger(options.waitTimeoutMs) ||
    options.waitTimeoutMs <= 0 ||
    options.waitTimeoutMs > 2_147_483_647
  )
    throw configuration();

  const runnerFactory = dependencies.createDockerRunner ?? createDockerRunner;
  let execute: DockerExecutor;
  let waitExecute: DockerExecutor;
  try {
    execute = dependencies.execute ?? runnerFactory();
    waitExecute =
      dependencies.waitExecute ??
      runnerFactory({ timeoutMs: options.waitTimeoutMs });
  } catch (error) {
    if (error instanceof DockerRunnerError) throw configuration();
    throw new PortableBackupWorkflowError('workflow', 'workflow-failed');
  }

  const prepare = dependencies.prepare ?? preparePortableMaintenanceInternal;
  let context: InternalMaintenanceContext;
  try {
    context = await prepare(maintenanceOptions(options), {
      ...dependencies.maintenance,
      execute,
    });
  } catch (error) {
    const failure = capture(error);
    throw new PortableBackupWorkflowError(
      failure.stage,
      failure.code,
      failure.componentCleanupFailure,
    );
  }

  let executor: PortableServiceExecutor | undefined;
  let restoreRequired = false;
  let primary: CapturedFailure | undefined;
  let backup: PortableBackupResult | undefined;
  let restoreFailure: PortableBackupRestoreFailure | undefined;
  let releaseFailure: PortableBackupReleaseFailure | undefined;

  try {
    const createPlan = dependencies.createPlan ?? createPortableServicePlan;
    const plan = createPlan(context.source);
    const transitions = (
      dependencies.initialTransitions ?? initialPortableServiceTransitions
    )(plan);
    executor = (dependencies.createExecutor ?? createPortableServiceExecutor)({
      plan,
      transitions,
      source: context.source,
      execute,
      env: context.env,
      stopTimeoutSeconds: options.stopTimeoutSeconds,
      discover: dependencies.serviceDiscover,
    });

    restoreRequired = true;
    await executor.quiesceApplication();
    await executor.ensurePostgresRunning();

    await (dependencies.probe ?? probePortablePgdataWithContext)(context, {
      execute,
      uuid: dependencies.probeUuid,
    });
    const mounts = await (
      dependencies.qualifyMounts ?? qualifyPortableBackupMounts
    )(context, options.destination, dependencies.mountFileSystem);
    backup = await (dependencies.runBackup ?? runPortableBackup)(
      context,
      mounts,
      { execute, waitExecute, uuid: dependencies.backupUuid },
    );
  } catch (error) {
    primary = capture(error);
  } finally {
    if (restoreRequired && executor) {
      try {
        await executor.restore();
      } catch (error) {
        restoreFailure =
          error instanceof PortableServiceExecutionError
            ? error.code
            : 'workflow-failed';
      }
    }
    try {
      const released = await context.lease.release();
      if (!released.released) releaseFailure = released.error;
    } catch {
      releaseFailure = 'release-unconfirmed';
    }
  }

  if (backup) return Object.freeze({ backup, restoreFailure, releaseFailure });
  const failure = primary ?? {
    stage: 'workflow' as const,
    code: 'workflow-failed' as const,
  };
  throw new PortableBackupWorkflowError(
    failure.stage,
    failure.code,
    failure.componentCleanupFailure,
    restoreFailure,
    releaseFailure,
  );
}
