import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  createDockerRunner,
  DEFAULT_DOCKER_LIMITS,
  dockerEnvironment,
  DockerRunnerError,
} from './portable-docker';
import type { DockerRequest } from './portable-preflight';

const secret = 'SUPER_SECRET_PASSWORD';
const request: DockerRequest = {
  command: 'docker',
  args: ['image', 'inspect', 'image with spaces'],
  cwd: '/project',
  env: {
    PATH: '/bin',
    HOME: '/home/user',
    PGPASSWORD: secret,
    DATABASE_URL: secret,
    POSTGRES_PASSWORD: secret,
  },
};
function fakeProcess() {
  const fake = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: jest.fn(() => true),
    unref: jest.fn(),
  });
  const spawn = jest
    .spyOn(childProcess, 'spawn')
    .mockReturnValue(fake as unknown as ReturnType<typeof childProcess.spawn>);
  return { fake, spawn };
}
describe('Docker runner', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  it('uses Docker argv without shell, explicit cwd and filtered environment', async () => {
    const { fake, spawn } = fakeProcess();
    const promise = createDockerRunner()(request);
    fake.emit('close', 0, null);
    await promise;
    expect(spawn).toHaveBeenCalledWith('docker', [...request.args], {
      cwd: '/project',
      env: { PATH: '/bin', HOME: '/home/user' },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  });
  it('preserves split UTF-8 stdout and discards stderr secrets', async () => {
    const { fake } = fakeProcess();
    const promise = createDockerRunner()(request);
    const bytes = Buffer.from('é漢');
    fake.stdout.write(bytes.subarray(0, 1));
    fake.stdout.write(bytes.subarray(1));
    fake.stderr.write(secret);
    fake.emit('close', 0, null);
    expect(await promise).toEqual({
      stdout: 'é漢',
      stderr: '',
      exitCode: 0,
      signal: null,
    });
    expect(jest.getTimerCount()).toBe(0);
  });
  it('returns nonzero exit without stderr', async () => {
    const { fake } = fakeProcess();
    const promise = createDockerRunner()(request);
    fake.stderr.write(secret);
    fake.emit('close', 7, null);
    expect(await promise).toEqual({
      stdout: '',
      stderr: '',
      exitCode: 7,
      signal: null,
    });
  });
  it('returns a termination signal', async () => {
    const { fake } = fakeProcess();
    const promise = createDockerRunner()(request);
    fake.emit('close', null, 'SIGTERM');
    expect(await promise).toMatchObject({ exitCode: null, signal: 'SIGTERM' });
  });
  it('waits for close rather than exit', async () => {
    const { fake } = fakeProcess();
    const promise = createDockerRunner()(request);
    let done = false;
    void promise.then(() => {
      done = true;
    });
    fake.emit('exit', 0, null);
    await Promise.resolve();
    expect(done).toBe(false);
    fake.emit('close', 0, null);
    await promise;
  });
  it.each([
    'spawn',
    'stream',
    'timeout',
    'stdout-limit',
    'stderr-limit',
  ] as const)(
    'rejects %s with controlled category and cleans timers',
    async (kind) => {
      const { fake } = fakeProcess();
      const promise = createDockerRunner({
        timeoutMs: 20,
        terminationGraceMs: 5,
        stdoutBytes: 8,
        stderrBytes: 8,
      })(request);
      const assertion = expect(promise).rejects.toMatchObject({
        name: 'DockerRunnerError',
        kind,
      });
      if (kind === 'spawn') fake.emit('error', new Error(secret));
      else if (kind === 'stream') fake.stdout.emit('error', new Error(secret));
      else if (kind === 'timeout') jest.advanceTimersByTime(20);
      else if (kind === 'stdout-limit') fake.stdout.write(secret);
      else fake.stderr.write(secret);
      expect(fake.kill).toHaveBeenCalledTimes(1);
      expect(fake.kill).toHaveBeenCalledWith('SIGKILL');
      fake.emit('close', null, 'SIGKILL');
      await assertion;
      const error = await promise.catch((e: unknown) => e);
      expect((error as Error).message).not.toContain(secret);
      expect(JSON.stringify(error)).not.toContain(secret);
      expect(jest.getTimerCount()).toBe(0);
    },
  );
  it('bounds termination even when close never arrives or kill fails', async () => {
    const { fake } = fakeProcess();
    fake.kill.mockImplementation(() => {
      throw new Error(secret);
    });
    const promise = createDockerRunner({
      timeoutMs: 20,
      terminationGraceMs: 5,
    })(request);
    const assertion = expect(promise).rejects.toMatchObject({
      kind: 'timeout',
    });
    jest.advanceTimersByTime(25);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });
  it('settles once and keeps first failure across error/timeout/close races', async () => {
    const { fake } = fakeProcess();
    const promise = createDockerRunner({
      timeoutMs: 20,
      terminationGraceMs: 5,
    })(request);
    const settled = jest.fn();
    void promise.then(settled, settled);
    fake.emit('error', new Error(secret));
    fake.stderr.emit('error', new Error(secret));
    jest.advanceTimersByTime(25);
    fake.emit('close', 0, null);
    fake.emit('error', new Error(secret));
    await expect(promise).rejects.toMatchObject({ kind: 'spawn' });
    await Promise.resolve();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(fake.kill).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('sanitizes a synchronous spawn exception', async () => {
    jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
      throw new Error(secret);
    });
    await expect(createDockerRunner()(request)).rejects.toEqual(
      new DockerRunnerError('spawn'),
    );
    expect(jest.getTimerCount()).toBe(0);
  });
  it.each([0, -1, NaN, Infinity, 1.5, 2_147_483_648])(
    'rejects invalid bound %s',
    (value) =>
      expect(() => createDockerRunner({ timeoutMs: value })).toThrow(
        DockerRunnerError,
      ),
  );
  it('exposes explicit finite default bounds', () =>
    expect(DEFAULT_DOCKER_LIMITS).toEqual({
      timeoutMs: 30000,
      terminationGraceMs: 1000,
      stdoutBytes: 16777216,
      stderrBytes: 1048576,
    }));
});
describe('Docker environment allowlist', () => {
  it('keeps daemon/context/TLS/SSH config without application credentials', () => {
    const input = {
      ...request.env,
      DOCKER_HOST: 'ssh://host',
      DOCKER_CONTEXT: 'remote',
      DOCKER_CONFIG: '/config',
      DOCKER_TLS: '1',
      DOCKER_TLS_VERIFY: '1',
      DOCKER_CERT_PATH: '/certs',
      SSH_AUTH_SOCK: '/agent',
      XDG_RUNTIME_DIR: '/run/user/1000',
      COMPOSE_PROJECT_NAME: 'project',
      COMPOSE_FILE: '/unwanted',
      OTHER_SECRET: secret,
    };
    const env = dockerEnvironment(input, 'linux');
    expect(env.DOCKER_CONTEXT).toBe('remote');
    expect(env.DOCKER_HOST).toBe('ssh://host');
    expect(env.DOCKER_CERT_PATH).toBe('/certs');
    expect(env.SSH_AUTH_SOCK).toBe('/agent');
    expect(env.COMPOSE_PROJECT_NAME).toBe('project');
    expect(env.COMPOSE_FILE).toBeUndefined();
    expect(JSON.stringify(env)).not.toContain(secret);
  });
  it('normalizes Windows environment key casing', () => {
    expect(
      dockerEnvironment(
        {
          Path: 'C:\\Docker',
          PATHEXT: '.EXE;.CMD',
          SYSTEMROOT: 'C:\\Windows',
          USERPROFILE: 'C:\\Users\\u',
          TEMP: 'C:\\Temp',
          PGPASSWORD: secret,
        },
        'win32',
      ),
    ).toEqual({
      PATH: 'C:\\Docker',
      PATHEXT: '.EXE;.CMD',
      SystemRoot: 'C:\\Windows',
      USERPROFILE: 'C:\\Users\\u',
      TEMP: 'C:\\Temp',
    });
  });
  it('rejects ambiguous Windows PATH aliases', () =>
    expect(() => dockerEnvironment({ Path: 'a', PATH: 'b' }, 'win32')).toThrow(
      DockerRunnerError,
    ));
  it('uses no implicit PATH when absent', () =>
    expect(dockerEnvironment({}, 'linux')).toEqual({ PATH: '' }));
  it('rejects NUL without exposing value', () =>
    expect(() => dockerEnvironment({ PATH: secret + '\0' }, 'linux')).toThrow(
      'Invalid Docker runner configuration',
    ));
});

describe('runner abandonment', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  it.each(['stdout', 'stderr', 'both'])(
    'handles absent %s and late events safely',
    async (missing) => {
      const { fake } = fakeProcess();
      if (missing !== 'stderr') Object.assign(fake, { stdout: null });
      if (missing !== 'stdout') Object.assign(fake, { stderr: undefined });
      const promise = createDockerRunner({ terminationGraceMs: 5 })(request);
      const settled = jest.fn();
      void promise.then(settled, settled);
      fake.emit('error', new Error(secret));
      jest.advanceTimersByTime(5);
      await expect(promise).rejects.toEqual(new DockerRunnerError('spawn'));
      fake.emit('close', 0, null);
      fake.emit('error', new Error(secret));
      await Promise.resolve();
      expect(settled).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    },
  );
  it('cleans missing-stream failure when close arrives before grace', async () => {
    const { fake } = fakeProcess();
    Object.assign(fake, { stdout: undefined });
    const promise = createDockerRunner()(request);
    fake.emit('close', null, null);
    await expect(promise).rejects.toEqual(new DockerRunnerError('spawn'));
    expect(jest.getTimerCount()).toBe(0);
    fake.emit('error', new Error(secret));
  });
  it.each(['stdout', 'stderr'] as const)(
    'retains %s overflow cause through abandonment',
    async (stream) => {
      const { fake } = fakeProcess();
      const promise = createDockerRunner({
        stdoutBytes: 1,
        stderrBytes: 1,
        terminationGraceMs: 5,
      })(request);
      const assertion = expect(promise).rejects.toEqual(
        new DockerRunnerError(
          stream === 'stdout' ? 'stdout-limit' : 'stderr-limit',
        ),
      );
      fake[stream].write('xx');
      jest.advanceTimersByTime(5);
      await assertion;
      expect(fake.stdout.destroyed).toBe(true);
      expect(fake.stderr.destroyed).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    },
  );
  it.each(['false', 'throw', 'success'])(
    'abandons handles when kill %s and no close arrives',
    async (mode) => {
      const { fake } = fakeProcess();
      fake.kill.mockImplementation(() => {
        if (mode === 'throw') throw new Error(secret);
        return mode === 'success';
      });
      const promise = createDockerRunner({
        timeoutMs: 10,
        terminationGraceMs: 5,
      })(request);
      const settled = jest.fn();
      void promise.then(settled, settled);
      fake.stdout.write('partial');
      jest.advanceTimersByTime(15);
      await expect(promise).rejects.toEqual(new DockerRunnerError('timeout'));
      expect(fake.stdout.destroyed).toBe(true);
      expect(fake.stderr.destroyed).toBe(true);
      expect(fake.stdout.listenerCount('data')).toBe(0);
      expect(fake.stderr.listenerCount('data')).toBe(0);
      expect(fake.listenerCount('close')).toBe(0);
      expect(fake.listenerCount('error')).toBe(1);
      expect(fake.unref).toHaveBeenCalledTimes(1);
      fake.emit('error', new Error(secret));
      fake.stdout.emit('error', new Error(secret));
      fake.stderr.emit('error', new Error(secret));
      fake.stdout.emit('data', Buffer.from(secret));
      fake.stderr.emit('data', Buffer.from(secret));
      fake.emit('close', 0, null);
      await Promise.resolve();
      expect(settled).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    },
  );
});
