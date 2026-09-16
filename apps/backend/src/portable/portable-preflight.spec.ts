import {
  discoverPortableSource,
  PreflightError,
  type DockerExecutor,
  type DockerRequest,
  type PreflightOptions,
} from './portable-preflight';

const projectLabel = 'com.docker.compose.project';
const serviceLabel = 'com.docker.compose.service';
const volumeLabel = 'com.docker.compose.volume';
const oneoffLabel = 'com.docker.compose.oneoff';
const secret = 'SUPER_SECRET_PASSWORD';
const pg = 'custom-pg-source';
const uploads = 'custom-uploads-source';
const project = 'my-portable-project';
const options: PreflightOptions = {
  projectRoot: '/workspace/renamed-folder',
  composeFile: 'compose.yaml',
  env: { PATH: '/usr/bin', POSTGRES_PASSWORD: secret },
};
function config() {
  return {
    name: project,
    volumes: { postgres_data: { name: pg }, uploads_data: { name: uploads } },
    services: {
      postgres: {
        volumes: [
          {
            type: 'volume',
            source: 'postgres_data',
            target: '/var/lib/postgresql/data',
          },
        ],
      },
      backend: {
        volumes: [
          {
            type: 'volume',
            source: 'uploads_data',
            target: '/app/apps/backend/uploads',
          },
        ],
      },
      frontend: {},
      migrate: { environment: { DATABASE_URL: secret } },
    },
  };
}
function volume(Name: string, logical: string) {
  return {
    Name,
    Driver: 'local',
    Scope: 'local',
    Options: null,
    Labels: { [projectLabel]: project, [volumeLabel]: logical } as Record<
      string,
      string
    >,
    Mountpoint: '/private/host/path',
  };
}
function container(service: string, digit = 'a', status = 'running') {
  const physical = service === 'postgres' ? pg : uploads;
  const target =
    service === 'postgres'
      ? '/var/lib/postgresql/data'
      : '/app/apps/backend/uploads';
  return {
    Id: digit.repeat(64),
    Config: {
      Labels: {
        [projectLabel]: project,
        [serviceLabel]: service,
        [oneoffLabel]: 'False',
      } as Record<string, string>,
      Env: [`PGPASSWORD=${secret}`],
    },
    State: {
      Status: status,
      Running: status === 'running',
      Paused: status === 'paused',
      Restarting: status === 'restarting',
      Dead: status === 'dead',
      Health: { Status: 'healthy', Log: [{ Output: secret }] },
    },
    Mounts: ['postgres', 'backend'].includes(service)
      ? [
          {
            Type: 'volume',
            Name: physical,
            Destination: target,
            RW: true,
            Source: '/private/host/path',
          },
        ]
      : [],
    HostConfig: {
      Mounts: ['postgres', 'backend'].includes(service)
        ? [
            {
              Type: 'volume',
              Source: physical,
              Target: target,
              ReadOnly: false,
            },
          ]
        : [],
    },
    NetworkSettings: {
      Networks: {
        portable_default: { NetworkID: 'f'.repeat(64), Aliases: [service] },
      },
    },
  };
}
function fixture() {
  const cfg = config();
  const volumes = [
    volume(pg, 'postgres_data'),
    volume(uploads, 'uploads_data'),
  ];
  const containers: ReturnType<typeof container>[] = [];
  const runner = jest.fn<
    ReturnType<DockerExecutor>,
    Parameters<DockerExecutor>
  >((request) => {
    const a = request.args;
    let output: unknown;
    if (a[0] === 'compose') output = cfg;
    else if (a[0] === 'volume' && a[1] === 'ls')
      return Promise.resolve({
        stdout: volumes.map((v) => JSON.stringify(v.Name)).join('\n'),
        stderr: '',
        exitCode: 0,
      });
    else if (a[0] === 'volume' && a[1] === 'inspect')
      output = volumes.filter((v) => v.Name === a[2]);
    else if (a[0] === 'ps') {
      const filter = a[a.indexOf('--filter') + 1];
      const found = containers.filter((c) =>
        filter.startsWith('label=')
          ? c.Config.Labels[projectLabel] ===
            filter.slice(`label=${projectLabel}=`.length)
          : c.Mounts.some(
              (m) =>
                m.Type === 'volume' &&
                m.Name === filter.slice('volume='.length),
            ),
      );
      return Promise.resolve({
        stdout: found.map((c) => c.Id).join('\n'),
        stderr: '',
        exitCode: 0,
      });
    } else if (a[0] === 'container' && a[1] === 'inspect')
      output = containers.filter((c) => c.Id === a[2]);
    else throw new Error('Unexpected command');
    return Promise.resolve({
      stdout: JSON.stringify(output),
      stderr: '',
      exitCode: 0,
    });
  });
  return {
    cfg,
    volumes,
    containers,
    runner,
    run: (input: PreflightOptions = options) =>
      discoverPortableSource(input, runner),
  };
}
async function rejectsCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: 'PreflightError', code });
}

