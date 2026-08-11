import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  eventId: number;
  documentId: number;
  documentPath: string;
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

function readMessage(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  return (body as Record<string, unknown>).message;
}

async function readUploadNames(): Promise<string[]> {
  try {
    return (await readdir('uploads')).sort();
  } catch (error: unknown) {
    const fileSystemError = error as NodeJS.ErrnoException;

    if (fileSystemError.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

describe('ApplicationEvents and Documents HTTP ownership integration', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;
  let temporaryDirectory: string | undefined;
  let uploadFixturePath: string | undefined;
  let userA: UserFixtures | undefined;
  let userB: UserFixtures | undefined;
  const marker = randomUUID();

  async function createFixtures(label: string): Promise<UserFixtures> {
    if (!prisma || !temporaryDirectory) {
      throw new Error('Integration fixtures cannot be initialized');
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
        source: `events-documents:${label}:${marker}`,
      },
      select: { id: true },
    });
    const event = await prisma.applicationEvent.create({
      data: {
        applicationId: application.id,
        type: 'NOTE',
        title: `${label} Event ${marker}`,
      },
      select: { id: true },
    });
    const documentPath = join(temporaryDirectory, `${label}-document.txt`);
    await writeFile(documentPath, `${label} document`);
    const document = await prisma.document.create({
      data: {
        name: `${label} Document ${marker}`,
        originalName: `${label}-document.txt`,
        mimeType: 'text/plain',
        size: Buffer.byteLength(`${label} document`),
        path: documentPath,
        type: 'OTHER',
        applicationId: application.id,
        userId: user.id,
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
      eventId: event.id,
      documentId: document.id,
      documentPath,
      cookie: `jobtracker_session=${rawToken}`,
    };
  }

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'jobtracker-events-documents-'),
    );
    uploadFixturePath = join(temporaryDirectory, 'upload-fixture.txt');
    await writeFile(uploadFixturePath, 'upload fixture');

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

      await prismaClient.document.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prismaClient.applicationEvent.deleteMany({
        where: { application: { userId: { in: userIds } } },
      });
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

    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('isolates application events and rejects creation for a foreign application', async () => {
    if (!app || !prisma || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const events = await request(app.getHttpServer())
      .get(`/application-events/application/${userA.applicationId}`)
      .set('Cookie', userA.cookie)
      .expect(200);
    expect(readIds(events.body)).toEqual([userA.eventId]);

    const eventCount = await prisma.applicationEvent.count();
    const foreign = await request(app.getHttpServer())
      .get(`/application-events/application/${userB.applicationId}`)
      .set('Cookie', userA.cookie)
      .expect(404);
    const missing = await request(app.getHttpServer())
      .get('/application-events/application/2147483647')
      .set('Cookie', userA.cookie)
      .expect(404);

    expect(readMessage(foreign.body)).toBe(
      `Application with id ${userB.applicationId} not found`,
    );
    expect(readMessage(missing.body)).toBe(
      'Application with id 2147483647 not found',
    );

    await request(app.getHttpServer())
      .post('/application-events')
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .send({
        applicationId: userB.applicationId,
        type: 'NOTE',
        title: 'Forbidden event',
      })
      .expect(404);
    await expect(prisma.applicationEvent.count()).resolves.toBe(eventCount);
  });

  it('isolates document listing, metadata, download, and removal', async () => {
    if (!app || !prisma || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const documents = await request(app.getHttpServer())
      .get('/documents')
      .set('Cookie', userA.cookie)
      .expect(200);
    expect(readIds(documents.body)).toEqual([userA.documentId]);

    const applicationDocuments = await request(app.getHttpServer())
      .get(`/documents?applicationId=${userA.applicationId}`)
      .set('Cookie', userA.cookie)
      .expect(200);
    expect(readIds(applicationDocuments.body)).toEqual([userA.documentId]);

    const foreignApplicationDocuments = await request(app.getHttpServer())
      .get(`/documents?applicationId=${userB.applicationId}`)
      .set('Cookie', userA.cookie)
      .expect(200);
    expect(foreignApplicationDocuments.body).toEqual([]);

    await request(app.getHttpServer())
      .get('/documents?applicationId=0')
      .set('Cookie', userA.cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/documents?userId=${userB.userId}`)
      .set('Cookie', userA.cookie)
      .expect(400);

    const documentCount = await prisma.document.count();
    await request(app.getHttpServer())
      .get(`/documents/${userB.documentId}`)
      .set('Cookie', userA.cookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/documents/${userB.documentId}/download`)
      .set('Cookie', userA.cookie)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/documents/${userB.documentId}`)
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .expect(404);

    await expect(prisma.document.count()).resolves.toBe(documentCount);
    await expect(readFile(userB.documentPath, 'utf8')).resolves.toBe(
      'user-b document',
    );
  });

  it('rejects a document associated with a foreign application without database or file side effects', async () => {
    if (!app || !prisma || !uploadFixturePath || !userA || !userB) {
      throw new Error('Integration fixtures are unavailable');
    }

    const documentCount = await prisma.document.count();
    const eventCount = await prisma.applicationEvent.count();
    const uploadsBefore = await readUploadNames();

    await request(app.getHttpServer())
      .post('/documents')
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', userA.cookie)
      .field('name', 'Forbidden document')
      .field('type', 'OTHER')
      .field('applicationId', String(userB.applicationId))
      .attach('file', uploadFixturePath)
      .expect(404);

    await expect(prisma.document.count()).resolves.toBe(documentCount);
    await expect(prisma.applicationEvent.count()).resolves.toBe(eventCount);
    await expect(readUploadNames()).resolves.toEqual(uploadsBefore);
  });
});
