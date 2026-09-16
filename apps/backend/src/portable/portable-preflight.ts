import { isAbsolute, resolve } from 'node:path';

export type PreflightErrorCode =
  | 'configuration'
  | 'source-missing'
  | 'source-partial'
  | 'source-mismatch'
  | 'ambiguous'
  | 'migration-active'
  | 'unsafe-state'
  | 'unexpected-volume-user'
  | 'docker-failure';

const MESSAGES: Record<PreflightErrorCode, string> = {
  configuration: 'Unsupported or invalid JobTracker Compose configuration',
  'source-missing': 'Both source volumes are missing',
  'source-partial': 'Only one source volume exists',
  'source-mismatch': 'Source identity, labels or mounts do not match',
  ambiguous: 'Multiple containers exist for a singleton service',
  'migration-active': 'A migration container is active or pending',
  'unsafe-state': 'A container has an unsafe or inconsistent state',
  'unexpected-volume-user': 'An unexpected container uses a source volume',
  'docker-failure': 'Docker discovery failed or returned invalid data',
};
export class PreflightError extends Error {
  constructor(public readonly code: PreflightErrorCode) {
    super(MESSAGES[code]);
    this.name = 'PreflightError';
  }
}
function fail(code: PreflightErrorCode): never {
  throw new PreflightError(code);
}

/** Caller supplies execution; this module never starts a process or invokes a shell.
 * Execute command/args directly, with this cwd/env, and bound process time/output.
 * stdout/stderr are private inputs: never log raw discovery output.
 */
export interface DockerRequest {
  readonly command: 'docker';
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<NodeJS.ProcessEnv>;
}
export type DockerExecutor = (request: DockerRequest) => Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}>;

export interface PreflightOptions {
  readonly projectRoot: string;
  readonly composeFile: string;
  readonly projectName?: string;
  readonly env?: Readonly<NodeJS.ProcessEnv>;
}
type Service = 'postgres' | 'backend' | 'frontend' | 'migrate';
type LogicalVolume = 'postgres_data' | 'uploads_data';
export interface VolumeSnapshot {
  readonly logicalName: LogicalVolume;
  readonly physicalName: string;
  readonly driver: 'local';
}
export interface MountSnapshot {
  readonly type: 'volume';
  readonly name: string;
  readonly destination: string;
  readonly readWrite: true;
}
export interface NetworkSnapshot {
  readonly name: string;
  readonly id: string;
  readonly aliases: readonly string[];
}
export interface ContainerSnapshot {
  readonly id: string;
  readonly service: Service;
  readonly projectName: string;
  readonly oneOff: boolean;
  readonly state: 'running' | 'exited' | 'created';
  readonly running: boolean;
  readonly health: 'healthy' | 'unhealthy' | 'starting' | null;
  readonly mounts: readonly MountSnapshot[];
  readonly networks: readonly NetworkSnapshot[];
}
export interface PreflightSnapshot {
  readonly projectName: string;
  readonly projectRoot: string;
  readonly composeFile: string;
  readonly volumes: {
    readonly postgres: VolumeSnapshot;
    readonly uploads: VolumeSnapshot;
  };
  readonly services: {
    readonly postgres: ContainerSnapshot | null;
    readonly backend: ContainerSnapshot | null;
    readonly frontend: ContainerSnapshot | null;
    readonly migrate: readonly ContainerSnapshot[];
  };
}
const SERVICES: readonly Service[] = [
  'postgres',
  'backend',
  'frontend',
  'migrate',
];
const LOGICAL: readonly LogicalVolume[] = ['postgres_data', 'uploads_data'];
const TARGETS = {
  postgres: '/var/lib/postgresql/data',
  backend: '/app/apps/backend/uploads',
} as const;
const PROJECT_LABEL = 'com.docker.compose.project';
const SERVICE_LABEL = 'com.docker.compose.service';
const VOLUME_LABEL = 'com.docker.compose.volume';
const ONEOFF_LABEL = 'com.docker.compose.oneoff';

function object(
  value: unknown,
  code: PreflightErrorCode,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}