describe('configuration and project identity', () => {
  it('accepts normalized configuration, resolves names, and accepts volumes alone after down', async () => {
    const f = fixture();
    const snapshot = await f.run();
    expect(snapshot.projectName).toBe(project);
    expect(snapshot.composeFile).toBe('/workspace/renamed-folder/compose.yaml');
    expect(snapshot.volumes.postgres).toEqual({
      logicalName: 'postgres_data',
      physicalName: pg,
      driver: 'local',
    });
    expect(snapshot.volumes.uploads.physicalName).toBe(uploads);
    expect(snapshot.services).toEqual({
      postgres: null,
      backend: null,
      frontend: null,
      migrate: [],
    });
  });
  it('passes explicit project with priority over COMPOSE_PROJECT_NAME', async () => {
    const f = fixture();
    await f.run({
      ...options,
      projectName: project,
      env: { COMPOSE_PROJECT_NAME: 'ignored' },
    });
    expect(f.runner.mock.calls[0][0].args).toEqual([
      'compose',
      '--project-directory',
      options.projectRoot,
      '-f',
      '/workspace/renamed-folder/compose.yaml',
      '--project-name',
      project,
      'config',
      '--format',
      'json',
    ]);
  });
  it('passes environment project and retains effective normalized name', async () => {
    const f = fixture();
    const result = await f.run({
      ...options,
      env: { COMPOSE_PROJECT_NAME: project },
    });
    expect(result.projectName).toBe(project);
    expect(f.runner.mock.calls[0][0].env.COMPOSE_PROJECT_NAME).toBe(project);
  });
  it('rejects disagreement with explicit project', async () =>
    rejectsCode(
      fixture().run({ ...options, projectName: 'different' }),
      'configuration',
    ));
  it('rejects disagreement with environment project', async () =>
    rejectsCode(
      fixture().run({ ...options, env: { COMPOSE_PROJECT_NAME: 'different' } }),
      'configuration',
    ));
  it('does not adopt old project after directory rename', async () => {
    const f = fixture();
    f.cfg.name = 'renamed';
    f.cfg.volumes.postgres_data.name = 'renamed_postgres_data';
    f.cfg.volumes.uploads_data.name = 'renamed_uploads_data';
    await rejectsCode(f.run(), 'source-missing');
    expect(f.runner).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed configuration JSON without exposing it', async () => {
    const f = fixture();
    f.runner.mockResolvedValueOnce({
      stdout: secret,
      stderr: secret,
      exitCode: 0,
    });
    await rejectsCode(f.run(), 'configuration');
  });
  it.each(['postgres_data', 'uploads_data'])(
    'rejects missing logical volume %s',
    async (logical) => {
      const f = fixture();
      Reflect.deleteProperty(f.cfg.volumes, logical);
      await rejectsCode(f.run(), 'configuration');
    },
  );
  it('rejects shared physical volume identity', async () => {
    const f = fixture();
    f.cfg.volumes.uploads_data.name = pg;
    await rejectsCode(f.run(), 'configuration');
  });
  it('rejects external volumes for the current contract', async () => {
    const f = fixture();
    Object.assign(f.cfg.volumes.postgres_data, { external: true });
    await rejectsCode(f.run(), 'configuration');
  });
  it('rejects unsupported configured mounts', async () => {
    const f = fixture();
    f.cfg.services.postgres.volumes[0].target = '/other';
    await rejectsCode(f.run(), 'configuration');
  });
  it('rejects configured subpath', async () => {
    const f = fixture();
    Object.assign(f.cfg.services.postgres.volumes[0], {
      volume: { subpath: 'subset' },
    });
    await rejectsCode(f.run(), 'configuration');
  });
  it.each([
    { ...options, projectRoot: 'relative' },
    { ...options, composeFile: '' },
    { ...options, projectName: 'Bad Project' },
  ])('rejects invalid explicit input %j', async (input) => {
    const f = fixture();
    await rejectsCode(f.run(input), 'configuration');
    expect(f.runner).not.toHaveBeenCalled();
  });
  it('uses an absolute compose file without cwd dependency', async () => {
    const f = fixture();
    const result = await f.run({
      ...options,
      composeFile: '/other/config.yaml',
    });
    expect(result.composeFile).toBe('/other/config.yaml');
    expect(
      f.runner.mock.calls.every(([r]) => r.cwd === options.projectRoot),
    ).toBe(true);
  });
});
describe('volume identity and existence', () => {
  it('rejects no volumes', async () => {
    const f = fixture();
    f.volumes.length = 0;
    await rejectsCode(f.run(), 'source-missing');
  });
  it.each([0, 1])('rejects one missing volume %i', async (index) => {
    const f = fixture();
    f.volumes.splice(index, 1);
    await rejectsCode(f.run(), 'source-partial');
  });
  it.each([projectLabel, volumeLabel])(
    'rejects incorrect %s label',
    async (label) => {
      const f = fixture();
      f.volumes[0].Labels[label] = 'wrong';
      await rejectsCode(f.run(), 'source-mismatch');
    },
  );
  it('rejects missing labels', async () => {
    const f = fixture();
    f.volumes[0].Labels = {};
    await rejectsCode(f.run(), 'source-mismatch');
  });
  it('rejects malformed volume inspection', async () => {
    const f = fixture();
    const original = f.runner.getMockImplementation()!;
    f.runner.mockImplementation((r) =>
      r.args[1] === 'inspect'
        ? Promise.resolve({ stdout: '{}', stderr: '', exitCode: 0 })
        : original(r),
    );
    await rejectsCode(f.run(), 'docker-failure');
  });
  it('rejects physical name mismatch in inspection', async () => {
    const f = fixture();
    const original = f.runner.getMockImplementation()!;
    f.runner.mockImplementation((r) =>
      r.args[0] === 'volume' && r.args[1] === 'inspect'
        ? Promise.resolve({
            stdout: JSON.stringify([{ ...f.volumes[0], Name: 'other' }]),
            stderr: '',
            exitCode: 0,
          })
        : original(r),
    );
    await rejectsCode(f.run(), 'source-mismatch');
  });
  it('rejects nonlocal drivers', async () => {
    const f = fixture();
    f.volumes[0].Driver = 'nfs';
    await rejectsCode(f.run(), 'source-mismatch');
  });
  it('rejects local bind driver options', async () => {
    const f = fixture();
    Object.assign(f.volumes[0], {
      Options: { type: 'none', device: '/personal', o: 'bind' },
    });
    await rejectsCode(f.run(), 'source-mismatch');
  });
});
describe('containers and state snapshots', () => {
  it.each(['postgres', 'backend', 'frontend'])(
    'records healthy running %s',
    async (service) => {
      const f = fixture();
      f.containers.push(container(service));
      const result = await f.run();
      expect(
        result.services[service as 'postgres' | 'backend' | 'frontend'],
      ).toMatchObject({
        id: 'a'.repeat(64),
        state: 'running',
        running: true,
        health: 'healthy',
        service,
      });
    },
  );
  it.each(['exited', 'created'])(
    'accepts stable postgres %s',
    async (status) => {
      const f = fixture();
      f.containers.push(container('postgres', 'a', status));
      const result = await f.run();
      expect(result.services.postgres?.state).toBe(status);
    },
  );
  it.each(['postgres', 'backend', 'frontend'])(
    'rejects duplicate singleton %s',
    async (service) => {
      const f = fixture();
      f.containers.push(
        container(service, 'a'),
        container(service, 'b', 'exited'),
      );
      await rejectsCode(f.run(), 'ambiguous');
    },
  );
  it('accepts multiple exited migrations including one-offs', async () => {
    const f = fixture();
    const one = container('migrate', 'a', 'exited');
    one.Config.Labels[oneoffLabel] = 'True';
    f.containers.push(one, container('migrate', 'b', 'exited'));
    expect((await f.run()).services.migrate).toHaveLength(2);
  });
  it.each(['running', 'created', 'paused', 'restarting', 'removing'])(
    'rejects active/transient migrate %s',
    async (status) => {
      const f = fixture();
      f.containers.push(container('migrate', 'a', status));
      await rejectsCode(f.run(), 'migration-active');
    },
  );
  it.each(['paused', 'restarting', 'removing', 'dead', 'unknown'])(
    'rejects unsafe postgres %s',
    async (status) => {
      const f = fixture();
      f.containers.push(container('postgres', 'a', status));
      await rejectsCode(f.run(), 'unsafe-state');
    },
  );
  it.each(['starting', 'unhealthy'])(
    'records health %s without readiness assertion or polling',
    async (health) => {
      const f = fixture();
      const c = container('backend');
      c.State.Health.Status = health;
      f.containers.push(c);
      expect((await f.run()).services.backend?.health).toBe(health);
      expect(
        f.runner.mock.calls.filter(([r]) => r.args[0] === 'container'),
      ).toHaveLength(1);
    },
  );
  it('records absent health', async () => {
    const f = fixture();
    const c = container('frontend');
    Reflect.deleteProperty(c.State, 'Health');
    f.containers.push(c);
    expect((await f.run()).services.frontend?.health).toBeNull();
  });
  it('rejects unknown health', async () => {
    const f = fixture();
    const c = container('backend');
    c.State.Health.Status = 'unknown';
    f.containers.push(c);
    await rejectsCode(f.run(), 'unsafe-state');
  });
  it('rejects contradictory running flags', async () => {
    const f = fixture();
    const c = container('postgres');
    c.State.Running = false;
    f.containers.push(c);
    await rejectsCode(f.run(), 'unsafe-state');
  });
  it('rejects singleton one-off', async () => {
    const f = fixture();
    const c = container('backend');
    c.Config.Labels[oneoffLabel] = 'True';
    f.containers.push(c);
    await rejectsCode(f.run(), 'ambiguous');
  });
  it('preserves network identity and aliases', async () => {
    const f = fixture();
    f.containers.push(container('postgres'));
    expect((await f.run()).services.postgres?.networks).toEqual([
      { name: 'portable_default', id: 'f'.repeat(64), aliases: ['postgres'] },
    ]);
  });
});
describe('mounts and unexpected users', () => {
  it.each(['postgres', 'backend'])(
    'rejects wrong volume for %s',
    async (service) => {
      const f = fixture();
      const c = container(service);
      c.Mounts[0].Name = 'wrong';
      f.containers.push(c);
      await rejectsCode(f.run(), 'source-mismatch');
    },
  );
  it.each(['postgres', 'backend'])(
    'rejects wrong mount target for %s',
    async (service) => {
      const f = fixture();
      const c = container(service);
      c.Mounts[0].Destination = '/wrong';
      f.containers.push(c);
      await rejectsCode(f.run(), 'source-mismatch');
    },
  );
  it('rejects read-only mount in place of expected read-write mount', async () => {
    const f = fixture();
    const c = container('postgres');
    c.Mounts[0].RW = false;
    f.containers.push(c);
    await rejectsCode(f.run(), 'source-mismatch');
  });
  it.each(['postgres', 'backend'])(
    'rejects external project using %s volume, even stopped',
    async (service) => {
      const f = fixture();
      const c = container(service, 'a', 'exited');
      c.Config.Labels[projectLabel] = 'external';
      f.containers.push(c);
      await rejectsCode(f.run(), 'unexpected-volume-user');
    },
  );
  it('rejects unlabelled external volume user', async () => {
    const f = fixture();
    const c = container('postgres');
    c.Config.Labels = {};
    f.containers.push(c);
    await rejectsCode(f.run(), 'unexpected-volume-user');
  });
  it.each(['other', 'frontend', 'migrate'])(
    'rejects unexpected service %s using source',
    async (service) => {
      const f = fixture();
      const c = container('postgres');
      c.Config.Labels[serviceLabel] = service;
      f.containers.push(c);
      await rejectsCode(f.run(), 'unexpected-volume-user');
    },
  );
  it('rejects mismatched project discovery and volume discovery', async () => {
    const f = fixture();
    f.containers.push(container('postgres'));
    const original = f.runner.getMockImplementation()!;
    f.runner.mockImplementation((r) =>
      r.args.includes(`volume=${pg}`)
        ? Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
        : original(r),
    );
    await rejectsCode(f.run(), 'source-mismatch');
  });
  it('rejects unknown service even without source mounts', async () => {
    const f = fixture();
    f.containers.push(container('unknown'));
    await rejectsCode(f.run(), 'source-mismatch');
  });
});
describe('read-only execution and safe output', () => {
  it('issues only the exact read-only commands, with separated argv', async () => {
    const f = fixture();
    f.containers.push(container('postgres'));
    await f.run();
    expect(f.runner.mock.calls.map(([r]) => r.args)).toEqual([
      [
        'compose',
        '--project-directory',
        options.projectRoot,
        '-f',
        '/workspace/renamed-folder/compose.yaml',
        'config',
        '--format',
        'json',
      ],
      ['volume', 'ls', '--format', '{{json .Name}}'],
      ['volume', 'inspect', pg],
      ['volume', 'inspect', uploads],
      [
        'ps',
        '--all',
        '--no-trunc',
        '--filter',
        `label=${projectLabel}=${project}`,
        '--format',
        '{{.ID}}',
      ],
      [
        'ps',
        '--all',
        '--no-trunc',
        '--filter',
        `volume=${pg}`,
        '--format',
        '{{.ID}}',
      ],
      [
        'ps',
        '--all',
        '--no-trunc',
        '--filter',
        `volume=${uploads}`,
        '--format',
        '{{.ID}}',
      ],
      ['container', 'inspect', 'a'.repeat(64)],
    ]);
    expect(f.runner.mock.calls.every(([r]) => r.command === 'docker')).toBe(
      true,
    );
  });
  it('returns a deeply frozen snapshot without credentials or raw inspect/config fields', async () => {
    const f = fixture();
    f.containers.push(container('postgres'));
    const result = await f.run();
    const text = JSON.stringify(result);
    for (const value of [
      secret,
      'DATABASE_URL',
      'PGPASSWORD',
      'POSTGRES_PASSWORD',
      '/private/host/path',
      'Config',
      'HostConfig',
      'Subpath',
      'Health',
    ])
      expect(text).not.toContain(value);
    function check(value: unknown) {
      if (value && typeof value === 'object') {
        expect(Object.isFrozen(value)).toBe(true);
        for (const item of Object.values(value)) check(item);
      }
    }
    check(result);
  });
  it.each([1, null])('sanitizes docker failure exit %s', async (exitCode) => {
    const f = fixture();
    f.runner.mockResolvedValueOnce({
      stdout: secret,
      stderr: secret,
      exitCode,
    });
    const error = await f.run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PreflightError);
    expect((error as Error).message).toBe(
      'Docker discovery failed or returned invalid data',
    );
    expect(JSON.stringify(error)).not.toContain(secret);
  });
  it('sanitizes native executor failure', async () => {
    const f = fixture();
    f.runner.mockRejectedValueOnce(new Error(secret));
    const error = await f.run().catch((e: unknown) => e);
    expect((error as Error).message).not.toContain(secret);
    expect(error).toMatchObject({ code: 'docker-failure' });
  });
  it('rejects disappearing container inspect', async () => {
    const f = fixture();
    f.containers.push(container('postgres'));
    const original = f.runner.getMockImplementation()!;
    f.runner.mockImplementation((r: DockerRequest) =>
      r.args[0] === 'container'
        ? Promise.resolve({ stdout: '[]', stderr: secret, exitCode: 0 })
        : original(r),
    );
    await rejectsCode(f.run(), 'docker-failure');
  });
});

