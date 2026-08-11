import { randomUUID } from 'crypto';
import { ApplicationsService } from '../../src/applications/applications.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const databaseUrlValue = process.env.DATABASE_URL;

if (!databaseUrlValue) {
  throw new Error(
    'DATABASE_URL must be explicitly defined for integration tests',
  );
}

let databaseUrl: URL;

try {
  databaseUrl = new URL(databaseUrlValue);
} catch {
  throw new Error('DATABASE_URL must be a valid URL for integration tests');
}

const databaseName = databaseUrl.pathname.slice(1);

if (databaseName !== 'jobtracker_test') {
  throw new Error(
    `Integration tests require the jobtracker_test database, received: ${databaseName || '<empty>'}`,
  );
}

describe('ApplicationsService PostgreSQL integration', () => {
  let prisma: PrismaService | undefined;
  let service: ApplicationsService | undefined;
  let prismaConnected = false;
  let testFunctionCreated = false;
  let testTriggerCreated = false;
  let userId: number | undefined;
  let companyId: number | undefined;
  let jobOfferId: number | undefined;
  let applicationSource: string | undefined;

  async function attemptCleanup(
    description: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    try {
      await operation();
    } catch (error: unknown) {
      console.error(`Integration cleanup failed (${description})`, error);
    }
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    service = new ApplicationsService(prisma);

    await prisma.$connect();
    prismaConnected = true;

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "jobtracker_test_fail_application_event_insert"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "Application"
          WHERE "id" = NEW."applicationId"
            AND "source" LIKE 'integration:force-event-failure:%'
        ) THEN
          RAISE EXCEPTION 'forced application event failure for integration test';
        END IF;

        RETURN NEW;
      END;
      $$;
    `);
    testFunctionCreated = true;

    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS "jobtracker_test_force_application_event_failure"
      ON "ApplicationEvent";
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "jobtracker_test_force_application_event_failure"
      BEFORE INSERT ON "ApplicationEvent"
      FOR EACH ROW
      EXECUTE FUNCTION "jobtracker_test_fail_application_event_insert"();
    `);
    testTriggerCreated = true;
  });

  beforeEach(async () => {
    if (!prisma || !prismaConnected) {
      throw new Error('Prisma was not initialized for integration tests');
    }

    const fixtureId = randomUUID();
    applicationSource = `integration:force-event-failure:${fixtureId}`;

    const user = await prisma.user.create({
      data: {
        email: `integration-${fixtureId}@jobtracker.test`,
        firstName: 'Integration',
        lastName: 'Test',
        passwordHash: 'integration-test-hash',
      },
    });
    userId = user.id;

    const company = await prisma.company.create({
      data: {
        name: `Integration Company ${fixtureId}`,
        userId,
      },
    });
    companyId = company.id;

    const jobOffer = await prisma.jobOffer.create({
      data: {
        title: `Integration Job Offer ${fixtureId}`,
        companyId,
      },
    });
    jobOfferId = jobOffer.id;
  });

  afterEach(async () => {
    const prismaClient = prisma;

    if (prismaClient && prismaConnected) {
      if (applicationSource !== undefined) {
        const source = applicationSource;

        await attemptCleanup('applications', async () => {
          await prismaClient.application.deleteMany({
            where: {
              source,
            },
          });
        });
      }

      if (jobOfferId !== undefined) {
        const id = jobOfferId;

        await attemptCleanup('job offer', async () => {
          await prismaClient.jobOffer.deleteMany({
            where: {
              id,
            },
          });
        });
      }

      if (companyId !== undefined) {
        const id = companyId;

        await attemptCleanup('company', async () => {
          await prismaClient.company.deleteMany({
            where: {
              id,
            },
          });
        });
      }

      if (userId !== undefined) {
        const id = userId;

        await attemptCleanup('user', async () => {
          await prismaClient.user.deleteMany({
            where: {
              id,
            },
          });
        });
      }
    }

    applicationSource = undefined;
    jobOfferId = undefined;
    companyId = undefined;
    userId = undefined;
  });

  afterAll(async () => {
    const prismaClient = prisma;

    if (!prismaClient) {
      return;
    }

    if (prismaConnected && testTriggerCreated) {
      await attemptCleanup('test trigger', async () => {
        await prismaClient.$executeRawUnsafe(`
          DROP TRIGGER IF EXISTS "jobtracker_test_force_application_event_failure"
          ON "ApplicationEvent";
        `);
      });
    }

    if (prismaConnected && testFunctionCreated) {
      await attemptCleanup('test function', async () => {
        await prismaClient.$executeRawUnsafe(`
          DROP FUNCTION IF EXISTS "jobtracker_test_fail_application_event_insert"();
        `);
      });
    }

    await attemptCleanup('Prisma disconnect', async () => {
      await prismaClient.$disconnect();
    });

    prismaConnected = false;
  });

  it('rolls back the application when application event creation fails', async () => {
    if (
      !prisma ||
      !service ||
      userId === undefined ||
      jobOfferId === undefined ||
      applicationSource === undefined
    ) {
      throw new Error('Integration test fixtures were not created');
    }

    await expect(
      service.create({
        userId,
        jobOfferId,
        status: 'APPLIED',
        source: applicationSource,
      }),
    ).rejects.toThrow('forced application event failure for integration test');

    const persistedApplications = await prisma.application.count({
      where: {
        source: applicationSource,
      },
    });

    expect(persistedApplications).toBe(0);
  });
});
