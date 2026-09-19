import { randomUUID } from 'node:crypto';
import { createDockerRunner } from './portable-docker';
import type { InternalMaintenanceContext } from './portable-maintenance';
import {
  PORTABLE_BACKUP_TARGET,
  PORTABLE_UPLOADS_TARGET,
  type PortableBackupBindMount,
  type PortableBackupMounts,
} from './portable-backup-mounts';
import type { DockerExecutor } from './portable-preflight';

export type PortableBackupCode =
  | 'configuration'
  | 'postgres-unavailable'
  | 'container-collision'
  | 'create-failed'
  | 'ownership-unconfirmed'
  | 'start-failed'
  | 'publication-unknown'
  | 'cleanup-failed';
export type PortableBackupCleanupFailure =
  'ownership-unconfirmed' | 'container-cleanup-failed';

const MESSAGES: Record<PortableBackupCode, string> = {
  configuration: 'Invalid Portable backup configuration',
  'postgres-unavailable': 'Qualified PostgreSQL container is unavailable',
  'container-collision': 'The Portable backup container name is reserved',
  'create-failed': 'Portable backup container creation failed',
  'ownership-unconfirmed':
    'Portable backup container ownership could not be confirmed',
  'start-failed': 'Portable backup container could not be started',
  'publication-unknown': 'Portable backup publication state is unknown',
  'cleanup-failed': 'Portable backup container cleanup failed',
};

export class PortableBackupError extends Error {
  constructor(
    public readonly code: PortableBackupCode,
    public readonly cleanupFailure?: PortableBackupCleanupFailure,
  ) {
    super(MESSAGES[code]);
    this.name = 'PortableBackupError';
  }
}

interface CleanupStatus {
  readonly containerCleanupFailure?: PortableBackupCleanupFailure;
}
export interface PortableBackupPublished extends CleanupStatus {
  readonly status: 'published';
  readonly backupName: string;
  readonly extraFiles: number;
  readonly cleanupWarning: boolean;
}
export interface PortableBackupKnownFailure extends CleanupStatus {
  readonly status: 'failed';
  readonly operation: 'prerequisites' | 'production';
}
export type PortableBackupResult =
  PortableBackupPublished | PortableBackupKnownFailure;

export interface PortableBackupDependencies {
  readonly execute?: DockerExecutor;
  /** Caller-owned transport policy for the potentially long docker wait. */
  readonly waitExecute: DockerExecutor;
  readonly uuid?: () => string;
}

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
] as const;
const IMAGE_ENV_KEYS = new Set([
  'PATH',
  'NODE_VERSION',
  'YARN_VERSION',
  'NODE_ENV',
  'LANG',
]);
const COMMAND = [
  '/app/backup-cli.js',
  '--uploads-root',
  PORTABLE_UPLOADS_TARGET,
  '--destination',
  PORTABLE_BACKUP_TARGET,
] as const;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
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
    (Array.isArray(value) && value.length === 0) ||
    (!!object(value) && Object.keys(object(value)!).length === 0)
  );
}
function validMount(
  value: unknown,
  expected: PortableBackupBindMount,
): boolean {
  const mount = object(value);
  const bind = mount && object(mount.BindOptions);
  const keys = expected.readOnly
    ? ['Type', 'Source', 'Target', 'ReadOnly', 'BindOptions']
    : ['Type', 'Source', 'Target', 'BindOptions'];
  return (
    !!mount &&
    exactKeys(mount, keys) &&
    mount.Type === 'bind' &&
    mount.Source === expected.source &&
    mount.Target === expected.destination &&
    (expected.readOnly
      ? mount.ReadOnly === true
      : !Object.hasOwn(mount, 'ReadOnly')) &&
    !!bind &&
    exactKeys(bind, [])
  );
}
function validEnvironment(
  value: unknown,
  expectedPg: Readonly<Record<string, string>>,
): boolean {
  if (!Array.isArray(value)) return false;
  const seen = new Map<string, string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry.includes('=')) return false;
    const index = entry.indexOf('=');
    const key = entry.slice(0, index);
    if (seen.has(key)) return false;
    seen.set(key, entry.slice(index + 1));
  }
  const allowed = new Set([
    ...IMAGE_ENV_KEYS,
    ...PROXY_KEYS,
    ...Object.keys(expectedPg),
  ]);
  if ([...seen.keys()].some((key) => !allowed.has(key))) return false;
  return (
    PROXY_KEYS.every((key) => seen.get(key) === '') &&
    Object.entries(expectedPg).every(
      ([key, content]) => seen.get(key) === content,
    )
  );
}

