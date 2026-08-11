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

function readPaginatedItems(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  return (body as Record<string, unknown>).items;
}

function readNumber(body: unknown, property: string): number | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const value = (body as Record<string, unknown>)[property];
  return typeof value === 'number' ? value : undefined;
}

function readMessage(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  return (body as Record<string, unknown>).message;
}

describe('Companies and JobOffers HTTP ownership integration', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;
  let userA: UserFixtures | undefined;
  let userB: UserFixtures | undefined;
  const marker = randomUUID();

  async function createFixtures(label: string): Promise<UserFixtures> {
    if (!prisma) {
      throw new Error('Integration Prisma client is unavailable');
    }

    const user = await prisma.user.create({
      data: {
        email: `${label}-${marker}@jobtracker.test`,
        firstName: label,
        lastName: 'Ownership',
        passwordHash: await argon2.hash('integration-password', {
          type: argon2.argon2id,
        }),
      },
      select: { id: true },
    });
    const company = await prisma.company.create({
      data: { name: `${label} Company ${marker}`, userId: user.id },
      select: { id: true },
    });
    const jobOffer = await prisma.jobOffer.create({
      data: { title: `${label} Offer ${marker}`, companyId: company.id },
      select: { id: true },
    });
    const application = await prisma.application.create({
      data: {
        userId: user.id,
        jobOfferId: jobOffer.id,
        source: `companies-job-offers:${label}:${marker}`,
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

  it('isolates company lists and returns the same 404 for foreign and missing companies', async () => {
    if (!app || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const companiesA = await request(app.getHttpServer())
      .get('/companies')
      .set('Cookie', userA.cookie)
      .expect(200);
    const companiesB = await request(app.getHttpServer())
      .get('/companies')
      .set('Cookie', userB.cookie)
      .expect(200);

    expect(readIds(readPaginatedItems(companiesA.body))).toEqual([
      userA.companyId,
    ]);
    expect(readIds(readPaginatedItems(companiesB.body))).toEqual([
      userB.companyId,
    ]);

    const foreign = await request(app.getHttpServer())
      .get(`/companies/${userB.companyId}`)
      .set('Cookie', userA.cookie)
      .expect(404);
    const missing = await request(app.getHttpServer())
      .get('/companies/2147483647')
      .set('Cookie', userA.cookie)
      .expect(404);

    expect(readMessage(foreign.body)).toBe(
      `Company with id ${userB.companyId} not found`,
    );
    expect(readMessage(missing.body)).toBe(
      'Company with id 2147483647 not found',
    );

    await request(app.getHttpServer())
      .patch(`/companies/${userB.companyId}`)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .send({ city: 'Paris' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/companies/${userB.companyId}`)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .expect(404);
  });

  it('paginates and searches companies without exposing another user', async () => {
    if (!app || !prisma || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const prismaClient = prisma;
    const ownerId = userA.userId;
    const additionalCompanies = await Promise.all(
      ['Alpha', 'Beta', 'Gamma'].map((name) =>
        prismaClient.company.create({
          data: {
            name: `${name} ${marker}`,
            userId: ownerId,
          },
          select: { id: true },
        }),
      ),
    );
    const ownedIds = new Set([
      userA.companyId,
      ...additionalCompanies.map(({ id }) => id),
    ]);

    const firstPage = await request(app.getHttpServer())
      .get('/companies')
      .query({
        search: marker,
        page: 1,
        pageSize: 2,
        sortBy: 'name',
        sortOrder: 'asc',
      })
      .set('Cookie', userA.cookie)
      .expect(200);
    const secondPage = await request(app.getHttpServer())
      .get('/companies')
      .query({
        search: marker,
        page: 2,
        pageSize: 2,
        sortBy: 'name',
        sortOrder: 'asc',
      })
      .set('Cookie', userA.cookie)
      .expect(200);
    const returnedIds = [
      ...readIds(readPaginatedItems(firstPage.body)),
      ...readIds(readPaginatedItems(secondPage.body)),
    ];

    expect(readNumber(firstPage.body, 'total')).toBe(4);
    expect(readNumber(firstPage.body, 'totalPages')).toBe(2);
    expect(readNumber(firstPage.body, 'page')).toBe(1);
    expect(readNumber(secondPage.body, 'page')).toBe(2);
    expect(returnedIds).toHaveLength(4);
    expect(returnedIds.every((id) => ownedIds.has(id))).toBe(true);
    expect(returnedIds).not.toContain(userB.companyId);

    await request(app.getHttpServer())
      .get('/companies?page=0')
      .set('Cookie', userA.cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get('/companies?pageSize=51')
      .set('Cookie', userA.cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get('/companies?sortBy=userId')
      .set('Cookie', userA.cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/companies?userId=${userB.userId}`)
      .set('Cookie', userA.cookie)
      .expect(400);
  });

  it('isolates job offers and rejects foreign company associations', async () => {
    if (!app || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const jobOffers = await request(app.getHttpServer())
      .get('/job-offers')
      .set('Cookie', userA.cookie)
      .expect(200);
    expect(readIds(readPaginatedItems(jobOffers.body))).toEqual([
      userA.jobOfferId,
    ]);

    await request(app.getHttpServer())
      .get(`/job-offers/${userB.jobOfferId}`)
      .set('Cookie', userA.cookie)
      .expect(404);
    await request(app.getHttpServer())
      .post('/job-offers')
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .send({ title: 'Foreign company offer', companyId: userB.companyId })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/job-offers/${userA.jobOfferId}`)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .send({ companyId: userB.companyId })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/job-offers/${userB.jobOfferId}`)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .expect(404);
  });

  it('paginates and filters job offers without exposing another user', async () => {
    if (!app || !prisma || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const additionalOffers = await Promise.all(
      ['Frontend', 'Backend', 'Fullstack'].map((title) =>
        prisma.jobOffer.create({
          data: {
            title: `${title} ${marker}`,
            companyId: userA.companyId,
            contractType: 'CDI',
          },
          select: { id: true },
        }),
      ),
    );
    const ownedIds = new Set([
      userA.jobOfferId,
      ...additionalOffers.map(({ id }) => id),
    ]);
    const firstPage = await request(app.getHttpServer())
      .get('/job-offers')
      .query({ search: marker, page: 1, pageSize: 2, sortBy: 'title' })
      .set('Cookie', userA.cookie)
      .expect(200);
    const secondPage = await request(app.getHttpServer())
      .get('/job-offers')
      .query({ search: marker, page: 2, pageSize: 2, sortBy: 'title' })
      .set('Cookie', userA.cookie)
      .expect(200);
    const returnedIds = [
      ...readIds(readPaginatedItems(firstPage.body)),
      ...readIds(readPaginatedItems(secondPage.body)),
    ];

    expect(readNumber(firstPage.body, 'total')).toBe(4);
    expect(readNumber(firstPage.body, 'totalPages')).toBe(2);
    expect(returnedIds).toHaveLength(4);
    expect(returnedIds.every((id) => ownedIds.has(id))).toBe(true);
    expect(returnedIds).not.toContain(userB.jobOfferId);

    const foreignCompanyFilter = await request(app.getHttpServer())
      .get('/job-offers')
      .query({ companyId: userB.companyId })
      .set('Cookie', userA.cookie)
      .expect(200);
    expect(readIds(readPaginatedItems(foreignCompanyFilter.body))).toEqual([]);
    expect(readNumber(foreignCompanyFilter.body, 'total')).toBe(0);

    const contractFilter = await request(app.getHttpServer())
      .get('/job-offers')
      .query({ contractType: 'CDI' })
      .set('Cookie', userA.cookie)
      .expect(200);
    expect(readNumber(contractFilter.body, 'total')).toBe(3);

    await request(app.getHttpServer())
      .get('/job-offers?page=0')
      .set('Cookie', userA.cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get('/job-offers?pageSize=51')
      .set('Cookie', userA.cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get('/job-offers?sortBy=company')
      .set('Cookie', userA.cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/job-offers?userId=${userB.userId}`)
      .set('Cookie', userA.cookie)
      .expect(400);
  });

  it('preserves owned company and job offer deletion conflicts', async () => {
    if (!app || !userA) {
      throw new Error('Integration fixtures are unavailable');
    }

    const companyConflict = await request(app.getHttpServer())
      .delete(`/companies/${userA.companyId}`)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .expect(409);
    expect(readMessage(companyConflict.body)).toBe(
      `Company with id ${userA.companyId} cannot be deleted because it has job offers`,
    );

    const jobOfferConflict = await request(app.getHttpServer())
      .delete(`/job-offers/${userA.jobOfferId}`)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .expect(409);
    expect(readMessage(jobOfferConflict.body)).toBe(
      `Job offer with id ${userA.jobOfferId} cannot be deleted because it has applications`,
    );
  });
});
