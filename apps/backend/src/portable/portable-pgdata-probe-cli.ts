import {
  runPgdataStructuralProbe,
  type PgdataProbeResult,
} from './portable-pgdata-probe';

export interface ProbeCliIo {
  writeStdout(value: string): void;
  setExitCode(value: number): void;
}

export async function runPgdataProbeCli(
  probe: () => Promise<PgdataProbeResult> = runPgdataStructuralProbe,
  io: ProbeCliIo = {
    writeStdout: (value) => process.stdout.write(value),
    setExitCode: (value) => {
      process.exitCode = value;
    },
  },
): Promise<void> {
  try {
    const result = await probe();
    if (result.ok !== true || result.postgresMajor !== 17) throw new Error();
    io.writeStdout('{"ok":true,"postgresMajor":17}\n');
    io.setExitCode(0);
  } catch {
    io.setExitCode(1);
  }
}

if (require.main === module) void runPgdataProbeCli();
