import { randomUUID } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { createDockerRunner, dockerEnvironment } from './portable-docker';
import {
  discoverPortableSource,
  discoverPortableSourceInternal,
  PreflightError,
  type ContainerSnapshot,
  type DockerExecutor,
  type InternalSourceDiscovery,
  type PreflightOptions,
  type PreflightSnapshot,
} from './portable-preflight';
import { platformSecurityIdentity } from './portable-platform';

export type MaintenanceCode =
  | 'configuration'
  | 'docker-runner'
  | 'image-invalid'
  | 'lock-held'
  | 'lock-invalid'
  | 'source-changed'
  | 'cleanup-failed';
export type CleanupFailure =
  'lock-invalid' | 'cleanup-failed' | 'ownership-unconfirmed';
const MESSAGES: Record<MaintenanceCode, string> = {
  configuration: 'Invalid maintenance options',
  'docker-runner': 'Docker maintenance command failed',
  'image-invalid': 'A compatible local maintenance image is required',
  'lock-held': 'The maintenance lock name is already reserved',
  'lock-invalid': 'Maintenance lock identity or configuration does not match',
  'source-changed': 'Source changed or could not be revalidated after locking',
  'cleanup-failed': 'Maintenance lock cleanup failed',
};
export class MaintenanceError extends Error {
  constructor(
    public readonly code: MaintenanceCode,
    public readonly cleanupFailure?: CleanupFailure,
  ) {
    super(MESSAGES[code]);
    this.name = 'MaintenanceError';
  }
}
export type ReleaseResult = Readonly<
  | { released: true }
  | { released: false; error: 'lock-invalid' | 'cleanup-failed' }
>;
export interface MaintenanceLease {
  readonly operationId: string;
  readonly source: PreflightSnapshot;
  readonly lock: Readonly<{ id: string; name: string }>;
  release(): Promise<ReleaseResult>;
}
export interface MaintenanceOptions extends PreflightOptions {
  /** Trusted maintenance image, already present locally; no VOLUME declarations. */
  readonly image: string;
}
export interface MaintenanceDependencies {
  readonly execute?: DockerExecutor;
  readonly discover?: typeof discoverPortableSource;
  readonly discoverInternal?: typeof discoverPortableSourceInternal;
  readonly uuid?: () => string;
  readonly now?: () => Date;
}
const LABELS = {
  kind: 'org.jobtracker.maintenance.kind',
  project: 'org.jobtracker.maintenance.project',
  operation: 'org.jobtracker.maintenance.operation',
  created: 'org.jobtracker.maintenance.created-at',
} as const;
const PROXY_KEYS = [
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
function environmentEntries(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const keys = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.indexOf('=') <= 0) return undefined;
    const key = entry.slice(0, entry.indexOf('='));
    if (keys.has(key)) return undefined;
    keys.add(key);
  }
  return [...(value as string[])].sort();
}
const COMMAND = ['-e', 'process.exit(0)'];
const IMAGE_ENV_KEYS = new Set([
  'PATH',
  'NODE_VERSION',
  'YARN_VERSION',
  'NODE_ENV',
  'LANG',
]);
function fail(code: MaintenanceCode): never {
  throw new MaintenanceError(code);
}
function record(
  value: unknown,
  code: MaintenanceCode,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}
