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
  applicationIds: number[];
  cookie: string;
}

interface FixtureOptions {
  companyCount: number;
  jobOfferCount: number;
  applications: Array<{
    status: 'DRAFT' | 'APPLIED' | 'INTERVIEW' | 'REJECTED';
    followUp: boolean;
    interview: boolean;
    createdWeeksAgo: number;
  }>;
}

function readRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Expected an object response');
  }

  return body as Record<string, unknown>;
}

function readIds(body: unknown): number[] {
  if (!Array.isArray(body)) {
    return [];
  }

  return body.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) {
      return [];
    }

    const id = (item as Record<string, unknown>).id;
    return typeof id === 'number' ? [id] : [];
  });
}

describe('Dashboard and calendar HTTP ownership integration', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;
  let userA: UserFixtures | undefined;
  let userB: UserFixtures | undefined;
  const marker = randomUUID();

  async function createFixtures(
    label: string,
    options: FixtureOptions,
  ): Promise<UserFixtures> {
    if (!prisma) {
      throw new Error('Integration Prisma client is unavailable');
    }

    const user = await prisma.user.create({
      data: {
        email: `${label}-${marker}@jobtracker.test`,
        firstName: label,
        lastName: 'Dashboard',
        passwordHash: await argon2.hash('integration-password', {
          type: argon2.argon2id,
        }),
      },
      select: { id: true },
    });
    const companyIds: number[] = [];

    for (let index = 0; index < options.companyCount; index += 1) {
      const company = await prisma.company.create({
        data: {
          name: `${label} Company ${index} ${marker}`,
          userId: user.id,
        },
        select: { id: true },
      });
      companyIds.push(company.id);
    }

    const jobOfferIds: number[] = [];

    for (let index = 0; index < options.jobOfferCount; index += 1) {
      const companyId = companyIds[index % companyIds.length];

      if (companyId === undefined) {
        throw new Error('A company is required for each job offer');
      }

      const jobOffer = await prisma.jobOffer.create({
        data: {
          title: `${label} Offer ${index} ${marker}`,
          companyId,
        },
        select: { id: true },
      });
      jobOfferIds.push(jobOffer.id);
    }

    const applicationIds: number[] = [];
    const fixtureNow = Date.now();
    const dayInMilliseconds = 24 * 60 * 60 * 1000;
    const currentWeekStart = new Date(fixtureNow);
    currentWeekStart.setUTCHours(0, 0, 0, 0);
    currentWeekStart.setUTCDate(
      currentWeekStart.getUTCDate() - ((currentWeekStart.getUTCDay() + 6) % 7),
    );

    for (const [index, applicationFixture] of options.applications.entries()) {
      const jobOfferId = jobOfferIds[index % jobOfferIds.length];

      if (jobOfferId === undefined) {
        throw new Error('A job offer is required for each application');
      }

      const application = await prisma.application.create({
        data: {
          userId: user.id,
          jobOfferId,
          status: applicationFixture.status,
          source: `dashboard-calendar:${label}:${index}:${marker}`,
          createdAt: new Date(
            currentWeekStart.getTime() -
              applicationFixture.createdWeeksAgo * 7 * dayInMilliseconds +
              12 * 60 * 60 * 1000,
          ),
          followUpAt: applicationFixture.followUp
            ? new Date(fixtureNow + (index + 2) * dayInMilliseconds)
            : null,
          interviewAt: applicationFixture.interview
            ? new Date(fixtureNow + (index + 2) * dayInMilliseconds)
            : null,
        },
        select: { id: true },
      });
      applicationIds.push(application.id);
    }

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
      applicationIds,
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
    userA = await createFixtures('user-a', {
      companyCount: 1,
      jobOfferCount: 1,
      applications: [
        {
          status: 'DRAFT',
          followUp: true,
          interview: false,
          createdWeeksAgo: 0,
        },
        {
          status: 'APPLIED',
          followUp: false,
          interview: true,
          createdWeeksAgo: 1,
        },
      ],
    });
    userB = await createFixtures('user-b', {
      companyCount: 2,
      jobOfferCount: 3,
      applications: [
        {
          status: 'INTERVIEW',
          followUp: true,
          interview: true,
          createdWeeksAgo: 0,
        },
        {
          status: 'INTERVIEW',
          followUp: false,
          interview: true,
          createdWeeksAgo: 3,
        },
        {
          status: 'REJECTED',
          followUp: true,
          interview: true,
          createdWeeksAgo: 7,
        },
      ],
    });
  });

  afterAll(async () => {
    const prismaClient = prisma;

    if (prismaClient) {
      const users = await prismaClient.user.findMany({
        where: { email: { contains: marker } },
        select: { id: true },
      });
      const userIds = users.map(({ id }) => id);

      await prismaClient.application.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prismaClient.jobOffer.deleteMany({
        where: { company: { userId: { in: userIds } } },
      });
      await prismaClient.company.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prismaClient.user.deleteMany({ where: { id: { in: userIds } } });
    }

    if (app) {
      await app.close();
    }
  });

  it('isolates every dashboard metric for both users', async () => {
    if (!app || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const responseA = await request(app.getHttpServer())
      .get('/dashboard/stats')
      .set('Cookie', userA.cookie)
      .expect(200);
    const responseB = await request(app.getHttpServer())
      .get('/dashboard/stats')
      .set('Cookie', userB.cookie)
      .expect(200);
    const statsA = readRecord(responseA.body);
    const statsB = readRecord(responseB.body);

    expect(statsA).toMatchObject({
      totalApplications: 2,
      totalCompanies: 1,
      totalJobOffers: 1,
      upcomingFollowUps: 1,
      upcomingInterviews: 1,
      recentApplications: 2,
      applicationsLast7Days: 1,
      applicationsLast30Days: 2,
      upcomingFollowUps7Days: 1,
      upcomingInterviews7Days: 1,
      interviewRate: 50,
    });
    expect(statsA.applicationsByStatus).toEqual([
      { status: 'DRAFT', count: 1 },
      { status: 'APPLIED', count: 1 },
      { status: 'FOLLOW_UP', count: 0 },
      { status: 'INTERVIEW', count: 0 },
      { status: 'ACCEPTED', count: 0 },
      { status: 'REJECTED', count: 0 },
    ]);
    const weeklyApplicationsA = statsA.weeklyApplications;
    expect(Array.isArray(weeklyApplicationsA)).toBe(true);
    expect(weeklyApplicationsA).toHaveLength(8);
    expect(
      (weeklyApplicationsA as Array<Record<string, unknown>>).map(
        ({ count }) => count,
      ),
    ).toEqual([0, 0, 0, 0, 0, 0, 1, 1]);

    expect(statsB).toMatchObject({
      totalApplications: 3,
      totalCompanies: 2,
      totalJobOffers: 3,
      upcomingFollowUps: 2,
      upcomingInterviews: 3,
      recentApplications: 2,
      applicationsLast7Days: 1,
      applicationsLast30Days: 2,
      upcomingFollowUps7Days: 2,
      upcomingInterviews7Days: 3,
      interviewRate: 100,
    });
    expect(statsB.applicationsByStatus).toEqual([
      { status: 'DRAFT', count: 0 },
      { status: 'APPLIED', count: 0 },
      { status: 'FOLLOW_UP', count: 0 },
      { status: 'INTERVIEW', count: 2 },
      { status: 'ACCEPTED', count: 0 },
      { status: 'REJECTED', count: 1 },
    ]);
    const weeklyApplicationsB = statsB.weeklyApplications;
    expect(Array.isArray(weeklyApplicationsB)).toBe(true);
    expect(weeklyApplicationsB).toHaveLength(8);
    const weeklyPointsB = weeklyApplicationsB as Array<Record<string, unknown>>;
    expect(weeklyPointsB.map(({ count }) => count)).toEqual([
      1, 0, 0, 0, 1, 0, 0, 1,
    ]);
    const weekStarts = weeklyPointsB.map(({ weekStart }) => weekStart);
    expect(weekStarts).toEqual([...weekStarts].sort());
  });

  it('isolates follow-up and interview calendar endpoints for both users', async () => {
    if (!app || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const followUpsA = await request(app.getHttpServer())
      .get('/applications/follow-ups')
      .set('Cookie', userA.cookie)
      .expect(200);
    const interviewsA = await request(app.getHttpServer())
      .get('/applications/interviews')
      .set('Cookie', userA.cookie)
      .expect(200);
    const followUpsB = await request(app.getHttpServer())
      .get('/applications/follow-ups')
      .set('Cookie', userB.cookie)
      .expect(200);
    const interviewsB = await request(app.getHttpServer())
      .get('/applications/interviews')
      .set('Cookie', userB.cookie)
      .expect(200);

    expect(readIds(followUpsA.body)).toEqual([userA.applicationIds[0]]);
    expect(readIds(interviewsA.body)).toEqual([userA.applicationIds[1]]);
    expect(readIds(followUpsB.body)).toEqual([
      userB.applicationIds[0],
      userB.applicationIds[2],
    ]);
    expect(readIds(interviewsB.body)).toEqual(userB.applicationIds);
  });
});
