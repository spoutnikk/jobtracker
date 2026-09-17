import { posix } from 'node:path';
import type { DockerExecutor } from './portable-preflight';

export type PlatformErrorCode = 'unsupported-platform' | 'docker-failure';

const MESSAGES: Record<PlatformErrorCode, string> = {
  'unsupported-platform': 'Docker platform is not supported by Portable v1',
  'docker-failure': 'Docker platform discovery failed or returned invalid data',
};

export class PortablePlatformError extends Error {
  constructor(public readonly code: PlatformErrorCode) {
    super(MESSAGES[code]);
    this.name = 'PortablePlatformError';
  }
}

export interface QualifiedPlatformIdentity {
  readonly context: 'default';
  readonly endpoint: 'local-unix-default';
  readonly engineVersion: '29.8.1';
  readonly serverApiVersion: '1.56';
  readonly osType: 'linux';
  readonly architecture: 'amd64';
  readonly dockerRootDir: string;
  readonly rootless: false;
  /** Diagnostic only. It is deliberately excluded from security comparison. */
  readonly clientVersion: string;
}

interface PlatformOptions {
  readonly projectRoot: string;
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly hostPlatform?: NodeJS.Platform;
}

function fail(code: PlatformErrorCode): never {
  throw new PortablePlatformError(code);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('docker-failure');
  return value as Record<string, unknown>;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail('docker-failure');
  }
}

function strictString(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\0') ||
    value.includes('\r') ||
    value.includes('\n')
  )
    fail('docker-failure');
  return value;
}

function validRoot(value: unknown): string {
  const root = strictString(value);
  if (!posix.isAbsolute(root) || root === '/' || posix.normalize(root) !== root)
    fail('unsupported-platform');
  return root;
}

function qualifiedArchitecture(value: unknown): 'amd64' {
  const architecture = strictString(value);
  if (architecture !== 'amd64' && architecture !== 'x86_64')
    fail('unsupported-platform');
  return 'amd64';
}

/** Read-only, fail-closed gate for the single Docker platform qualified by v1. */
export async function qualifyPortablePlatform(
  options: PlatformOptions,
  execute: DockerExecutor,
): Promise<QualifiedPlatformIdentity> {
  if ((options.hostPlatform ?? process.platform) !== 'linux')
    fail('unsupported-platform');
  if (
    Object.prototype.hasOwnProperty.call(options.env, 'DOCKER_HOST') ||
    Object.prototype.hasOwnProperty.call(options.env, 'DOCKER_CONTEXT')
  )
    fail('unsupported-platform');

  async function docker(args: string[]): Promise<string> {
    try {
      const result = await execute({
        command: 'docker',
        args: Object.freeze(args),
        cwd: options.projectRoot,
        env: options.env,
      });
      if (result.exitCode !== 0 || typeof result.stdout !== 'string')
        fail('docker-failure');
      return result.stdout;
    } catch (error) {
      if (error instanceof PortablePlatformError) throw error;
      fail('docker-failure');
    }
  }

  const context = (await docker(['context', 'show'])).trim();
  if (context !== 'default') fail('unsupported-platform');

  const contextInfo = record(
    parse(
      await docker(['context', 'inspect', 'default', '--format', '{{json .}}']),
    ),
  );
  if (contextInfo.Name !== 'default') fail('unsupported-platform');
  const endpoints = record(contextInfo.Endpoints);
  const dockerEndpoint = record(endpoints.docker);
  if (
    dockerEndpoint.Host !== 'unix:///var/run/docker.sock' ||
    (dockerEndpoint.SkipTLSVerify !== undefined &&
      dockerEndpoint.SkipTLSVerify !== false)
  )
    fail('unsupported-platform');

  const version = record(
    parse(await docker(['version', '--format', '{{json .}}'])),
  );
  const client = record(version.Client);
  const server = record(version.Server);
  const clientVersion = strictString(client.Version);
  const engineVersion = strictString(server.Version);
  const serverApiVersion = strictString(server.ApiVersion);
  const serverOs = strictString(server.Os);
  const serverArch = qualifiedArchitecture(server.Arch);
  if (
    engineVersion !== '29.8.1' ||
    serverApiVersion !== '1.56' ||
    serverOs !== 'linux'
  )
    fail('unsupported-platform');

  const info = record(parse(await docker(['info', '--format', '{{json .}}'])));
  const infoVersion = strictString(info.ServerVersion);
  const osType = strictString(info.OSType);
  const architecture = qualifiedArchitecture(info.Architecture);
  const operatingSystem = strictString(info.OperatingSystem);
  const kernelVersion = strictString(info.KernelVersion);
  const daemonName = strictString(info.Name);
  const dockerRootDir = validRoot(info.DockerRootDir);
  if (
    infoVersion !== engineVersion ||
    osType !== serverOs ||
    architecture !== serverArch
  )
    fail('unsupported-platform');
  if (!Array.isArray(info.SecurityOptions)) fail('docker-failure');
  const securityOptions = info.SecurityOptions.map(strictString);
  const markers = `${operatingSystem}\n${kernelVersion}\n${daemonName}`;
  if (
    securityOptions.some((option) => /(?:^|=)rootless(?:$|,)/i.test(option)) ||
    /docker desktop|linuxkit|microsoft|wsl/i.test(markers)
  )
    fail('unsupported-platform');

  return Object.freeze({
    context: 'default',
    endpoint: 'local-unix-default',
    engineVersion: '29.8.1',
    serverApiVersion: '1.56',
    osType: 'linux',
    architecture: 'amd64',
    dockerRootDir,
    rootless: false,
    clientVersion,
  });
}

/** Client version is diagnostic only and must not affect source identity. */
export function platformSecurityIdentity(platform: QualifiedPlatformIdentity) {
  return {
    context: platform.context,
    endpoint: platform.endpoint,
    engineVersion: platform.engineVersion,
    serverApiVersion: platform.serverApiVersion,
    osType: platform.osType,
    architecture: platform.architecture,
    dockerRootDir: platform.dockerRootDir,
    rootless: platform.rootless,
  };
}
