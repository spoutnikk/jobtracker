import { randomUUID } from 'node:crypto';
import { createDockerRunner } from './portable-docker';
import {
  MaintenanceError,
  preparePortableMaintenanceInternal,
  type MaintenanceDependencies,
  type MaintenanceOptions,
} from './portable-maintenance';
import type {
  DockerExecutor,
  InternalSourceDiscovery,
} from './portable-preflight';
import type { PgdataProbeResult } from './portable-pgdata-probe';

export type PortablePgdataProbeCode =
  | 'configuration'
  | 'source-changed'
  | 'image-invalid'
  | 'container-collision'
  | 'create-failed'
  | 'ownership-unconfirmed'
  | 'start-failed'
  | 'probe-failed'
  | 'cleanup-failed'
  | 'lease-release-failed';
export type PortablePgdataCleanupFailure =
  'ownership-unconfirmed' | 'probe-cleanup-failed' | 'lease-release-failed';

const MESSAGES: Record<PortablePgdataProbeCode, string> = {
  configuration: 'Invalid PGDATA probe configuration',
  'source-changed': 'Source changed before the PGDATA probe',
  'image-invalid': 'A compatible local maintenance image is required',
  'container-collision': 'The PGDATA probe container name is already reserved',
  'create-failed': 'PGDATA probe container creation failed',
  'ownership-unconfirmed':
    'PGDATA probe container ownership could not be confirmed',
  'start-failed': 'PGDATA probe container could not be started',
  'probe-failed': 'PGDATA structural probe failed',
  'cleanup-failed': 'PGDATA probe cleanup failed',
  'lease-release-failed': 'Maintenance lease release failed',
};

export class PortablePgdataProbeError extends Error {
  constructor(
    public readonly code: PortablePgdataProbeCode,
    public readonly cleanupFailure?: PortablePgdataCleanupFailure,
  ) {
    super(MESSAGES[code]);
    this.name = 'PortablePgdataProbeError';
  }
}

export interface PortablePgdataProbeDependencies {
  readonly execute?: DockerExecutor;
  readonly maintenance?: Omit<MaintenanceDependencies, 'execute' | 'discover'>;
  readonly uuid?: () => string;
  readonly prepare?: typeof preparePortableMaintenanceInternal;
}

const PROXY_KEYS = new Set([
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
]);
const IMAGE_ENV_KEYS = new Set([
  'PATH',
  'NODE_VERSION',
  'YARN_VERSION',
  'NODE_ENV',
  'LANG',
]);
const TARGET = '/probe/pgdata';
const COMMAND = ['/app/portable-pgdata-probe-cli.js'];
const SUCCESS = '{"ok":true,"postgresMajor":17}\n';

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function singleton(text: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(text) as unknown;
    return Array.isArray(value) && value.length === 1
      ? object(value[0])
      : undefined;
  } catch {
    return undefined;
  }
}
function empty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0) ||
    (Array.isArray(value) && value.length === 0)
  );
}
function validEnvironment(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry.includes('=')) return false;
    const index = entry.indexOf('=');
    const key = entry.slice(0, index);
    const content = entry.slice(index + 1);
    if (seen.has(key) || (!IMAGE_ENV_KEYS.has(key) && !PROXY_KEYS.has(key)))
      return false;
    if (PROXY_KEYS.has(key) && content !== '') return false;
    seen.add(key);
  }
  return [...PROXY_KEYS].every((key) => seen.has(key));
}
function mapMaintenance(error: unknown): PortablePgdataProbeError {
  if (!(error instanceof MaintenanceError))
    return new PortablePgdataProbeError('create-failed');
  if (error.code === 'configuration')
    return new PortablePgdataProbeError('configuration');
  if (error.code === 'image-invalid')
    return new PortablePgdataProbeError('image-invalid');
  if (error.code === 'source-changed')
    return new PortablePgdataProbeError('source-changed');
  if (error.code === 'lock-held')
    return new PortablePgdataProbeError('container-collision');
  return new PortablePgdataProbeError('create-failed');
}

