import type { DockerExecutor } from './portable-preflight';
import {
  PortablePlatformError,
  platformSecurityIdentity,
  qualifyPortablePlatform,
} from './portable-platform';

const root = '/var/lib/docker';

function fixture() {
  const context = {
    Name: 'default',
    Endpoints: {
      docker: { Host: 'unix:///var/run/docker.sock', SkipTLSVerify: false },
    },
  };
  const version = {
    Client: { Version: '29.8.1' },
    Server: {
      Version: '29.8.1',
      ApiVersion: '1.56',
      Os: 'linux',
      Arch: 'amd64',
    },
  };
  const info = {
    ServerVersion: '29.8.1',
    OSType: 'linux',
    Architecture: 'x86_64',
    OperatingSystem: 'Ubuntu 24.04.5 LTS',
    KernelVersion: '6.8.0-137-generic',
    DockerRootDir: root,
    SecurityOptions: ['name=seccomp,profile=builtin'],
    Name: 'native-host',
  };
  const execute = jest.fn<
    ReturnType<DockerExecutor>,
    Parameters<DockerExecutor>
  >((request) => {
    const args = request.args;
    if (args[0] === 'context' && args[1] === 'show')
      return Promise.resolve({ stdout: 'default\n', stderr: '', exitCode: 0 });
    let value: unknown;
    if (args[0] === 'context') value = context;
    else if (args[0] === 'version') value = version;
    else if (args[0] === 'info') value = info;
    else throw new Error('Unexpected command');
    return Promise.resolve({
      stdout: JSON.stringify(value),
      stderr: '',
      exitCode: 0,
    });
  });
  const run = (
    env: NodeJS.ProcessEnv = { PATH: '/usr/bin' },
    hostPlatform: NodeJS.Platform = 'linux',
  ) =>
    qualifyPortablePlatform(
      { projectRoot: '/workspace', env, hostPlatform },
      execute,
    );
  return { context, version, info, execute, run };
}

async function rejects(f: ReturnType<typeof fixture>, code: string) {
  await expect(f.run()).rejects.toMatchObject({
    name: 'PortablePlatformError',
    code,
  });
}