describe('source volume root specifications (A1)', () => {
  it.each(['backend', 'postgres'])(
    'accepts %s without VolumeOptions',
    async (service) => {
      const f = fixture();
      f.containers.push(container(service));
      const result = await f.run();
      expect(result.services[service as 'backend' | 'postgres']).not.toBeNull();
    },
  );
  it.each(['backend', 'postgres'])(
    'rejects %s subpath despite matching resolved Mounts',
    async (service) => {
      const f = fixture();
      const c = container(service);
      Object.assign(c.HostConfig.Mounts[0], {
        VolumeOptions: { Subpath: 'subset' },
      });
      f.containers.push(c);
      await rejectsCode(f.run(), 'source-mismatch');
    },
  );
  it.each([{}, { NoCopy: false }, { Subpath: '' }])(
    'accepts root VolumeOptions %j without exporting options',
    async (volumeOptions) => {
      const f = fixture();
      const c = container('backend');
      Object.assign(c.HostConfig.Mounts[0], { VolumeOptions: volumeOptions });
      f.containers.push(c);
      const result = await f.run();
      expect(result.services.backend?.mounts).toEqual([
        {
          type: 'volume',
          name: uploads,
          destination: '/app/apps/backend/uploads',
          readWrite: true,
        },
      ]);
      expect(JSON.stringify(result)).not.toContain('HostConfig');
      expect(JSON.stringify(result)).not.toContain('Subpath');
    },
  );
  it.each(['HostConfig', 'Mounts', 'matching'])(
    'rejects absent %s specification',
    async (missing) => {
      const f = fixture();
      const c = container('backend');
      if (missing === 'HostConfig') Reflect.deleteProperty(c, 'HostConfig');
      else if (missing === 'Mounts')
        Reflect.deleteProperty(c.HostConfig, 'Mounts');
      else c.HostConfig.Mounts = [];
      f.containers.push(c);
      await rejectsCode(f.run(), 'source-mismatch');
    },
  );
  it('rejects duplicate specifications', async () => {
    const f = fixture();
    const c = container('backend');
    c.HostConfig.Mounts.push({ ...c.HostConfig.Mounts[0] });
    f.containers.push(c);
    await rejectsCode(f.run(), 'source-mismatch');
  });
  it.each([
    { Source: 'wrong-volume' },
    { Target: '/wrong-target' },
    { Type: 'bind' },
    { ReadOnly: true },
  ])('rejects divergent specification %j', async (change) => {
    const f = fixture();
    const c = container('backend');
    Object.assign(c.HostConfig.Mounts[0], change);
    f.containers.push(c);
    await rejectsCode(f.run(), 'source-mismatch');
  });
  it('rejects ambiguous partially matching specifications', async () => {
    const f = fixture();
    const c = container('backend');
    c.HostConfig.Mounts.push({ ...c.HostConfig.Mounts[0], Target: '/other' });
    f.containers.push(c);
    await rejectsCode(f.run(), 'source-mismatch');
  });
  it('matches by identity, not array position', async () => {
    const f = fixture();
    const c = container('backend');
    c.HostConfig.Mounts.unshift({
      Type: 'volume',
      Source: 'unrelated',
      Target: '/unrelated',
      ReadOnly: false,
    });
    f.containers.push(c);
    expect((await f.run()).services.backend).not.toBeNull();
  });
  it.each([null, 1, 'subset'])(
    'rejects malformed VolumeOptions %j',
    async (value) => {
      const f = fixture();
      const c = container('backend');
      Object.assign(c.HostConfig.Mounts[0], { VolumeOptions: value });
      f.containers.push(c);
      await rejectsCode(f.run(), 'source-mismatch');
    },
  );
  it.each([null, 1, secret])(
    'rejects invalid/nonempty Subpath without leaking %j',
    async (value) => {
      const f = fixture();
      const c = container('backend');
      Object.assign(c.HostConfig.Mounts[0], {
        VolumeOptions: { Subpath: value },
      });
      f.containers.push(c);
      const error = await f.run().catch((e: unknown) => e);
      expect(error).toMatchObject({ code: 'source-mismatch' });
      expect((error as Error).message).toBe(
        'Source identity, labels or mounts do not match',
      );
      expect(JSON.stringify(error)).not.toContain(secret);
    },
  );
});
