import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureHttpApplication } from '../../src/http-configuration';
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

if (databaseUrl.pathname !== '/jobtracker_test') {
  throw new Error(
    `Integration tests require the jobtracker_test database, received: ${databaseUrl.pathname.slice(1) || '<empty>'}`,
  );
}

interface UserFixtures {
  userId: number;
  companyId: number;
  jobOfferId: number;
  applicationId: number;
  cookie: string;
}

function readApplications(body: unknown): Array<{ id: number }> {
  if (!Array.isArray(body)) {
    return [];
  }

  return body.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) {
      return [];
    }

    const id = (item as Record<string, unknown>).id;

    return typeof id === 'number' ? [{ id }] : [];
  });
}

describe('Applications HTTP ownership integration', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;
  let userA: UserFixtures | undefined;
  let userB: UserFixtures | undefined;
  const password = 'integration-password';
  const marker = randomUUID();

  async function createFixtures(label: string): Promise<UserFixtures> {
    if (!app || !prisma) {
      throw new Error('Integration application is unavailable');
    }

    const email = `${label}-${marker}@jobtracker.test`;
    const user = await prisma.user.create({
      data: {
        email,
        firstName: label,
        lastName: 'Ownership',
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
      select: { id: true },
    });
    const company = await prisma.company.create({
      data: {
        name: `${label} Company ${marker}`,
        userId: user.id,
      },
      select: { id: true },
    });
    const jobOffer = await prisma.jobOffer.create({
      data: {
        title: `${label} Offer ${marker}`,
        companyId: company.id,
      },
      select: { id: true },
    });
    const application = await prisma.application.create({
      data: {
        userId: user.id,
        jobOfferId: jobOffer.id,
        source: `ownership:${label}:${marker}`,
        followUpAt: new Date('2099-08-15T10:00:00.000Z'),
        interviewAt: new Date('2099-08-20T14:00:00.000Z'),
      },
      select: { id: true },
    });
    const rawToken = randomBytes(32).toString('base64url');

    await prisma.session.create({
      data: {
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() + 3_600_000),
        userId: user.id,
      },
    });

    return {
      userId: user.id,
      companyId: company.id,
      jobOfferId: jobOffer.id,
      applicationId: application.id,
      cookie: `jobtracker_session=${rawToken}`,
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<App>();
    configureHttpApplication(app, process.env);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    userA = await createFixtures('user-a');
    userB = await createFixtures('user-b');
  });

  afterAll(async () => {
    const prismaClient = prisma;
    const fixtures = [userA, userB].filter(
      (value): value is UserFixtures => value !== undefined,
    );

    if (prismaClient) {
      await prismaClient.application.deleteMany({
        where: { userId: { in: fixtures.map(({ userId }) => userId) } },
      });
      await prismaClient.jobOffer.deleteMany({
        where: { id: { in: fixtures.map(({ jobOfferId }) => jobOfferId) } },
      });
      await prismaClient.company.deleteMany({
        where: { id: { in: fixtures.map(({ companyId }) => companyId) } },
      });
      await prismaClient.user.deleteMany({
        where: { id: { in: fixtures.map(({ userId }) => userId) } },
      });
    }

    if (app) {
      await app.close();
    }
  });

  it('returns only the authenticated user applications and deadlines', async () => {
    if (!app || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const applicationsA = await request(app.getHttpServer())
      .get('/applications')
      .set('Cookie', userA.cookie)
      .expect(200);
    const applicationsB = await request(app.getHttpServer())
      .get('/applications')
      .set('Cookie', userB.cookie)
      .expect(200);

    const bodyA = readApplications(applicationsA.body);
    const bodyB = readApplications(applicationsB.body);
    expect(bodyA).toHaveLength(1);
    expect(bodyA[0]?.id).toBe(userA.applicationId);
    expect(bodyB).toHaveLength(1);
    expect(bodyB[0]?.id).toBe(userB.applicationId);

    for (const route of ['follow-ups', 'interviews']) {
      const response = await request(app.getHttpServer())
        .get(`/applications/${route}`)
        .set('Cookie', userA.cookie)
        .expect(200);

      const body = readApplications(response.body);
      expect(body).toHaveLength(1);
      expect(body[0]?.id).toBe(userA.applicationId);
    }
  });

  it('returns the same 404 for foreign and missing applications', async () => {
    if (!app || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const missingId = 2_147_483_647;

    for (const applicationId of [userB.applicationId, missingId]) {
      await request(app.getHttpServer())
        .get(`/applications/${applicationId}`)
        .set('Cookie', userA.cookie)
        .expect(404);
    }

    await request(app.getHttpServer())
      .patch(`/applications/${userB.applicationId}`)
      .set('Cookie', userA.cookie)
      .send({ status: 'APPLIED' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/applications/${userB.applicationId}`)
      .set('Cookie', userA.cookie)
      .expect(404);
  });

  it('rejects foreign and missing job offers without side effects', async () => {
    if (!app || !prisma || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const missingId = 2_147_483_647;
    const applicationCount = await prisma.application.count();
    const eventCount = await prisma.applicationEvent.count();

    for (const jobOfferId of [userB.jobOfferId, missingId]) {
      await request(app.getHttpServer())
        .post('/applications')
        .set('Cookie', userA.cookie)
        .send({ jobOfferId, status: 'DRAFT' })
        .expect(404);
    }

    await request(app.getHttpServer())
      .patch(`/applications/${userA.applicationId}`)
      .set('Cookie', userA.cookie)
      .send({ jobOfferId: userB.jobOfferId })
      .expect(404);

    await expect(prisma.application.count()).resolves.toBe(applicationCount);
    await expect(prisma.applicationEvent.count()).resolves.toBe(eventCount);
  });

  it('rejects userId supplied by the client on create and update', async () => {
    if (!app || !userA) {
      throw new Error('Integration fixtures are unavailable');
    }

    await request(app.getHttpServer())
      .post('/applications')
      .set('Cookie', userA.cookie)
      .send({ jobOfferId: userA.jobOfferId, userId: userA.userId })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/applications/${userA.applicationId}`)
      .set('Cookie', userA.cookie)
      .send({ userId: userA.userId })
      .expect(400);
  });
});
