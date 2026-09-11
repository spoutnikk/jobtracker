import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import argon2 from 'argon2';
import type { Server } from 'node:net';
import request from 'supertest';
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
  let app: INestApplication<Server> | undefined;
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

    app = moduleFixture.createNestApplication();
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

  it.each([
    ['companies', 'name'],
    ['job-offers', 'title'],
    ['job-offers', 'companyId'],
  ])(
    'rejects null %s.%s without changing owned resources',
    async (resource, property) => {
      if (!app || !prisma || !userA) {
        throw new Error('Integration fixtures are unavailable');
      }
      const companyBefore = await prisma.company.findUniqueOrThrow({
        where: { id: userA.companyId },
      });
      const offerBefore = await prisma.jobOffer.findUniqueOrThrow({
        where: { id: userA.jobOfferId },
      });
      const id = resource === 'companies' ? userA.companyId : userA.jobOfferId;
      await request(app.getHttpServer())
        .patch(`/${resource}/${id}`)
        .set('Origin', DEFAULT_FRONTEND_ORIGIN)
        .set('Cookie', userA.cookie)
        .send({ [property]: null })
        .expect(400);
      await expect(
        prisma.company.findUniqueOrThrow({ where: { id: userA.companyId } }),
      ).resolves.toEqual(companyBefore);
      await expect(
        prisma.jobOffer.findUniqueOrThrow({ where: { id: userA.jobOfferId } }),
      ).resolves.toEqual(offerBefore);
    },
  );

  it('preserves omitted company fields and clears each field independently', async () => {
    if (!app || !prisma || !userA) {
      throw new Error('Integration fixtures are unavailable');
    }
    const website = 'https://example.com';
    const city = 'Lille';
    const company = await prisma.company.create({
      data: {
        name: `Nullable company ${marker}`,
        userId: userA.userId,
        website,
        city,
      },
    });
    try {
      for (const { payload, expected } of [
        {
          payload: { name: `Renamed company ${marker}` },
          expected: { website, city },
        },
        { payload: { website: null }, expected: { website: null, city } },
        { payload: { website }, expected: { website, city } },
        { payload: { city: null }, expected: { website, city: null } },
      ]) {
        const response = await request(app.getHttpServer())
          .patch(`/companies/${company.id}`)
          .set('Origin', DEFAULT_FRONTEND_ORIGIN)
          .set('Cookie', userA.cookie)
          .send(payload)
          .expect(200);
        const body = response.body as Record<string, unknown>;
        expect(body).toMatchObject(expected);
        const readResponse = await request(app.getHttpServer())
          .get(`/companies/${company.id}`)
          .set('Cookie', userA.cookie)
          .expect(200);
        const readBody = readResponse.body as Record<string, unknown>;
        expect(readBody).toMatchObject(expected);
        const persisted = await prisma.company.findUniqueOrThrow({
          where: { id: company.id },
        });
        expect(persisted).toMatchObject(expected);
      }
    } finally {
      await prisma.company.delete({ where: { id: company.id } });
    }
  });

  it('preserves omitted offer fields and clears them without changing publishedAt', async () => {
    if (!app || !prisma || !userA) {
      throw new Error('Integration fixtures are unavailable');
    }
    const publishedAt = '2026-08-16T10:00:00.000Z';
    const initial = {
      url: 'https://example.com/jobs/1',
      description: 'Build applications',
      location: 'Lille',
      contractType: 'CDI' as const,
      salary: '45 000 €',
    };
    const offer = await prisma.jobOffer.create({
      data: {
        title: `Nullable offer ${marker}`,
        companyId: userA.companyId,
        ...initial,
        publishedAt: new Date(publishedAt),
      },
    });
    try {
      const cleared = {
        url: null,
        description: null,
        location: null,
        contractType: null,
        salary: null,
      };
      for (const { payload, expected } of [
        { payload: { title: `Renamed offer ${marker}` }, expected: initial },
        { payload: cleared, expected: cleared },
      ]) {
        const response = await request(app.getHttpServer())
          .patch(`/job-offers/${offer.id}`)
          .set('Origin', DEFAULT_FRONTEND_ORIGIN)
          .set('Cookie', userA.cookie)
          .send(payload)
          .expect(200);
        const body = response.body as Record<string, unknown>;
        expect(body).toMatchObject({ ...expected, publishedAt });
        const readResponse = await request(app.getHttpServer())
          .get(`/job-offers/${offer.id}`)
          .set('Cookie', userA.cookie)
          .expect(200);
        const readBody = readResponse.body as Record<string, unknown>;
        expect(readBody).toMatchObject({ ...expected, publishedAt });
        const persisted = await prisma.jobOffer.findUniqueOrThrow({
          where: { id: offer.id },
        });
        expect(persisted).toMatchObject({
          ...expected,
          publishedAt: new Date(publishedAt),
        });
      }
    } finally {
      await prisma.jobOffer.delete({ where: { id: offer.id } });
    }
  });

  it('preserves, replaces, and clears an owned offer publication date through PATCH', async () => {
    if (!app || !prisma || !userA) {
      throw new Error('Integration fixtures are unavailable');
    }
    const initialDate = '2026-08-16T10:00:00.000Z';
    const replacementDate = '2026-08-20T14:30:00.000Z';
    const offer = await prisma.jobOffer.create({
      data: {
        title: `Publication date ${marker}`,
        companyId: userA.companyId,
        publishedAt: new Date(initialDate),
      },
    });
    try {
      for (const { payload, expected } of [
        {
          payload: { title: `Updated publication date ${marker}` },
          expected: initialDate,
        },
        {
          payload: { publishedAt: replacementDate },
          expected: replacementDate,
        },
        { payload: { publishedAt: null }, expected: null },
      ]) {
        const response = await request(app.getHttpServer())
          .patch(`/job-offers/${offer.id}`)
          .set('Origin', DEFAULT_FRONTEND_ORIGIN)
          .set('Cookie', userA.cookie)
          .send(payload)
          .expect(200);
        const body = response.body as Record<string, unknown>;
        expect(body.publishedAt).toBe(expected);
        const readResponse = await request(app.getHttpServer())
          .get(`/job-offers/${offer.id}`)
          .set('Cookie', userA.cookie)
          .expect(200);
        const readBody = readResponse.body as Record<string, unknown>;
        expect(readBody.publishedAt).toBe(expected);
        const persisted = await prisma.jobOffer.findUniqueOrThrow({
          where: { id: offer.id },
        });
        expect(persisted.publishedAt).toEqual(
          expected === null ? null : new Date(expected),
        );
      }
    } finally {
      await prisma.jobOffer.delete({ where: { id: offer.id } });
    }
  });

  it('creates, reads, updates, and removes an owned company and job offer', async () => {
    if (!app || !prisma || !userA) {
      throw new Error('Integration fixtures are unavailable');
    }

    const createdCompanyResponse = await request(app.getHttpServer())
      .post('/companies')
      .set('Cookie', userA.cookie)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .send({
        name: `Happy Path Company ${marker}`,
        website: 'https://example.com',
        city: 'Lille',
      })
      .expect(201);

    const createdCompany = createdCompanyResponse.body as Record<
      string,
      unknown
    >;
    const companyId = createdCompany.id;

    expect(typeof companyId).toBe('number');
    expect(createdCompany).toMatchObject({
      name: `Happy Path Company ${marker}`,
      website: 'https://example.com',
      city: 'Lille',
      userId: userA.userId,
    });

    const persistedCompany = await prisma.company.findUnique({
      where: { id: companyId as number },
    });

    expect(persistedCompany).toMatchObject({
      id: companyId,
      name: `Happy Path Company ${marker}`,
      website: 'https://example.com',
      city: 'Lille',
      userId: userA.userId,
    });

    await request(app.getHttpServer())
      .get(`/companies/${String(companyId)}`)
      .set('Cookie', userA.cookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: companyId,
          name: `Happy Path Company ${marker}`,
          city: 'Lille',
        });
      });

    await request(app.getHttpServer())
      .patch(`/companies/${String(companyId)}`)
      .set('Cookie', userA.cookie)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .send({
        name: `Updated Happy Path Company ${marker}`,
        city: 'Roubaix',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: companyId,
          name: `Updated Happy Path Company ${marker}`,
          city: 'Roubaix',
        });
      });

    const createdJobOfferResponse = await request(app.getHttpServer())
      .post('/job-offers')
      .set('Cookie', userA.cookie)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .send({
        title: `Happy Path Offer ${marker}`,
        companyId,
        url: 'https://example.com/jobs/1',
        description: 'Integration happy path',
        location: 'Lille',
        contractType: 'CDI',
        salary: '45k',
        publishedAt: '2026-08-16T10:00:00.000Z',
      })
      .expect(201);

    const createdJobOffer = createdJobOfferResponse.body as Record<
      string,
      unknown
    >;
    const jobOfferId = createdJobOffer.id;

    expect(typeof jobOfferId).toBe('number');
    expect(createdJobOffer).toMatchObject({
      title: `Happy Path Offer ${marker}`,
      companyId,
      location: 'Lille',
      contractType: 'CDI',
      salary: '45k',
    });

    const persistedJobOffer = await prisma.jobOffer.findUnique({
      where: { id: jobOfferId as number },
    });

    expect(persistedJobOffer).toMatchObject({
      id: jobOfferId,
      title: `Happy Path Offer ${marker}`,
      companyId,
      location: 'Lille',
      contractType: 'CDI',
      salary: '45k',
    });

    await request(app.getHttpServer())
      .get(`/job-offers/${String(jobOfferId)}`)
      .set('Cookie', userA.cookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: jobOfferId,
          title: `Happy Path Offer ${marker}`,
          companyId,
        });
      });

    await request(app.getHttpServer())
      .patch(`/job-offers/${String(jobOfferId)}`)
      .set('Cookie', userA.cookie)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .send({
        title: `Updated Happy Path Offer ${marker}`,
        location: 'Tourcoing',
        contractType: 'CDD',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: jobOfferId,
          title: `Updated Happy Path Offer ${marker}`,
          location: 'Tourcoing',
          contractType: 'CDD',
        });
      });

    await request(app.getHttpServer())
      .delete(`/job-offers/${String(jobOfferId)}`)
      .set('Cookie', userA.cookie)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .expect(200);

    await expect(
      prisma.jobOffer.findUnique({
        where: { id: jobOfferId as number },
      }),
    ).resolves.toBeNull();

    await request(app.getHttpServer())
      .delete(`/companies/${String(companyId)}`)
      .set('Cookie', userA.cookie)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .expect(200);

    await expect(
      prisma.company.findUnique({
        where: { id: companyId as number },
      }),
    ).resolves.toBeNull();
  });

  it('isolates company lists and returns the same 404 for foreign and missing companies without side effects', async () => {
    if (!app || !prisma || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const foreignCompanyBefore = await prisma.company.findUniqueOrThrow({
      where: { id: userB.companyId },
      select: { city: true },
    });

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

    await expect(
      prisma.company.findUnique({
        where: { id: userB.companyId },
        select: { city: true },
      }),
    ).resolves.toEqual(foreignCompanyBefore);
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

  it('isolates job offers and rejects foreign company associations without side effects', async () => {
    if (!app || !prisma || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const ownerOfferBefore = await prisma.jobOffer.findUniqueOrThrow({
      where: { id: userA.jobOfferId },
      select: { companyId: true },
    });
    const foreignOfferBefore = await prisma.jobOffer.findUniqueOrThrow({
      where: { id: userB.jobOfferId },
      select: { id: true, companyId: true },
    });

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

    await expect(
      prisma.jobOffer.findUnique({
        where: { id: userA.jobOfferId },
        select: { companyId: true },
      }),
    ).resolves.toEqual(ownerOfferBefore);
    await expect(
      prisma.jobOffer.findUnique({
        where: { id: userB.jobOfferId },
        select: { id: true, companyId: true },
      }),
    ).resolves.toEqual(foreignOfferBefore);
  });

  it('paginates and filters job offers without exposing another user', async () => {
    if (!app || !prisma || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const prismaClient = prisma;
    const companyId = userA.companyId;
    const additionalOffers = await Promise.all(
      ['Frontend', 'Backend', 'Fullstack'].map((title) =>
        prismaClient.jobOffer.create({
          data: {
            title: `${title} ${marker}`,
            companyId,
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
