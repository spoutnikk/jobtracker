const { spawnSync } = require('node:child_process');
const path = require('node:path');

function fail(message) {
  console.error(`Test database migration aborted: ${message}`);
  process.exit(1);
}

const databaseUrlValue = process.env.DATABASE_URL;

if (!databaseUrlValue) {
  fail('DATABASE_URL must be explicitly defined');
}

let databaseUrl;

try {
  databaseUrl = new URL(databaseUrlValue);
} catch {
  fail('DATABASE_URL must be a valid URL');
}

if (!['postgresql:', 'postgres:'].includes(databaseUrl.protocol)) {
  fail('DATABASE_URL must use the postgresql or postgres protocol');
}

if (databaseUrl.pathname !== '/jobtracker_test') {
  fail(
    `DATABASE_URL must target exactly /jobtracker_test, received: ${databaseUrl.pathname || '<empty>'}`,
  );
}

if (process.argv.includes('--dry-run')) {
  console.log(
    'DATABASE_URL validated for jobtracker_test; prisma migrate deploy was not executed',
  );
  process.exit(0);
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(pnpmCommand, ['exec', 'prisma', 'migrate', 'deploy'], {
  cwd: path.resolve(__dirname, '..'),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error('Failed to start prisma migrate deploy:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