export async function probePortablePgdata(
  options: MaintenanceOptions,
  dependencies: PortablePgdataProbeDependencies = {},
): Promise<PgdataProbeResult> {
  const execute = dependencies.execute ?? createDockerRunner();
  let context: Awaited<ReturnType<typeof preparePortableMaintenanceInternal>>;
  try {
    context = await (
      dependencies.prepare ?? preparePortableMaintenanceInternal
    )(options, {
      ...dependencies.maintenance,
      execute,
    });
  } catch (error) {
    throw mapMaintenance(error);
  }

  const source: InternalSourceDiscovery = context.source;
  const mountpoint = source.volumeIdentities.postgres.mountpoint;
  let suffix: string;
  try {
    suffix = (dependencies.uuid ?? randomUUID)();
  } catch {
    suffix = '';
  }
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(suffix)) {
    try {
      const released = await context.lease.release();
      if (!released.released)
        throw new PortablePgdataProbeError(
          'configuration',
          'lease-release-failed',
        );
    } catch (error) {
      if (error instanceof PortablePgdataProbeError) throw error;
      throw new PortablePgdataProbeError(
        'configuration',
        'lease-release-failed',
      );
    }
    throw new PortablePgdataProbeError('configuration');
  }
  const name = `${source.publicSnapshot.projectName}-jobtracker-pgdata-probe-${suffix}`;
  const labels = {
    'org.jobtracker.maintenance.kind': 'pgdata-probe',
    'org.jobtracker.maintenance.project': source.publicSnapshot.projectName,
    'org.jobtracker.maintenance.operation': context.lease.operationId,
  } as const;
  let createdId: string | undefined;
  let started = false;
  let primary: PortablePgdataProbeError | undefined;
  let result: PgdataProbeResult | undefined;

  const call = (args: readonly string[]) =>
    execute({
      command: 'docker',
      args,
      cwd: source.publicSnapshot.projectRoot,
      env: context.env,
    });
  async function listed(): Promise<{ id: string; name: string }[]> {
    const response = await call([
      'container',
      'ls',
      '--all',
      '--no-trunc',
      '--format',
      '{{json .}}',
    ]);
    if (response.exitCode !== 0) throw new Error();
    return response.stdout
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const row = object(JSON.parse(line) as unknown);
        if (!row || !validId(row.ID) || typeof row.Names !== 'string')
          throw new Error();
        return { id: row.ID, name: row.Names };
      });
  }
  async function inspect(
    target: string,
  ): Promise<Record<string, unknown> | undefined> {
    const response = await call(['container', 'inspect', target]);
    return response.exitCode === 0 ? singleton(response.stdout) : undefined;
  }
  function owned(container: Record<string, unknown>, id?: string): boolean {
    const config = object(container.Config);
    const actual = config && object(config.Labels);
    return (
      (!id || container.Id === id) &&
      validId(container.Id) &&
      container.Name === `/${name}` &&
      !!actual &&
      Object.keys(actual).length === Object.keys(labels).length &&
      Object.keys(labels).every(
        (key) => actual[key] === labels[key as keyof typeof labels],
      )
    );
  }
  function safe(
    container: Record<string, unknown>,
    id: string,
    neverStarted: boolean,
  ): boolean {
    if (!owned(container, id)) return false;
    const config = object(container.Config);
    const host = object(container.HostConfig);
    const state = object(container.State);
    const restart = host && object(host.RestartPolicy);
    if (!config || !host || !state || !restart) return false;
    const mounts = host.Mounts;
    if (!Array.isArray(mounts) || mounts.length !== 1) return false;
    const mount = object(mounts[0]);
    const bind = mount && object(mount.BindOptions);
    const healthcheck = object(config.Healthcheck);
    return (
      container.Image === context.imageId &&
      config.Image === context.imageId &&
      (!neverStarted ||
        (state.Status === 'created' &&
          state.Running === false &&
          state.StartedAt === '0001-01-01T00:00:00Z')) &&
      host.ReadonlyRootfs === true &&
      host.NetworkMode === 'none' &&
      restart.Name === 'no' &&
      restart.MaximumRetryCount === 0 &&
      host.AutoRemove === false &&
      host.Privileged === false &&
      JSON.stringify(config.Entrypoint) === JSON.stringify(['node']) &&
      JSON.stringify(config.Cmd) === JSON.stringify(COMMAND) &&
      validEnvironment(config.Env) &&
      !!healthcheck &&
      JSON.stringify(healthcheck.Test) === JSON.stringify(['NONE']) &&
      mount?.Type === 'bind' &&
      mount.Source === mountpoint &&
      mount.Target === TARGET &&
      mount.ReadOnly === true &&
      bind?.Propagation === 'rslave' &&
      bind.NonRecursive === true &&
      bind.CreateMountpoint === false &&
      empty(host.Binds) &&
      empty(host.VolumesFrom) &&
      empty(host.Tmpfs) &&
      empty(config.Volumes) &&
      empty(host.Devices) &&
      empty(host.DeviceRequests) &&
      empty(host.CapAdd) &&
      empty(host.PortBindings) &&
      host.PublishAllPorts === false &&
      empty(config.ExposedPorts)
    );
  }
  async function cleanup(): Promise<PortablePgdataCleanupFailure | undefined> {
    if (!createdId) return undefined;
    try {
      const rows = await listed();
      if (
        rows.some(
          (row) =>
            (row.name === name && row.id !== createdId) ||
            (row.id === createdId && row.name !== name),
        )
      )
        return 'ownership-unconfirmed';
      if (!rows.some((row) => row.id === createdId)) return undefined;
      const current = await inspect(createdId);
      if (!current || !owned(current, createdId))
        return 'ownership-unconfirmed';
      const removed = await call([
        'container',
        'rm',
        ...(started ? ['--force'] : []),
        createdId,
      ]);
      if (removed.exitCode === 0) return undefined;
      const after = await listed();
      return after.some((row) => row.id === createdId || row.name === name)
        ? 'probe-cleanup-failed'
        : undefined;
    } catch {
      return 'probe-cleanup-failed';
    }
  }
  async function recoverAmbiguousCreate(): Promise<
    PortablePgdataCleanupFailure | undefined
  > {
    try {
      const candidate = await inspect(name);
      if (!candidate || !validId(candidate.Id)) return 'ownership-unconfirmed';
      createdId = candidate.Id;
      if (!safe(candidate, createdId, true)) return 'ownership-unconfirmed';
      const second = await inspect(createdId);
      if (!second || !safe(second, createdId, true))
        return 'ownership-unconfirmed';
      return cleanup();
    } catch {
      return 'ownership-unconfirmed';
    }
  }

  try {
    if ((await listed()).some((row) => row.name === name))
      throw new PortablePgdataProbeError('container-collision');
    const mount = `type=bind,src=${mountpoint},dst=${TARGET},readonly,bind-propagation=rslave,bind-nonrecursive,bind-create-src=false`;
    const args = [
      'create',
      '--pull',
      'never',
      '--name',
      name,
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
      args.push('--label', `${key}=${value}`);
    for (const key of PROXY_KEYS) args.push('--env', `${key}=`);
    args.push('--mount', mount, context.imageId, ...COMMAND);
    let creation: Awaited<ReturnType<DockerExecutor>>;
    try {
      creation = await call(args);
    } catch {
      const failure = await recoverAmbiguousCreate();
      throw new PortablePgdataProbeError('create-failed', failure);
    }
    if (creation.exitCode === null) {
      const failure = await recoverAmbiguousCreate();
      throw new PortablePgdataProbeError('create-failed', failure);
    }
    if (creation.exitCode !== 0) {
      if ((await listed()).some((row) => row.name === name))
        throw new PortablePgdataProbeError('container-collision');
      throw new PortablePgdataProbeError('create-failed');
    }
    const returned = creation.stdout.trim();
    if (!validId(returned)) {
      const failure = await recoverAmbiguousCreate();
      throw new PortablePgdataProbeError('create-failed', failure);
    }
    createdId = returned;
    const before = await inspect(createdId);
    if (!before || !safe(before, createdId, true))
      throw new PortablePgdataProbeError('ownership-unconfirmed');
    let start: Awaited<ReturnType<DockerExecutor>>;
    started = true; // The daemon may have acted even if the client call fails.
    try {
      start = await call(['container', 'start', createdId]);
    } catch {
      throw new PortablePgdataProbeError('start-failed');
    }
    if (start.exitCode !== 0)
      throw new PortablePgdataProbeError('start-failed');
    let waited: Awaited<ReturnType<DockerExecutor>>;
    try {
      waited = await call(['container', 'wait', createdId]);
    } catch {
      throw new PortablePgdataProbeError('probe-failed');
    }
    if (waited.exitCode !== 0 || waited.stdout !== '0\n')
      throw new PortablePgdataProbeError('probe-failed');
    let logs: Awaited<ReturnType<DockerExecutor>>;
    try {
      logs = await call(['container', 'logs', createdId]);
    } catch {
      throw new PortablePgdataProbeError('probe-failed');
    }
    if (logs.exitCode !== 0 || logs.stdout !== SUCCESS)
      throw new PortablePgdataProbeError('probe-failed');
    result = Object.freeze({ ok: true, postgresMajor: 17 });
  } catch (error) {
    primary =
      error instanceof PortablePgdataProbeError
        ? error
        : new PortablePgdataProbeError('create-failed');
  } finally {
    const cleanupFailure = await cleanup();
    let released = false;
    try {
      released = (await context.lease.release()).released;
    } catch {
      // Public errors never carry raw lease/runner failures.
    }
    if (!released) {
      if (primary)
        primary = new PortablePgdataProbeError(
          primary.code,
          cleanupFailure ?? 'lease-release-failed',
        );
      else
        primary = new PortablePgdataProbeError(
          'lease-release-failed',
          cleanupFailure ?? 'lease-release-failed',
        );
    } else if (cleanupFailure) {
      if (primary)
        primary = new PortablePgdataProbeError(primary.code, cleanupFailure);
      else
        primary = new PortablePgdataProbeError(
          'cleanup-failed',
          cleanupFailure,
        );
    }
  }
  if (primary) throw primary;
  return result!;
}