function parseOutcome(stdout: string, exitCode: number): PortableBackupResult {
  if (!stdout.endsWith('\n') || stdout.slice(0, -1).includes('\n'))
    throw new PortableBackupError('publication-unknown');
  let value: unknown;
  try {
    value = JSON.parse(stdout.slice(0, -1)) as unknown;
  } catch {
    throw new PortableBackupError('publication-unknown');
  }
  const result = object(object(value)?.result);
  if (!object(value) || !exactKeys(object(value)!, ['result']) || !result)
    throw new PortableBackupError('publication-unknown');
  if (result.status === 'published') {
    if (
      !exactKeys(result, [
        'status',
        'backupName',
        'extraFiles',
        'cleanupWarning',
      ]) ||
      typeof result.backupName !== 'string' ||
      !/^jobtracker-backup-[a-zA-Z0-9-]+$/.test(result.backupName) ||
      !Number.isSafeInteger(result.extraFiles) ||
      (result.extraFiles as number) < 0 ||
      typeof result.cleanupWarning !== 'boolean' ||
      !(
        (exitCode === 0 && result.cleanupWarning === false) ||
        (exitCode === 3 && result.cleanupWarning === true)
      )
    )
      throw new PortableBackupError('publication-unknown');
    return Object.freeze({
      status: 'published',
      backupName: result.backupName,
      extraFiles: result.extraFiles as number,
      cleanupWarning: result.cleanupWarning,
    });
  }
  if (
    !exactKeys(result, ['status', 'operation']) ||
    result.status !== 'failed' ||
    !(
      (exitCode === 2 && result.operation === 'prerequisites') ||
      (exitCode === 1 && result.operation === 'production')
    )
  )
    throw new PortableBackupError('publication-unknown');
  return Object.freeze({
    status: 'failed',
    operation: result.operation,
  });
}

