import {
  discoverPortableSourceInternal,
  type DockerExecutor,
  type InternalContainerIdentity,
  type InternalSourceDiscovery,
  type PreflightOptions,
} from './portable-preflight';
import {
  assertPortableServiceObservation,
  PortableServicePlanError,
  recordPortableServiceTransition,
  type PortableServicePlan,
  type PortableServiceTransition,
  type PortableServiceTransitions,
} from './portable-service-plan';

export type PortableServiceExecutionCode =
  | 'configuration'
  | 'transition-invalid'
  | 'source-changed'
  | 'stop-not-confirmed'
  | 'start-not-confirmed'
  | 'restoration-not-confirmed';

const MESSAGES: Record<PortableServiceExecutionCode, string> = {
  configuration: 'Invalid Portable service execution configuration',
  'transition-invalid': 'Portable service transition is not permitted',
  'source-changed': 'Portable source or service identity changed',
  'stop-not-confirmed': 'Portable service stop could not be confirmed',
  'start-not-confirmed': 'Portable service start could not be confirmed',
  'restoration-not-confirmed':
    'Portable service restoration could not be confirmed',
};

export class PortableServiceExecutionError extends Error {
  constructor(public readonly code: PortableServiceExecutionCode) {
    super(MESSAGES[code]);
    this.name = 'PortableServiceExecutionError';
  }
}

export interface PortableServiceExecutorOptions {
  readonly plan: PortableServicePlan;
  readonly transitions: PortableServiceTransitions;
  readonly source: InternalSourceDiscovery;
  readonly execute: DockerExecutor;
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly stopTimeoutSeconds?: number;
  readonly discover?: typeof discoverPortableSourceInternal;
}

export interface PortableServiceExecutor {
  readonly transitions: PortableServiceTransitions;
  quiesceApplication(): Promise<void>;
  ensurePostgresRunning(): Promise<void>;
  restore(): Promise<void>;
}

type SingletonService = 'postgres' | 'backend' | 'frontend';
type Mutation = Readonly<{
  command: 'start' | 'stop';
  service: SingletonService;
  expectedState: 'running' | 'exited';
  transition: PortableServiceTransition;
  failure: PortableServiceExecutionCode;
}>;

function fail(code: PortableServiceExecutionCode): never {
  throw new PortableServiceExecutionError(code);
}

function mapPlanError(error: unknown): never {
  if (error instanceof PortableServicePlanError)
    fail(
      error.code === 'transition-invalid'
        ? 'transition-invalid'
        : 'source-changed',
    );
  fail('source-changed');
}

/** Controlled stop/start primitive. The caller owns the maintenance lease and
 * must retain it until restore() and its final revalidation have completed. */
export function createPortableServiceExecutor(
  options: PortableServiceExecutorOptions,
): PortableServiceExecutor {
  const timeout = options.stopTimeoutSeconds ?? 30;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300)
    fail('configuration');
  const discover = options.discover ?? discoverPortableSourceInternal;
  const preflight: PreflightOptions = Object.freeze({
    projectRoot: options.plan.projectRoot,
    composeFile: options.plan.composeFile,
    projectName: options.plan.projectName,
    env: options.env,
  });
  let transitions = options.transitions;
  let observation = options.source;

  function assertObservation(value: InternalSourceDiscovery): void {
    try {
      assertPortableServiceObservation(options.plan, transitions, value);
    } catch (error) {
      mapPlanError(error);
    }
  }
  assertObservation(observation);

  async function rediscover(): Promise<InternalSourceDiscovery> {
    try {
      return await discover(preflight, options.execute);
    } catch {
      fail('source-changed');
    }
  }

  function serviceIdentity(
    source: InternalSourceDiscovery,
    service: SingletonService,
  ): InternalContainerIdentity {
    const identity = source.serviceIdentities[service];
    if (!identity) fail('source-changed');
    return identity;
  }

  async function revalidate(): Promise<void> {
    const current = await rediscover();
    assertObservation(current);
    observation = current;
  }

  async function mutate(mutation: Mutation): Promise<void> {
    await revalidate();
    const identity = serviceIdentity(observation, mutation.service);
    const args =
      mutation.command === 'stop'
        ? ['container', 'stop', '--timeout', String(timeout), identity.id]
        : ['container', 'start', identity.id];
    try {
      // Any client outcome is advisory. The authoritative result is the
      // complete rediscovery performed immediately below.
      await options.execute({
        command: 'docker',
        args: Object.freeze(args),
        cwd: options.plan.projectRoot,
        env: options.env,
      });
    } catch {
      // The daemon may still have completed the mutation.
    }

    let current: InternalSourceDiscovery;
    try {
      current = await discover(preflight, options.execute);
    } catch {
      fail(mutation.failure);
    }
    const currentIdentity = current.serviceIdentities[mutation.service];
    if (!currentIdentity || currentIdentity.state !== mutation.expectedState)
      fail(mutation.failure);

    let next: PortableServiceTransitions;
    try {
      next = recordPortableServiceTransition(
        options.plan,
        transitions,
        mutation.transition,
      );
      assertPortableServiceObservation(options.plan, next, current);
    } catch (error) {
      mapPlanError(error);
    }
    transitions = next;
    observation = current;
  }

  return Object.freeze({
    get transitions() {
      return transitions;
    },
    async quiesceApplication(): Promise<void> {
      await revalidate();
      if (
        options.plan.services.frontend?.state === 'running' &&
        !transitions.frontendStoppedByUs
      )
        await mutate({
          command: 'stop',
          service: 'frontend',
          expectedState: 'exited',
          transition: 'frontend-stopped',
          failure: 'stop-not-confirmed',
        });
      if (
        options.plan.services.backend?.state === 'running' &&
        !transitions.backendStoppedByUs
      )
        await mutate({
          command: 'stop',
          service: 'backend',
          expectedState: 'exited',
          transition: 'backend-stopped',
          failure: 'stop-not-confirmed',
        });
    },
    async ensurePostgresRunning(): Promise<void> {
      await revalidate();
      const frontendQuiescent =
        options.plan.services.frontend?.state !== 'running' ||
        transitions.frontendStoppedByUs;
      const backendQuiescent =
        options.plan.services.backend?.state !== 'running' ||
        transitions.backendStoppedByUs;
      if (!frontendQuiescent || !backendQuiescent) fail('transition-invalid');
      if (options.plan.services.postgres.state === 'running') return;
      if (!transitions.postgresStartedByUs)
        await mutate({
          command: 'start',
          service: 'postgres',
          expectedState: 'running',
          transition: 'postgres-started',
          failure: 'start-not-confirmed',
        });
    },
    async restore(): Promise<void> {
      await revalidate();
      if (transitions.postgresStartedByUs)
        await mutate({
          command: 'stop',
          service: 'postgres',
          expectedState: 'exited',
          transition: 'postgres-restored',
          failure: 'restoration-not-confirmed',
        });
      if (transitions.backendStoppedByUs)
        await mutate({
          command: 'start',
          service: 'backend',
          expectedState: 'running',
          transition: 'backend-restored',
          failure: 'restoration-not-confirmed',
        });
      if (transitions.frontendStoppedByUs)
        await mutate({
          command: 'start',
          service: 'frontend',
          expectedState: 'running',
          transition: 'frontend-restored',
          failure: 'restoration-not-confirmed',
        });
      await revalidate();
    },
  });
}
