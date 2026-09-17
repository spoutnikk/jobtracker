import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type { DockerRequest } from './portable-preflight';

export type DockerFailureKind =
  | 'configuration'
  | 'spawn'
  | 'stream'
  | 'timeout'
  | 'stdout-limit'
  | 'stderr-limit';
const MESSAGES: Record<DockerFailureKind, string> = {
  configuration: 'Invalid Docker runner configuration',
  spawn: 'Docker process could not be started',
  stream: 'Docker process stream failed',
  timeout: 'Docker process timed out',
  'stdout-limit': 'Docker stdout limit exceeded',
  'stderr-limit': 'Docker stderr limit exceeded',
};
export class DockerRunnerError extends Error {
  constructor(public readonly kind: DockerFailureKind) {
    super(MESSAGES[kind]);
    this.name = 'DockerRunnerError';
  }
}
export interface DockerLimits {
  readonly timeoutMs: number;
  readonly terminationGraceMs: number;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
}
export const DEFAULT_DOCKER_LIMITS: Readonly<DockerLimits> = Object.freeze({
  timeoutMs: 30_000,
  terminationGraceMs: 1_000,
  stdoutBytes: 16 * 1024 * 1024,
  stderrBytes: 1024 * 1024,
});
export interface DockerResult {
  readonly stdout: string;
  /** Deliberately discarded, even on success. */
  readonly stderr: '';
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
}

/** Complete replacement environment. No application credentials or general
 * COMPOSE_* forwarding. Compose may still read its project .env file itself.
 * SSH_AUTH_SOCK supports SSH contexts; credentials remain outside results.
 */
export function dockerEnvironment(
  input: Readonly<NodeJS.ProcessEnv>,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const keys = [
    'PATH',
    'HOME',
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'DOCKER_CONFIG',
    'DOCKER_TLS',
    'DOCKER_TLS_VERIFY',
    'DOCKER_CERT_PATH',
    'SSH_AUTH_SOCK',
    'COMPOSE_PROJECT_NAME',
  ];
  if (platform === 'win32')
    keys.push(
      'PATHEXT',
      'SystemRoot',
      'WINDIR',
      'USERPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'TEMP',
      'TMP',
    );
  else keys.push('XDG_RUNTIME_DIR');
  const result: NodeJS.ProcessEnv = {};
  for (const key of keys) {
    const matches = Object.keys(input).filter((candidate) =>
      platform === 'win32'
        ? candidate.toLowerCase() === key.toLowerCase()
        : candidate === key,
    );
    if (matches.length > 1) throw new DockerRunnerError('configuration');
    const value = matches.length ? input[matches[0]] : undefined;
    if (value !== undefined) {
      if (value.includes('\0')) throw new DockerRunnerError('configuration');
      result[key] = value;
    }
  }
  // Avoid the platform's implicit executable search path when PATH is omitted.
  result.PATH ??= '';
  return result;
}

/** Bound each invocation, including a finite grace period after kill. A failed
 * create may have reached the daemon: callers must not infer absence from error.
 */
export function createDockerRunner(
  overrides: Partial<DockerLimits> = {},
): (request: DockerRequest) => Promise<DockerResult> {
  const limits = { ...DEFAULT_DOCKER_LIMITS, ...overrides };
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
      throw new DockerRunnerError('configuration');
  }
  return (request) =>
    new Promise((resolve, reject) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn('docker', [...request.args], {
          cwd: request.cwd,
          env: dockerEnvironment(request.env),
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch {
        reject(new DockerRunnerError('spawn'));
        return;
      }
      let settled = false;
      let failure: DockerFailureKind | undefined;
      let stdout = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let grace: ReturnType<typeof setTimeout> | undefined;
      const decoder = new StringDecoder('utf8');
      const ignoreError = () => {};
      const onChildError = () => stop('spawn');
      const onStreamError = () => stop('stream');
      const pipes = [child.stdout, child.stderr];
      const finish = (
        exitCode: number | null,
        signal: NodeJS.Signals | null,
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (grace) clearTimeout(grace);
        child.removeListener('error', onChildError);
        child.removeListener('close', finish);
        child.on('error', ignoreError);
        for (const pipe of pipes) {
          if (!usable(pipe)) continue;
          pipe.on('error', ignoreError);
          pipe.removeListener('error', onStreamError);
          pipe.removeListener(
            'data',
            pipe === child.stdout ? onStdout : onStderr,
          );
          pipe.destroy();
        }
        // Grace expiry abandons local handles; it does not prove child exit.
        if (typeof child.unref === 'function') child.unref();
        if (failure) {
          stdout = '';
          reject(new DockerRunnerError(failure));
        } else
          resolve({
            stdout: stdout + decoder.end(),
            stderr: '',
            exitCode,
            signal,
          });
      };
      const stop = (kind: DockerFailureKind) => {
        if (settled || failure) return;
        failure = kind;
        grace = setTimeout(() => finish(null, null), limits.terminationGraceMs);
        try {
          child.kill('SIGKILL');
        } catch {
          /* retain controlled original cause */
        }
      };
      const timer = setTimeout(() => stop('timeout'), limits.timeoutMs);
      const onStdout = (chunk: Buffer) => {
        if (settled || failure) return;
        stdoutBytes += chunk.length;
        if (stdoutBytes > limits.stdoutBytes) stop('stdout-limit');
        else stdout += decoder.write(chunk);
      };
      const onStderr = (chunk: Buffer) => {
        if (settled || failure) return;
        stderrBytes += chunk.length;
        if (stderrBytes > limits.stderrBytes) stop('stderr-limit');
      };
      child.on('error', onChildError);
      child.on('close', finish);
      const usable = (
        pipe: typeof child.stdout,
      ): pipe is NonNullable<typeof child.stdout> =>
        !!pipe &&
        typeof pipe.on === 'function' &&
        typeof pipe.destroy === 'function' &&
        typeof pipe.removeListener === 'function';
      for (const pipe of pipes)
        if (usable(pipe)) pipe.on('error', onStreamError);
      if (!usable(child.stdout) || !usable(child.stderr)) {
        stop('spawn');
        return;
      }
      child.stdout.on('data', onStdout);
      child.stderr.on('data', onStderr);
    });
}
