import type {
  ContainerSnapshot,
  InternalContainerIdentity,
  InternalSourceDiscovery,
  InternalVolumeIdentity,
  QualifiedPostgresCredentials,
} from './portable-preflight';
import { platformSecurityIdentity } from './portable-platform';

export type PortableServicePlanCode =
  'service-state-invalid' | 'source-changed' | 'transition-invalid';

const MESSAGES: Record<PortableServicePlanCode, string> = {
  'service-state-invalid': 'Portable service state is not eligible for backup',
  'source-changed': 'Portable source or service identity changed',
  'transition-invalid': 'Portable service transition is not permitted',
};

export class PortableServicePlanError extends Error {
  constructor(public readonly code: PortableServicePlanCode) {
    super(MESSAGES[code]);
    this.name = 'PortableServicePlanError';
  }
}

export interface PortableServicePlan {
  readonly projectName: string;
  readonly projectRoot: string;
  readonly composeFile: string;
  readonly platform: ReturnType<typeof platformSecurityIdentity>;
  readonly services: Readonly<{
    postgres: InternalContainerIdentity;
    backend: InternalContainerIdentity | null;
    frontend: InternalContainerIdentity | null;
    migrate: readonly InternalContainerIdentity[];
  }>;
  readonly volumes: Readonly<{
    postgres: InternalVolumeIdentity;
    uploads: InternalVolumeIdentity;
  }>;
}

export interface PortableServiceTransitions {
  readonly frontendStoppedByUs: boolean;
  readonly backendStoppedByUs: boolean;
  readonly postgresStartedByUs: boolean;
}

export type PortableServiceTransition =
  'frontend-stopped' | 'backend-stopped' | 'postgres-started';

const credentialsByPlan = new WeakMap<
  PortableServicePlan,
  QualifiedPostgresCredentials
>();
const transitionPlans = new WeakMap<
  PortableServiceTransitions,
  PortableServicePlan
>();
const consumedTransitions = new WeakSet<PortableServiceTransitions>();

