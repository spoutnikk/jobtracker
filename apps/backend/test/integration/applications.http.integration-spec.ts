import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import {
  configureHttpApplication,
  DEFAULT_FRONTEND_ORIGIN,
} from '../../src/http-configuration';
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
  const items =
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    Array.isArray((body as Record<string, unknown>).items)
      ? (body as Record<string, unknown>).items
      : body;

  if (!Array.isArray(items)) {
    return [];
  }

  return items.flatMap((item: unknown) => {
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

  it('creates, reads, updates, and removes an owned application', async () => {
    if (!app || !prisma || !userA) {
      throw new Error('Integration fixtures are unavailable');
    }

    const createResponse = await request(app.getHttpServer())
      .post('/applications')
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .send({
        jobOfferId: userA.jobOfferId,
        status: 'APPLIED',
        appliedAt: '2026-08-16T10:00:00.000Z',
        source: `happy-path:${marker}`,
        notes: 'Created through the HTTP integration test',
      })
      .expect(201);

    const createdBody = createResponse.body as Record<string, unknown>;
    const applicationId = createdBody.id;

    expect(typeof applicationId).toBe('number');
    expect(createdBody.status).toBe('APPLIED');
    expect(createdBody.jobOfferId).toBe(userA.jobOfferId);

    if (typeof applicationId !== 'number') {
      throw new Error('Created application did not return a numeric id');
    }

    await expect(
      prisma.application.findUnique({
        where: { id: applicationId },
        select: {
          userId: true,
          jobOfferId: true,
          status: true,
          source: true,
        },
      }),
    ).resolves.toEqual({
      userId: userA.userId,
      jobOfferId: userA.jobOfferId,
      status: 'APPLIED',
      source: `happy-path:${marker}`,
    });

    const createdEvents = await prisma.applicationEvent.findMany({
      where: { applicationId },
      select: { type: true },
      orderBy: { occurredAt: 'asc' },
    });

    expect(createdEvents.map(({ type }) => type)).toEqual(
      expect.arrayContaining(['CREATED', 'APPLICATION_SENT']),
    );

    const getResponse = await request(app.getHttpServer())
      .get(`/applications/${applicationId}`)
      .set('Cookie', userA.cookie)
      .expect(200);

    expect(getResponse.body).toEqual(
      expect.objectContaining({
        id: applicationId,
        status: 'APPLIED',
        source: `happy-path:${marker}`,
      }),
    );

    const updateResponse = await request(app.getHttpServer())
      .patch(`/applications/${applicationId}`)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .send({
        status: 'INTERVIEW',
        followUpAt: '2026-08-25T09:00:00.000Z',
        interviewAt: '2026-08-30T14:00:00.000Z',
        notes: 'Updated through the HTTP integration test',
      })
      .expect(200);

    expect(updateResponse.body).toEqual(
      expect.objectContaining({
        id: applicationId,
        status: 'INTERVIEW',
        notes: 'Updated through the HTTP integration test',
      }),
    );

    await expect(
      prisma.application.findUnique({
        where: { id: applicationId },
        select: {
          status: true,
          followUpAt: true,
          interviewAt: true,
          notes: true,
        },
      }),
    ).resolves.toEqual({
      status: 'INTERVIEW',
      followUpAt: new Date('2026-08-25T09:00:00.000Z'),
      interviewAt: new Date('2026-08-30T14:00:00.000Z'),
      notes: 'Updated through the HTTP integration test',
    });

    const updatedEvents = await prisma.applicationEvent.findMany({
      where: { applicationId },
      select: { type: true },
    });

    expect(updatedEvents.map(({ type }) => type)).toEqual(
      expect.arrayContaining([
        'CREATED',
        'APPLICATION_SENT',
        'STATUS_CHANGED',
        'FOLLOW_UP',
        'INTERVIEW',
      ]),
    );

    await request(app.getHttpServer())
      .delete(`/applications/${applicationId}`)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .expect(200);

    await expect(
      prisma.application.findUnique({
        where: { id: applicationId },
      }),
    ).resolves.toBeNull();

    await expect(
      prisma.applicationEvent.count({
        where: { applicationId },
      }),
    ).resolves.toBe(0);
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

  it('returns the same 404 for foreign and missing applications without side effects', async () => {
    if (!app || !prisma || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const foreignApplicationBefore = await prisma.application.findUniqueOrThrow(
      {
        where: { id: userB.applicationId },
        select: { status: true },
      },
    );
    const missingId = 2_147_483_647;

    for (const applicationId of [userB.applicationId, missingId]) {
      await request(app.getHttpServer())
        .get(`/applications/${applicationId}`)
        .set('Cookie', userA.cookie)
        .expect(404);
    }

    await request(app.getHttpServer())
      .patch(`/applications/${userB.applicationId}`)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .send({ status: 'APPLIED' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/applications/${userB.applicationId}`)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .expect(404);

    await expect(
      prisma.application.findUnique({
        where: { id: userB.applicationId },
        select: { status: true },
      }),
    ).resolves.toEqual(foreignApplicationBefore);
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
        .set('Origin', DEFAULT_FRONTEND_ORIGIN)
        .set('Cookie', userA.cookie)
        .send({ jobOfferId, status: 'DRAFT' })
        .expect(404);
    }

    await request(app.getHttpServer())
      .patch(`/applications/${userA.applicationId}`)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
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
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .send({ jobOfferId: userA.jobOfferId, userId: userA.userId })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/applications/${userA.applicationId}`)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .send({ userId: userA.userId })
      .expect(400);
  });
});
