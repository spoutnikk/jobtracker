import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import {
  initializeAuthUser,
  readAuthInitializationConfig,
  type RunInitializationTransaction,
} from '../src/auth-initialization/initialize-auth-user';

async function main(): Promise<void> {
  const config = readAuthInitializationConfig(process.env);

  console.log(`Target database: ${config.databaseName}`);

  if (process.argv.includes('--dry-run')) {
    console.log('Dry run successful; no database changes were made.');
    return;
  }

  const adapter = new PrismaPg({
    connectionString: config.databaseUrl,
  });
  const prisma = new PrismaClient({ adapter });

  const runTransaction: RunInitializationTransaction = (operation, options) =>
    prisma.$transaction(
      (transaction) =>
        operation({
          countUsers: () => transaction.user.count(),
          createUser: (input) =>
            transaction.user.create({
              data: input,
              select: { id: true },
            }),
        }),
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel[options.isolationLevel],
      },
    );

  try {
    const result = await initializeAuthUser(config, {
      hashPassword: (password) =>
        argon2.hash(password, { type: argon2.argon2id }),
      runTransaction,
    });

    console.log(`Authentication user initialized with id ${result.userId}.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';

  console.error(`Authentication initialization failed: ${message}`);
  process.exitCode = 1;
});