function fail(code: PortableServicePlanCode): never {
  throw new PortableServicePlanError(code);
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function frozenClone<T>(value: T): T {
  const clone = structuredClone(value);
  function freeze(item: unknown): void {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return;
    for (const nested of Object.values(item)) freeze(nested);
    Object.freeze(item);
  }
  freeze(clone);
  return clone;
}

function identityWithoutState(value: InternalContainerIdentity) {
  return {
    id: value.id,
    name: value.name,
    service: value.service,
    imageId: value.imageId,
    labels: value.labels,
    mounts: value.mounts,
    networks: value.networks,
    restartPolicy: value.restartPolicy,
    entrypoint: value.entrypoint,
    command: value.command,
    healthcheck: value.healthcheck,
  };
}

function matchingSingleton(
  publicValue: ContainerSnapshot | null,
  internalValue: InternalContainerIdentity | null,
): boolean {
  return publicValue === null
    ? internalValue === null
    : internalValue !== null &&
        publicValue.id === internalValue.id &&
        publicValue.service === internalValue.service &&
        publicValue.state === internalValue.state;
}

function validateObservation(
  source: InternalSourceDiscovery,
  mismatchCode: PortableServicePlanCode,
): void {
  const publicServices = source.publicSnapshot.services;
  const internal = source.serviceIdentities;
  if (
    !matchingSingleton(publicServices.postgres, internal.postgres) ||
    !matchingSingleton(publicServices.backend, internal.backend) ||
    !matchingSingleton(publicServices.frontend, internal.frontend) ||
    publicServices.migrate.length !== internal.migrate.length ||
    !publicServices.migrate.every((migration, index) => {
      const identity = internal.migrate[index];
      return (
        identity !== undefined &&
        migration.id === identity.id &&
        migration.state === identity.state
      );
    })
  )
    fail(mismatchCode);
  if (internal.migrate.some((migration) => migration.state !== 'exited'))
    fail('service-state-invalid');
}

/** Build a read-only backup plan. It performs no Docker calls or mutations. */
export function createPortableServicePlan(
  source: InternalSourceDiscovery,
): PortableServicePlan {
  validateObservation(source, 'service-state-invalid');
  const postgres = source.serviceIdentities.postgres;
  if (!postgres || postgres.state === 'created') fail('service-state-invalid');
  if (postgres.state !== 'running' && postgres.state !== 'exited')
    fail('service-state-invalid');
  const plan: PortableServicePlan = Object.freeze({
    projectName: source.publicSnapshot.projectName,
    projectRoot: source.publicSnapshot.projectRoot,
    composeFile: source.publicSnapshot.composeFile,
    platform: frozenClone(platformSecurityIdentity(source.platform)),
    services: Object.freeze({
      postgres: frozenClone(postgres),
      backend: frozenClone(source.serviceIdentities.backend),
      frontend: frozenClone(source.serviceIdentities.frontend),
      migrate: frozenClone(source.serviceIdentities.migrate),
    }),
    volumes: Object.freeze({
      postgres: frozenClone(source.volumeIdentities.postgres),
      uploads: frozenClone(source.volumeIdentities.uploads),
    }),
  });
  credentialsByPlan.set(plan, frozenClone(source.postgresCredentials));
  return plan;
}

/** Internal-only credential access. The secret object is deliberately absent
 * from the serializable plan and all public lease/snapshot surfaces. */
export function postgresCredentialsForPlan(
  plan: PortableServicePlan,
): QualifiedPostgresCredentials {
  const credentials = credentialsByPlan.get(plan);
  if (!credentials) fail('source-changed');
  return credentials;
}

function authenticTransitions(
  plan: PortableServicePlan,
  values: PortableServiceTransitions,
): void {
  if (transitionPlans.get(values) !== plan || consumedTransitions.has(values))
    fail('transition-invalid');
}

function createTransitions(
  plan: PortableServicePlan,
  values: PortableServiceTransitions,
): PortableServiceTransitions {
  const transitions = Object.freeze({ ...values });
  transitionPlans.set(transitions, plan);
  return transitions;
}

export function initialPortableServiceTransitions(
  plan: PortableServicePlan,
): PortableServiceTransitions {
  return createTransitions(plan, {
    frontendStoppedByUs: false,
    backendStoppedByUs: false,
    postgresStartedByUs: false,
  });
}

export function recordPortableServiceTransition(
  plan: PortableServicePlan,
  transitions: PortableServiceTransitions,
  transition: PortableServiceTransition,
): PortableServiceTransitions {
  authenticTransitions(plan, transitions);
  let next: PortableServiceTransitions;
  if (transition === 'frontend-stopped') {
    if (
      plan.services.frontend?.state !== 'running' ||
      transitions.frontendStoppedByUs
    )
      fail('transition-invalid');
    next = { ...transitions, frontendStoppedByUs: true };
    consumedTransitions.add(transitions);
    return createTransitions(plan, next);
  }
  const frontendQuiescent =
    plan.services.frontend?.state !== 'running' ||
    transitions.frontendStoppedByUs;
  if (transition === 'backend-stopped') {
    if (
      !frontendQuiescent ||
      plan.services.backend?.state !== 'running' ||
      transitions.backendStoppedByUs
    )
      fail('transition-invalid');
    next = { ...transitions, backendStoppedByUs: true };
    consumedTransitions.add(transitions);
    return createTransitions(plan, next);
  }
  const backendQuiescent =
    plan.services.backend?.state !== 'running' ||
    transitions.backendStoppedByUs;
  if (
    !frontendQuiescent ||
    !backendQuiescent ||
    plan.services.postgres.state !== 'exited' ||
    transitions.postgresStartedByUs
  )
    fail('transition-invalid');
  next = { ...transitions, postgresStartedByUs: true };
  consumedTransitions.add(transitions);
  return createTransitions(plan, next);
}

function compatibleState(
  initial: InternalContainerIdentity,
  current: InternalContainerIdentity['state'],
  stoppedByUs: boolean,
  startedByUs: boolean,
): boolean {
  // d1 models the abstract postcondition only. d2 must qualify and then
  // narrow the concrete Docker state produced by each mutation command.
  if (stoppedByUs) return current === 'exited' || current === 'created';
  if (startedByUs) return current === 'running';
  return current === initial.state;
}

/** Accept only unchanged identity plus the abstract transitions explicitly
 * recorded by JobTracker. Docker command semantics remain a d2 concern. */
export function assertPortableServiceObservation(
  plan: PortableServicePlan,
  transitions: PortableServiceTransitions,
  observed: InternalSourceDiscovery,
): void {
  authenticTransitions(plan, transitions);
  if (
    Object.keys(transitions).length !== 3 ||
    typeof transitions.frontendStoppedByUs !== 'boolean' ||
    typeof transitions.backendStoppedByUs !== 'boolean' ||
    typeof transitions.postgresStartedByUs !== 'boolean' ||
    (transitions.frontendStoppedByUs &&
      plan.services.frontend?.state !== 'running') ||
    (transitions.backendStoppedByUs &&
      plan.services.backend?.state !== 'running') ||
    (transitions.postgresStartedByUs &&
      plan.services.postgres.state !== 'exited') ||
    (transitions.backendStoppedByUs &&
      plan.services.frontend?.state === 'running' &&
      !transitions.frontendStoppedByUs) ||
    (transitions.postgresStartedByUs &&
      ((plan.services.frontend?.state === 'running' &&
        !transitions.frontendStoppedByUs) ||
        (plan.services.backend?.state === 'running' &&
          !transitions.backendStoppedByUs)))
  )
    fail('transition-invalid');
  validateObservation(observed, 'source-changed');
  if (
    observed.publicSnapshot.projectName !== plan.projectName ||
    observed.publicSnapshot.projectRoot !== plan.projectRoot ||
    observed.publicSnapshot.composeFile !== plan.composeFile ||
    !equal(platformSecurityIdentity(observed.platform), plan.platform) ||
    !equal(observed.volumeIdentities, plan.volumes) ||
    !equal(observed.postgresCredentials, postgresCredentialsForPlan(plan)) ||
    !equal(observed.serviceIdentities.migrate, plan.services.migrate)
  )
    fail('source-changed');

  const checks = [
    {
      initial: plan.services.postgres,
      current: observed.serviceIdentities.postgres,
      stopped: false,
      started: transitions.postgresStartedByUs,
    },
    {
      initial: plan.services.backend,
      current: observed.serviceIdentities.backend,
      stopped: transitions.backendStoppedByUs,
      started: false,
    },
    {
      initial: plan.services.frontend,
      current: observed.serviceIdentities.frontend,
      stopped: transitions.frontendStoppedByUs,
      started: false,
    },
  ];
  for (const check of checks) {
    if (check.initial === null || check.current === null) {
      if (check.initial !== check.current) fail('source-changed');
      continue;
    }
    if (
      !equal(
        identityWithoutState(check.current),
        identityWithoutState(check.initial),
      ) ||
      !compatibleState(
        check.initial,
        check.current.state,
        check.stopped,
        check.started,
      )
    )
      fail('source-changed');
  }
}