describe('Portable qualified Docker platform', () => {
  it.each(['29.8.1', '31.0.0', '20.10.24'])(
    'accepts the qualified server with diagnostic client %s',
    async (clientVersion) => {
      const f = fixture();
      f.version.Client.Version = clientVersion;
      const platform = await f.run();
      expect(platform).toEqual({
        context: 'default',
        endpoint: 'local-unix-default',
        engineVersion: '29.8.1',
        serverApiVersion: '1.56',
        osType: 'linux',
        architecture: 'amd64',
        dockerRootDir: root,
        rootless: false,
        clientVersion,
      });
      expect(Object.isFrozen(platform)).toBe(true);
      expect(platformSecurityIdentity(platform)).not.toHaveProperty(
        'clientVersion',
      );
    },
  );

  it.each([
    [
      'engine',
      (f: ReturnType<typeof fixture>) => (f.version.Server.Version = '29.8.2'),
    ],
    [
      'api',
      (f: ReturnType<typeof fixture>) => (f.version.Server.ApiVersion = '1.55'),
    ],
    [
      'server os',
      (f: ReturnType<typeof fixture>) => (f.version.Server.Os = 'windows'),
    ],
    ['info os', (f: ReturnType<typeof fixture>) => (f.info.OSType = 'windows')],
    [
      'architecture',
      (f: ReturnType<typeof fixture>) => (f.info.Architecture = 'arm64'),
    ],
    [
      'server architecture',
      (f: ReturnType<typeof fixture>) => (f.version.Server.Arch = 'arm64'),
    ],
    [
      'version mismatch',
      (f: ReturnType<typeof fixture>) => (f.info.ServerVersion = '29.8.2'),
    ],
    [
      'rootless',
      (f: ReturnType<typeof fixture>) =>
        f.info.SecurityOptions.push('name=rootless'),
    ],
    [
      'desktop',
      (f: ReturnType<typeof fixture>) =>
        (f.info.OperatingSystem = 'Docker Desktop'),
    ],
    [
      'linuxkit',
      (f: ReturnType<typeof fixture>) =>
        (f.info.KernelVersion = 'linuxkit-6.10'),
    ],
    [
      'wsl',
      (f: ReturnType<typeof fixture>) =>
        (f.info.KernelVersion = 'microsoft-standard-WSL2'),
    ],
  ] as const)('refuses %s', async (_name, change) => {
    const f = fixture();
    change(f);
    await rejects(f, 'unsupported-platform');
  });

  it.each([
    ['amd64', 'amd64'],
    ['amd64', 'x86_64'],
    ['x86_64', 'amd64'],
    ['x86_64', 'x86_64'],
  ])('normalizes compatible server %s and info %s', async (server, info) => {
    const f = fixture();
    f.version.Server.Arch = server;
    f.info.Architecture = info;
    await expect(f.run()).resolves.toMatchObject({ architecture: 'amd64' });
  });

  it.each(['', 'relative', '/', '/var/lib/docker/../docker'])(
    'refuses DockerRootDir %j',
    async (value) => {
      const f = fixture();
      f.info.DockerRootDir = value;
      await rejects(
        f,
        value === '' ? 'docker-failure' : 'unsupported-platform',
      );
    },
  );

  it.each([
    [
      'context inspection mismatch',
      (f: ReturnType<typeof fixture>) => (f.context.Name = 'remote'),
    ],
    [
      'tcp endpoint',
      (f: ReturnType<typeof fixture>) =>
        (f.context.Endpoints.docker.Host = 'tcp://host:2376'),
    ],
    [
      'ssh endpoint',
      (f: ReturnType<typeof fixture>) =>
        (f.context.Endpoints.docker.Host = 'ssh://host'),
    ],
  ] as const)('refuses %s', async (_name, change) => {
    const f = fixture();
    change(f);
    await rejects(f, 'unsupported-platform');
  });

  it('refuses a non-default active context', async () => {
    const f = fixture();
    f.execute.mockResolvedValueOnce({
      stdout: 'remote\n',
      stderr: '',
      exitCode: 0,
    });
    await rejects(f, 'unsupported-platform');
    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ DOCKER_HOST: 'tcp://host:2376' }, 'DOCKER_HOST'],
    [{ DOCKER_HOST: '' }, 'empty DOCKER_HOST'],
    [{ DOCKER_CONTEXT: 'remote' }, 'DOCKER_CONTEXT'],
    [{ DOCKER_CONTEXT: '' }, 'empty DOCKER_CONTEXT'],
  ])('refuses explicit daemon redirection %s', async (env) => {
    const f = fixture();
    await expect(f.run({ PATH: '/usr/bin', ...env })).rejects.toMatchObject({
      code: 'unsupported-platform',
    });
    expect(f.execute).not.toHaveBeenCalled();
  });

  it('refuses a non-Linux host before Docker', async () => {
    const f = fixture();
    await expect(f.run({}, 'darwin')).rejects.toMatchObject({
      code: 'unsupported-platform',
    });
    expect(f.execute).not.toHaveBeenCalled();
  });

  it.each([
    [
      'malformed client',
      (f: ReturnType<typeof fixture>) => (f.version.Client.Version = ''),
    ],
    [
      'malformed JSON',
      (f: ReturnType<typeof fixture>) => {
        const original = f.execute.getMockImplementation()!;
        f.execute.mockImplementation((request) =>
          request.args[0] === 'context' && request.args[1] === 'inspect'
            ? Promise.resolve({
                stdout: 'secret',
                stderr: 'secret',
                exitCode: 0,
              })
            : original(request),
        );
      },
    ],
    [
      'command failure',
      (f: ReturnType<typeof fixture>) =>
        f.execute.mockResolvedValueOnce({
          stdout: '',
          stderr: 'secret',
          exitCode: 1,
        }),
    ],
  ] as const)(
    'fails closed on %s without leaking output',
    async (_name, change) => {
      const f = fixture();
      change(f);
      const error = await f.run().catch((value: unknown) => value);
      expect(error).toBeInstanceOf(PortablePlatformError);
      expect(error).toMatchObject({ code: 'docker-failure' });
      expect(JSON.stringify(error)).not.toContain('secret');
    },
  );
});