export async function runPortableBackup(
  context: InternalMaintenanceContext,
  mounts: PortableBackupMounts,
  dependencies: PortableBackupDependencies,
): Promise<PortableBackupResult> {
  if (!dependencies || typeof dependencies.waitExecute !== 'function')
    throw new PortableBackupError('configuration');
  const execute = dependencies.execute ?? createDockerRunner();
  const postgres = context.source.serviceIdentities.postgres;
  if (!postgres || !validId(postgres.id) || postgres.state !== 'running')
    throw new PortableBackupError('postgres-unavailable');
  const postgresId = postgres.id;
  if (
    mounts.mounts.length !== 2 ||
    mounts.mounts[0] !== mounts.uploads ||
    mounts.mounts[1] !== mounts.backupDestination ||
    mounts.uploads.destination !== PORTABLE_UPLOADS_TARGET ||
    mounts.uploads.readOnly !== true ||
    mounts.uploads.bindCreateSource !== false ||
    mounts.backupDestination.destination !== PORTABLE_BACKUP_TARGET ||
    mounts.backupDestination.readOnly !== false ||
    mounts.backupDestination.bindCreateSource !== false
  )
    throw new PortableBackupError('configuration');
  let suffix: string;
  try {
    suffix = (dependencies.uuid ?? randomUUID)();
  } catch {
    suffix = '';
  }
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(suffix))
    throw new PortableBackupError('configuration');

  const source = context.source;
  const name = `${source.publicSnapshot.projectName}-jobtracker-backup-${suffix}`;
  const labels = {
    'org.jobtracker.maintenance.kind': 'backup',
    'org.jobtracker.maintenance.project': source.publicSnapshot.projectName,
    'org.jobtracker.maintenance.operation': context.lease.operationId,
  } as const;
  const expectedPg = Object.freeze({
    PGHOST: '127.0.0.1',
    PGPORT: '5432',
    PGDATABASE: source.postgresCredentials.database,
    PGUSER: source.postgresCredentials.user,
    PGPASSWORD: source.postgresCredentials.password,
  });
  let createdId: string | undefined;
  let started = false;
  let primary: PortableBackupError | undefined;
  let outcome: PortableBackupResult | undefined;

  const request = (executor: DockerExecutor, args: readonly string[]) =>
    executor({
      command: 'docker',
      args,
      cwd: source.publicSnapshot.projectRoot,
      env: context.env,
    });
  const call = (args: readonly string[]) => request(execute, args);
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
  async function inspect(target: string) {
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
      exactKeys(actual, Object.keys(labels)) &&
      Object.entries(labels).every(([key, value]) => actual[key] === value)
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
    const network = object(container.NetworkSettings);
    const healthcheck = config && object(config.Healthcheck);
    if (!config || !host || !state || !restart || !network || !healthcheck)
      return false;
    const inspectedMounts = host.Mounts;
    return (
      container.Image === context.imageId &&
      config.Image === context.imageId &&
      (!neverStarted ||
        (state.Status === 'created' &&
          state.Running === false &&
          state.StartedAt === '0001-01-01T00:00:00Z')) &&
      host.ReadonlyRootfs === true &&
      host.NetworkMode === `container:${postgresId}` &&
      empty(network.Networks) &&
      restart.Name === 'no' &&
      restart.MaximumRetryCount === 0 &&
      host.AutoRemove === false &&
      host.Privileged === false &&
      JSON.stringify(config.Entrypoint) === JSON.stringify(['node']) &&
      JSON.stringify(config.Cmd) === JSON.stringify(COMMAND) &&
      validEnvironment(config.Env, expectedPg) &&
      JSON.stringify(healthcheck.Test) === JSON.stringify(['NONE']) &&
      Array.isArray(inspectedMounts) &&
      inspectedMounts.length === 2 &&
      validMount(inspectedMounts[0], mounts.uploads) &&
      validMount(inspectedMounts[1], mounts.backupDestination) &&
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
  async function cleanup(): Promise<PortableBackupCleanupFailure | undefined> {
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
        ? 'container-cleanup-failed'
        : undefined;
    } catch {
      return 'container-cleanup-failed';
    }
  }
  async function recoverAmbiguousCreate() {
    try {
      const candidate = await inspect(name);
      if (!candidate || !validId(candidate.Id))
        return 'ownership-unconfirmed' as const;
      createdId = candidate.Id;
      if (!safe(candidate, createdId, true))
        return 'ownership-unconfirmed' as const;
      const second = await inspect(createdId);
      if (!second || !safe(second, createdId, true))
        return 'ownership-unconfirmed' as const;
      return cleanup();
    } catch {
      return 'ownership-unconfirmed' as const;
    }
  }

  try {
    if ((await listed()).some((row) => row.name === name))
      throw new PortableBackupError('container-collision');
    const args = [
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
    ];
    for (const [key, value] of Object.entries(labels))
      args.push('--label', `${key}=${value}`);
    for (const key of PROXY_KEYS) args.push('--env', `${key}=`);
    for (const [key, value] of Object.entries(expectedPg))
      args.push('--env', `${key}=${value}`);
    for (const item of mounts.mounts)
      args.push(
        '--mount',
        `type=bind,src=${item.source},dst=${item.destination}${
          item.readOnly ? ',readonly' : ''
        },bind-create-src=false`,
      );
    args.push(context.imageId, ...COMMAND);
    let creation: Awaited<ReturnType<DockerExecutor>>;
    try {
      creation = await call(args);
    } catch {
      throw new PortableBackupError(
        'create-failed',
        await recoverAmbiguousCreate(),
      );
    }
    if (creation.exitCode === null)
      throw new PortableBackupError(
        'create-failed',
        await recoverAmbiguousCreate(),
      );
    if (creation.exitCode !== 0) {
      if ((await listed()).some((row) => row.name === name))
        throw new PortableBackupError('container-collision');
      throw new PortableBackupError('create-failed');
    }
    const returned = creation.stdout.trim();
    if (!validId(returned))
      throw new PortableBackupError(
        'create-failed',
        await recoverAmbiguousCreate(),
      );
    createdId = returned;
    const before = await inspect(createdId);
    if (!before || !safe(before, createdId, true))
      throw new PortableBackupError('ownership-unconfirmed');
    started = true;
    let start: Awaited<ReturnType<DockerExecutor>>;
    try {
      start = await call(['container', 'start', createdId]);
    } catch {
      throw new PortableBackupError('start-failed');
    }
    if (start.exitCode !== 0) throw new PortableBackupError('start-failed');
    let waited: Awaited<ReturnType<DockerExecutor>>;
    try {
      waited = await request(dependencies.waitExecute, [
        'container',
        'wait',
        createdId,
      ]);
    } catch {
      throw new PortableBackupError('publication-unknown');
    }
    if (waited.exitCode !== 0 || !/^(?:0|1|2|3)\n$/.test(waited.stdout))
      throw new PortableBackupError('publication-unknown');
    let logs: Awaited<ReturnType<DockerExecutor>>;
    try {
      logs = await call(['container', 'logs', createdId]);
    } catch {
      throw new PortableBackupError('publication-unknown');
    }
    if (logs.exitCode !== 0)
      throw new PortableBackupError('publication-unknown');
    outcome = parseOutcome(logs.stdout, Number(waited.stdout.trim()));
  } catch (error) {
    primary =
      error instanceof PortableBackupError
        ? error
        : new PortableBackupError('create-failed');
  } finally {
    const cleanupFailure = await cleanup();
    if (cleanupFailure) {
      if (outcome)
        outcome = Object.freeze({
          ...outcome,
          containerCleanupFailure: cleanupFailure,
        });
      else if (primary)
        primary = new PortableBackupError(primary.code, cleanupFailure);
      else primary = new PortableBackupError('cleanup-failed', cleanupFailure);
    }
  }
  if (outcome) return outcome;
  if (primary) throw primary;
  throw new PortableBackupError('publication-unknown');
}
