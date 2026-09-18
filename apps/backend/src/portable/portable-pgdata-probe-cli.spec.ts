import { runPgdataProbeCli } from './portable-pgdata-probe-cli';

describe('PGDATA probe CLI', () => {
  function io() {
    return { writeStdout: jest.fn(), setExitCode: jest.fn() };
  }

  it('writes exactly one canonical success line and exit zero', async () => {
    const output = io();
    await runPgdataProbeCli(
      () => Promise.resolve({ ok: true, postgresMajor: 17 }),
      output,
    );
    expect(output.writeStdout).toHaveBeenCalledTimes(1);
    expect(output.writeStdout).toHaveBeenCalledWith(
      '{"ok":true,"postgresMajor":17}\n',
    );
    expect(output.setExitCode).toHaveBeenCalledWith(0);
  });

  it.each([new Error('SECRET:/probe/pgdata'), new TypeError('unexpected')])(
    'redacts probe failure %#',
    async (failure) => {
      const output = io();
      await runPgdataProbeCli(() => Promise.reject(failure), output);
      expect(output.writeStdout).not.toHaveBeenCalled();
      expect(output.setExitCode).toHaveBeenCalledWith(1);
      expect(JSON.stringify(output)).not.toContain('SECRET');
    },
  );
});