function parse(text: string, code: MaintenanceCode): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail(code);
  }
}
function singleton(
  text: string,
  code: MaintenanceCode,
): Record<string, unknown> {
  const value = parse(text, code);
  if (!Array.isArray(value) || value.length !== 1) fail(code);
  return record(value[0], code);
}
function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === 64 &&
    /^[a-f0-9]{64}$/.test(value)
  );
}
function empty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'object' && Object.keys(value).length === 0)
  );
}
function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function containerIdentity(c: ContainerSnapshot | null) {
  if (!c) return null;
  return {
    id: c.id,
    service: c.service,
    projectName: c.projectName,
    oneOff: c.oneOff,
    state: c.state,
    running: c.running,
    health: c.health,
    mounts: c.mounts
      .map((m) => ({
        type: m.type,
        name: m.name,
        destination: m.destination,
        readWrite: m.readWrite,
      }))
      .sort((a, b) => a.destination.localeCompare(b.destination)),
    networks: c.networks
      .map((n) => ({ name: n.name, id: n.id, aliases: [...n.aliases].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
function sourceIdentity(source: PreflightSnapshot) {
  return {
    projectName: source.projectName,
    projectRoot: source.projectRoot,
    composeFile: source.composeFile,
    volumes: [source.volumes.postgres, source.volumes.uploads].map((v) => ({
      logicalName: v.logicalName,
      physicalName: v.physicalName,
      driver: v.driver,
    })),
    services: {
      postgres: containerIdentity(source.services.postgres),
      backend: containerIdentity(source.services.backend),
      frontend: containerIdentity(source.services.frontend),
      migrate: [...source.services.migrate]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(containerIdentity),
    },
  };
}
function internalSourceIdentity(source: InternalSourceDiscovery) {
  const canonicalRecord = (value: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(
      Object.entries(value).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    );
  const volume = (
    value: InternalSourceDiscovery['volumeIdentities']['postgres'],
  ) => ({
    logicalName: value.logicalName,
    physicalName: value.physicalName,
    driver: value.driver,
    scope: value.scope,
    labels: canonicalRecord(value.labels),
    options: canonicalRecord(value.options),
    mountpoint: value.mountpoint,
    dockerRootDir: value.dockerRootDir,
    userIds: [...value.userIds].sort(),
  });
  return {
    public: sourceIdentity(source.publicSnapshot),
    platform: platformSecurityIdentity(source.platform),
    volumes: {
      postgres: volume(source.volumeIdentities.postgres),
      uploads: volume(source.volumeIdentities.uploads),
    },
  };
}

export function assertSameInternalSource(
  initial: InternalSourceDiscovery,
  verified: InternalSourceDiscovery,
): void {
  if (!equal(internalSourceIdentity(initial), internalSourceIdentity(verified)))
    fail('source-changed');
}
/** Explicit field comparison; ordering of migrations, networks and aliases is immaterial. */
export function assertSameSource(
  initial: PreflightSnapshot,
  verified: PreflightSnapshot,
): void {
  if (!equal(sourceIdentity(initial), sourceIdentity(verified)))
    fail('source-changed');
}

/** Portable v1 requires no external changes to resource identity during the lease.
 * This lock excludes cooperating JobTracker maintenance only. It is deliberately
 * NOT a Compose service and never references source volumes or PGDATA.
 */
export async function preparePortableMaintenance(
  options: MaintenanceOptions,
  dependencies: MaintenanceDependencies = {},
): Promise<MaintenanceLease> {
  const execute = dependencies.execute ?? createDockerRunner();
  const discover = dependencies.discover;
  const discoverInternal =
    dependencies.discoverInternal ??
    (discover === undefined ? discoverPortableSourceInternal : undefined);
  let env: Readonly<NodeJS.ProcessEnv>;
  let operationId: string;
  let createdAt: string;
  try {
    env = Object.freeze(dockerEnvironment(options.env ?? process.env));
    operationId = (dependencies.uuid ?? randomUUID)();
    createdAt = (dependencies.now ?? (() => new Date()))().toISOString();
  } catch {
    fail('configuration');
  }
  if (
    !isAbsolute(options.projectRoot) ||
    !options.image ||
    options.image.startsWith('-') ||
    /[\s\0]/.test(options.image) ||
    operationId.length !== 36 ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(operationId) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt)
  )
    fail('configuration');
  const preflightOptions: PreflightOptions = {
    ...options,
    projectRoot: resolve(options.projectRoot),
    env,
  };
  let initial: PreflightSnapshot;
  let initialInternal: InternalSourceDiscovery | undefined;
  try {
    if (discoverInternal) {
      initialInternal = await discoverInternal(preflightOptions, execute);
      initial = initialInternal.publicSnapshot;
    } else initial = await discover!(preflightOptions, execute);
  } catch (error) {
    if (error instanceof PreflightError) throw error;
    fail('docker-runner');
  }
  if (
    !/^[a-z0-9][a-z0-9_-]*$/.test(initial.projectName) ||
    /[\r\n]/.test(initial.projectName)
  )
    fail('configuration');
  const lockName = `${initial.projectName}-jobtracker-maintenance-lock`;
  const labels = Object.freeze({
    [LABELS.kind]: 'lock',
    [LABELS.project]: initial.projectName,
    [LABELS.operation]: operationId,
    [LABELS.created]: createdAt,
  });
  async function call(args: string[]) {
    try {
      return await execute({
        command: 'docker',
        args: Object.freeze(args),
        cwd: preflightOptions.projectRoot,
        env,
      });
    } catch {
      fail('docker-runner');
    }
  }
  async function checked(args: string[], code: MaintenanceCode) {
    const result = await call(args);
    if (result.exitCode !== 0) fail(code);
    return result.stdout;
  }
  // Docker list output is inspected structurally; stderr is never used to
  // distinguish absence, conflict, permission failure or daemon failure.
  async function listLocks(): Promise<{ id: string; name: string }[]> {
    const output = await checked(
      ['container', 'ls', '--all', '--no-trunc', '--format', '{{json .}}'],
      'docker-runner',
    );
    return output
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const row = record(parse(line, 'docker-runner'), 'docker-runner');
        if (!validId(row.ID) || typeof row.Names !== 'string')
          fail('docker-runner');
        return { id: row.ID, name: row.Names };
      });
  }
  if ((await listLocks()).some((c) => c.name === lockName)) fail('lock-held');
  // Pin the inspected ID: a tag change cannot introduce inherited VOLUMEs.
  const image = singleton(
    await checked(['image', 'inspect', options.image], 'image-invalid'),
    'image-invalid',
  );
  if (
    typeof image.Id !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(image.Id) ||
    image.Id.length !== 71
  )
    fail('image-invalid');
  const imageId = image.Id;
  const imageConfig = record(image.Config, 'image-invalid');
  const imageLabels = record(imageConfig.Labels ?? {}, 'image-invalid');
  if (
    !empty(imageConfig.Volumes) ||
    !empty(imageConfig.OnBuild) ||
    Object.keys(imageLabels).some((k) => k.startsWith('com.docker.compose.'))
  )
    fail('image-invalid');
  if (
    !Array.isArray(imageConfig.Env) ||
    !imageConfig.Env.every(
      (v) =>
        typeof v === 'string' &&
        v.includes('=') &&
        IMAGE_ENV_KEYS.has(v.slice(0, v.indexOf('='))),
    )
  )
    fail('image-invalid');
  if (!environmentEntries(imageConfig.Env)) fail('image-invalid');
  const expectedEnv = [
    ...(imageConfig.Env as string[]),
    ...PROXY_KEYS.map((key) => `${key}=`),
  ].sort();
  const createArgs = [
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
  ];
  for (const [key, value] of Object.entries(labels))
    createArgs.push('--label', `${key}=${value}`);
  for (const key of PROXY_KEYS) createArgs.push('--env', `${key}=`);
  createArgs.push(imageId, ...COMMAND);
  let createdId: string | undefined;
  async function recoverAmbiguous(code: MaintenanceCode): Promise<never> {
    let cleanupFailure: CleanupFailure | undefined = 'ownership-unconfirmed';
    try {
      const candidate = singleton(
        await checked(['container', 'inspect', lockName], 'lock-invalid'),
        'lock-invalid',
      );
      if (validId(candidate.Id)) {
        createdId = candidate.Id;
        if (
          safeConfiguration(candidate) &&
          safeConfiguration(await inspectCreated())
        ) {
          cleanupFailure = 'cleanup-failed';
          const result = await call(['container', 'rm', createdId]);
          if (result.exitCode === 0) cleanupFailure = undefined;
        }
      }
    } catch {
      // No deletion without two complete ownership inspections.
    }
    throw new MaintenanceError(code, cleanupFailure);
  }
  let creation: Awaited<ReturnType<DockerExecutor>>;
  try {
    creation = await call(createArgs);
  } catch {
    return recoverAmbiguous('docker-runner');
  }
  if (creation.exitCode === null) return recoverAmbiguous('docker-runner');
  if (creation.exitCode !== 0) {
    // Another caller may have won the atomic name reservation. Never delete it.
    if ((await listLocks()).some((c) => c.name === lockName)) fail('lock-held');
    fail('docker-runner');
  }
  const returnedId = creation.stdout.trim();
  if (!validId(returnedId)) return recoverAmbiguous('lock-invalid');
  createdId = returnedId;

  function owned(container: Record<string, unknown>): boolean {
    if (container.Id !== createdId || container.Name !== `/${lockName}`)
      return false;
    const config = record(container.Config, 'lock-invalid');
    const actualLabels = record(config.Labels, 'lock-invalid');
    return Object.entries(labels).every(
      ([key, value]) => actualLabels[key] === value,
    );
  }
  function safeConfiguration(container: Record<string, unknown>): boolean {
    const state = record(container.State, 'lock-invalid');
    const config = record(container.Config, 'lock-invalid');
    const actualLabels = record(config.Labels, 'lock-invalid');
    const host = record(container.HostConfig, 'lock-invalid');
    const restart = record(host.RestartPolicy, 'lock-invalid');
    const networks = record(
      record(container.NetworkSettings, 'lock-invalid').Networks,
      'lock-invalid',
    );
    const isolated = Object.entries(networks).every(([key, value]) => {
      if (key !== 'none') return false;
      const network = record(value, 'lock-invalid');
      return (
        !network.IPAddress &&
        !network.GlobalIPv6Address &&
        !network.Gateway &&
        !network.IPv6Gateway
      );
    });
    return (
      owned(container) &&
      container.Image === imageId &&
      config.Image === imageId &&
      state.Status === 'created' &&
      state.Running === false &&
      state.Paused === false &&
      state.Restarting === false &&
      state.Dead === false &&
      state.StartedAt === '0001-01-01T00:00:00Z' &&
      Array.isArray(container.Mounts) &&
      container.Mounts.length === 0 &&
      empty(host.Mounts) &&
      empty(host.Binds) &&
      empty(host.VolumesFrom) &&
      empty(host.Tmpfs) &&
      empty(config.Volumes) &&
      host.NetworkMode === 'none' &&
      isolated &&
      restart.Name === 'no' &&
      restart.MaximumRetryCount === 0 &&
      host.Privileged === false &&
      host.ReadonlyRootfs === true &&
      host.AutoRemove === false &&
      empty(host.Devices) &&
      empty(host.DeviceRequests) &&
      empty(host.CapAdd) &&
      empty(host.PortBindings) &&
      (host.PidMode === '' || host.PidMode === undefined) &&
      Object.keys(actualLabels).every(
        (key) => !key.startsWith('com.docker.compose.'),
      ) &&
      equal(config.Entrypoint, ['node']) &&
      equal(config.Cmd, COMMAND) &&
      equal(environmentEntries(config.Env), expectedEnv) &&
      equal(record(config.Healthcheck, 'lock-invalid').Test, ['NONE'])
    );
  }
  async function inspectCreated() {
    if (!createdId) fail('lock-invalid');
    return singleton(
      await checked(['container', 'inspect', createdId], 'lock-invalid'),
      'lock-invalid',
    );
  }
  /** After an acquisition failure, remove only a proven-owned, never-started
   * container. No force, no -v, no cleanup by name or by an unconfirmed ID.
   */
  async function cleanupAcquisition(): Promise<CleanupFailure | undefined> {
    try {
      const container = await inspectCreated();
      const state = record(container.State, 'lock-invalid');
      if (
        !owned(container) ||
        state.Status !== 'created' ||
        state.Running !== false ||
        state.StartedAt !== '0001-01-01T00:00:00Z'
      )
        return 'lock-invalid';
      const removed = await call(['container', 'rm', container.Id as string]);
      return removed.exitCode === 0 ? undefined : 'cleanup-failed';
    } catch {
      return 'cleanup-failed';
    }
  }
  let verified: PreflightSnapshot;
  let principal: MaintenanceCode = 'lock-invalid';
  try {
    if (!safeConfiguration(await inspectCreated())) fail('lock-invalid');
    principal = 'source-changed';
    if (discoverInternal) {
      const verifiedInternal = await discoverInternal(
        preflightOptions,
        execute,
      );
      verified = verifiedInternal.publicSnapshot;
      assertSameInternalSource(initialInternal!, verifiedInternal);
    } else {
      verified = await discover!(preflightOptions, execute);
      assertSameSource(initial, verified);
    }
  } catch {
    const cleanupFailure = await cleanupAcquisition();
    throw new MaintenanceError(principal, cleanupFailure);
  }
  let released = false;
  let releasing: Promise<ReleaseResult> | undefined;
  async function releaseAttempt(): Promise<ReleaseResult> {
    try {
      const listed = await listLocks();
      if (
        listed.some(
          (c) =>
            (c.name === lockName && c.id !== createdId) ||
            (c.id === createdId && c.name !== lockName),
        )
      )
        return Object.freeze({ released: false, error: 'lock-invalid' });
      if (!listed.some((c) => c.id === createdId)) {
        released = true;
        return Object.freeze({ released: true });
      }
      if (!safeConfiguration(await inspectCreated()))
        return Object.freeze({ released: false, error: 'lock-invalid' });
      const result = await call(['container', 'rm', returnedId]);
      if (result.exitCode !== 0)
        return Object.freeze({ released: false, error: 'cleanup-failed' });
      released = true;
      return Object.freeze({ released: true });
    } catch (error) {
      return Object.freeze({
        released: false,
        error:
          error instanceof MaintenanceError && error.code === 'lock-invalid'
            ? 'lock-invalid'
            : 'cleanup-failed',
      });
    }
  }
  return Object.freeze({
    operationId,
    source: verified,
    lock: Object.freeze({ id: returnedId, name: lockName }),
    release(): Promise<ReleaseResult> {
      // Successful release is cached. Concurrent calls share one attempt;
      // failed attempts may be retried explicitly, never steal another lock.
      if (released) return Promise.resolve(Object.freeze({ released: true }));
      if (!releasing)
        releasing = releaseAttempt().finally(() => {
          releasing = undefined;
        });
      return releasing;
    },
  });
}