function array(value: unknown, code: PreflightErrorCode): unknown[] {
  if (!Array.isArray(value)) fail(code);
  return value;
}
function json(text: string, code: PreflightErrorCode): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail(code);
  }
}
function name(value: unknown, code: PreflightErrorCode): string {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value) ||
    /[\r\n]/.test(value)
  )
    fail(code);
  return value;
}
function project(value: unknown): string {
  const result = name(value, 'configuration');
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(result)) fail('configuration');
  return result;
}
function id(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value) ||
    value.length !== 64
  )
    fail('docker-failure');
  return value;
}
function emptyOptions(value: unknown, code: PreflightErrorCode) {
  if (
    value !== undefined &&
    value !== null &&
    Object.keys(object(value, code)).length !== 0
  )
    fail(code);
}

/** Validate the current repository contract, not arbitrary Compose deployments. */
function configuration(value: unknown) {
  const config = object(value, 'configuration');
  const projectName = project(config.name);
  const volumes = object(config.volumes, 'configuration');
  if (Object.keys(volumes).length !== LOGICAL.length) fail('configuration');
  const names = {} as Record<LogicalVolume, string>;
  for (const logical of LOGICAL) {
    const volume = object(volumes[logical], 'configuration');
    if (
      (volume.external !== undefined && volume.external !== false) ||
      (volume.driver !== undefined && volume.driver !== 'local')
    )
      fail('configuration');
    emptyOptions(volume.driver_opts, 'configuration');
    names[logical] = name(volume.name, 'configuration');
  }
  if (names.postgres_data === names.uploads_data) fail('configuration');
  const services = object(config.services, 'configuration');
  if (Object.keys(services).length !== SERVICES.length) fail('configuration');
  for (const service of SERVICES) {
    const entry = object(services[service], 'configuration');
    const mounts = array(entry.volumes ?? [], 'configuration');
    if (service === 'postgres' || service === 'backend') {
      if (mounts.length !== 1) fail('configuration');
      const mount = object(mounts[0], 'configuration');
      const logical = service === 'postgres' ? 'postgres_data' : 'uploads_data';
      if (
        mount.type !== 'volume' ||
        mount.source !== logical ||
        mount.target !== TARGETS[service] ||
        (mount.read_only !== undefined && mount.read_only !== false)
      )
        fail('configuration');
      if (mount.volume !== undefined) {
        const options = object(mount.volume, 'configuration');
        if (options.subpath !== undefined) fail('configuration');
      }
    } else if (mounts.length) fail('configuration');
  }
  return { projectName, names };
}

/** Read-only discovery. The snapshot is a point-in-time observation, not a lock,
 * a PG_VERSION probe, or proof that the data is a usable PostgreSQL cluster.
 */
export async function discoverPortableSource(
  options: PreflightOptions,
  execute: DockerExecutor,
): Promise<PreflightSnapshot> {
  if (
    !isAbsolute(options.projectRoot) ||
    !options.composeFile.trim() ||
    options.projectRoot.includes('\0') ||
    options.composeFile.includes('\0')
  )
    fail('configuration');
  const projectRoot = resolve(options.projectRoot);
  const composeFile = resolve(projectRoot, options.composeFile);
  const env = Object.freeze({ ...(options.env ?? process.env) });
  const explicit =
    options.projectName === undefined
      ? undefined
      : project(options.projectName);
  const envProject =
    explicit || !env.COMPOSE_PROJECT_NAME
      ? undefined
      : project(env.COMPOSE_PROJECT_NAME);
  async function docker(args: string[]): Promise<string> {
    try {
      const result = await execute({
        command: 'docker',
        args: Object.freeze(args),
        cwd: projectRoot,
        env,
      });
      if (result.exitCode !== 0 || typeof result.stdout !== 'string')
        fail('docker-failure');
      return result.stdout;
    } catch {
      fail('docker-failure');
    }
  }
  const composeArgs = [
    'compose',
    '--project-directory',
    projectRoot,
    '-f',
    composeFile,
  ];
  if (explicit) composeArgs.push('--project-name', explicit);
  const config = configuration(
    json(
      await docker([...composeArgs, 'config', '--format', 'json']),
      'configuration',
    ),
  );
  const { projectName, names } = config;
  if (
    (explicit ?? envProject) !== undefined &&
    projectName !== (explicit ?? envProject)
  )
    fail('configuration');

  // Listing first distinguishes absence from an inspect/daemon failure without parsing stderr.
  const listed = await docker(['volume', 'ls', '--format', '{{json .Name}}']);
  const existing = new Set(
    listed
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => name(json(line, 'docker-failure'), 'docker-failure')),
  );
  const present = LOGICAL.filter((logical) => existing.has(names[logical]));
  if (!present.length) fail('source-missing');
  if (present.length !== 2) fail('source-partial');
  const volumes = {} as Record<LogicalVolume, VolumeSnapshot>;
  for (const logical of LOGICAL) {
    const output = array(
      json(
        await docker(['volume', 'inspect', names[logical]]),
        'docker-failure',
      ),
      'docker-failure',
    );
    if (output.length !== 1) fail('docker-failure');
    const volume = object(output[0], 'docker-failure');
    const labels = object(volume.Labels, 'source-mismatch');
    if (
      volume.Name !== names[logical] ||
      labels[PROJECT_LABEL] !== projectName ||
      labels[VOLUME_LABEL] !== logical ||
      volume.Driver !== 'local' ||
      volume.Scope !== 'local'
    )
      fail('source-mismatch');
    emptyOptions(volume.Options, 'source-mismatch');
    volumes[logical] = Object.freeze({
      logicalName: logical,
      physicalName: names[logical],
      driver: 'local',
    });
  }
  async function containers(filter: string): Promise<string[]> {
    const output = await docker([
      'ps',
      '--all',
      '--no-trunc',
      '--filter',
      filter,
      '--format',
      '{{.ID}}',
    ]);
    const ids = output
      .split('\n')
      .filter((line) => line.trim())
      .map((value) => id(value));
    if (new Set(ids).size !== ids.length) fail('docker-failure');
    return ids;
  }
  const projectIds = await containers(`label=${PROJECT_LABEL}=${projectName}`);
  const volumeUsers = new Map<LogicalVolume, string[]>();
  for (const logical of LOGICAL)
    volumeUsers.set(logical, await containers(`volume=${names[logical]}`));
  const allIds = [
    ...new Set([...projectIds, ...[...volumeUsers.values()].flat()]),
  ].sort();
  const services: {
    postgres: ContainerSnapshot | null;
    backend: ContainerSnapshot | null;
    frontend: ContainerSnapshot | null;
    migrate: ContainerSnapshot[];
  } = { postgres: null, backend: null, frontend: null, migrate: [] };
  for (const containerId of allIds) {
    const output = array(
      json(
        await docker(['container', 'inspect', containerId]),
        'docker-failure',
      ),
      'docker-failure',
    );
    if (output.length !== 1) fail('docker-failure');
    const container = object(output[0], 'docker-failure');
    if (container.Id !== containerId) fail('source-mismatch');
    const labels = object(
      object(container.Config, 'docker-failure').Labels ?? {},
      'source-mismatch',
    );
    const mounts = array(container.Mounts, 'docker-failure').map((m) =>
      object(m, 'docker-failure'),
    );
    const usesSource = mounts.some(
      (m) =>
        m.Type === 'volume' &&
        LOGICAL.some((logical) => m.Name === names[logical]),
    );
    const discoveredAsUser = [...volumeUsers.values()].some((ids) =>
      ids.includes(containerId),
    );
    if (labels[PROJECT_LABEL] !== projectName)
      fail(
        usesSource || discoveredAsUser
          ? 'unexpected-volume-user'
          : 'source-mismatch',
      );
    if (!SERVICES.includes(labels[SERVICE_LABEL] as Service))
      fail(
        usesSource || discoveredAsUser
          ? 'unexpected-volume-user'
          : 'source-mismatch',
      );
    const service = labels[SERVICE_LABEL] as Service;
    if (!projectIds.includes(containerId)) fail('source-mismatch');
    for (const logical of LOGICAL) {
      const mounted = mounts.some(
        (m) => m.Type === 'volume' && m.Name === names[logical],
      );
      if (mounted !== volumeUsers.get(logical)!.includes(containerId))
        fail('source-mismatch');
      const allowed = logical === 'postgres_data' ? 'postgres' : 'backend';
      if (mounted && service !== allowed) fail('unexpected-volume-user');
    }
    const oneOffLabel = labels[ONEOFF_LABEL];
    if (oneOffLabel !== 'True' && oneOffLabel !== 'False')
      fail('source-mismatch');
    if (service !== 'migrate' && oneOffLabel === 'True') fail('ambiguous');
    const state = object(container.State, 'unsafe-state');
    const status = state.Status;
    if (
      service === 'migrate' &&
      ['running', 'created', 'paused', 'restarting', 'removing'].includes(
        status as string,
      )
    )
      fail('migration-active');
    if (status !== 'running' && status !== 'exited' && status !== 'created')
      fail('unsafe-state');
    if (
      state.Running !== (status === 'running') ||
      state.Paused !== false ||
      state.Restarting !== false ||
      state.Dead !== false
    )
      fail('unsafe-state');
    let health: ContainerSnapshot['health'] = null;
    if (state.Health !== undefined) {
      const healthValue = object(state.Health, 'unsafe-state').Status;
      if (
        healthValue !== 'healthy' &&
        healthValue !== 'unhealthy' &&
        healthValue !== 'starting'
      )
        fail('unsafe-state');
      health = healthValue;
    }
    // Health is observed, not awaited. Stable running unhealthy/starting services
    // can still be stopped by the next stage; no readiness claim is made here.
    const validatedMounts: MountSnapshot[] = [];
    if (service === 'postgres' || service === 'backend') {
      const expectedName =
        service === 'postgres' ? names.postgres_data : names.uploads_data;
      if (mounts.length !== 1) fail('source-mismatch');
      const mount = mounts[0];
      if (
        mount.Type !== 'volume' ||
        mount.Name !== expectedName ||
        mount.Destination !== TARGETS[service] ||
        mount.RW !== true
      )
        fail('source-mismatch');
      // Compose named volumes use HostConfig.Mounts (Source is the physical
      // name, Target the container path). Mounts alone hides volume subpaths.
      const hostConfig = object(container.HostConfig, 'source-mismatch');
      const specifications = array(hostConfig.Mounts, 'source-mismatch').map(
        (value) => object(value, 'source-mismatch'),
      );
      const candidates = specifications.filter(
        (spec) =>
          spec.Source === expectedName || spec.Target === mount.Destination,
      );
      if (candidates.length !== 1) fail('source-mismatch');
      const specification = candidates[0];
      if (
        specification.Type !== 'volume' ||
        specification.Source !== expectedName ||
        specification.Target !== mount.Destination ||
        (specification.ReadOnly !== undefined &&
          specification.ReadOnly !== false)
      )
        fail('source-mismatch');
      if (specification.VolumeOptions !== undefined) {
        const volumeOptions = object(
          specification.VolumeOptions,
          'source-mismatch',
        );
        // Docker omits the empty string; accept an explicit empty string too.
        if (volumeOptions.Subpath !== undefined && volumeOptions.Subpath !== '')
          fail('source-mismatch');
      }
      validatedMounts.push(
        Object.freeze({
          type: 'volume',
          name: expectedName,
          destination: TARGETS[service],
          readWrite: true,
        }),
      );
    } else if (mounts.length) fail('source-mismatch');
    const networks = object(
      object(container.NetworkSettings, 'docker-failure').Networks,
      'docker-failure',
    );
    const validatedNetworks = Object.entries(networks).map(
      ([networkName, value]) => {
        const network = object(value, 'docker-failure');
        // Stopped/created containers may have no attached network ID yet.
        const networkId = network.NetworkID === '' ? '' : id(network.NetworkID);
        const aliases = array(network.Aliases ?? [], 'docker-failure').map(
          (alias) => name(alias, 'docker-failure'),
        );
        return Object.freeze({
          name: name(networkName, 'docker-failure'),
          id: networkId,
          aliases: Object.freeze(aliases),
        });
      },
    );
    const snapshot: ContainerSnapshot = Object.freeze({
      id: containerId,
      service,
      projectName,
      oneOff: oneOffLabel === 'True',
      state: status,
      running: state.Running,
      health,
      mounts: Object.freeze(validatedMounts),
      networks: Object.freeze(validatedNetworks),
    });
    if (service === 'migrate') services.migrate.push(snapshot);
    else {
      if (services[service]) fail('ambiguous');
      services[service] = snapshot;
    }
  }
  return Object.freeze({
    projectName,
    projectRoot,
    composeFile,
    volumes: Object.freeze({
      postgres: volumes.postgres_data,
      uploads: volumes.uploads_data,
    }),
    services: Object.freeze({
      ...services,
      migrate: Object.freeze(services.migrate),
    }),
  });
}
