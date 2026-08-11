import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
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

function readSetCookie(headers: unknown): string {
  if (typeof headers !== 'object' || headers === null) {
    throw new Error('Login did not return headers');
  }

  const value = (headers as Record<string, unknown>)['set-cookie'];

  if (!Array.isArray(value) || typeof value[0] !== 'string') {
    throw new Error('Login did not return a session cookie');
  }

  return value[0].split(';')[0];
}

describe('Origin protection HTTP integration', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;
  let userId: number | undefined;
  let cookie: string | undefined;
  let temporaryDirectory: string | undefined;
  let uploadFixturePath: string | undefined;
  const marker = randomUUID();
  const email = `origin-${marker}@jobtracker.test`;
  const password = 'integration-password';

  beforeAll(async () => {
    delete process.env.FRONTEND_ORIGIN;
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'jobtracker-origin-'));
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
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Origin',
        lastName: 'Protection',
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
      select: { id: true },
    });
    userId = user.id;
    const rawToken = randomBytes(32).toString('base64url');

    await prisma.session.create({
      data: {
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() + 3_600_000),
        userId,
      },
    });
    cookie = `jobtracker_session=${rawToken}`;
  });

  afterAll(async () => {
    if (prisma && userId !== undefined) {
      await prisma.company.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }

    if (app) {
      await app.close();
    }

    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('allows safe methods and valid-origin login and logout', async () => {
    if (!app) {
      throw new Error('Integration application is unavailable');
    }

    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .expect(204);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .send({ email, password })
      .expect(200);
    const loginCookie = readSetCookie(loginResponse.headers);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', loginCookie)
      .expect(204);
  });

  it.each([
    ['without Origin', undefined],
    ['with a foreign Origin', 'https://evil.example.com'],
    ['with a null Origin', 'null'],
    ['with a lookalike Origin', 'http://localhost:5173.evil.test'],
  ])('rejects login %s', async (_description, origin) => {
    if (!app) {
      throw new Error('Integration application is unavailable');
    }

    const loginRequest = request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });

    if (origin !== undefined) {
      loginRequest.set('Origin', origin);
    }

    await loginRequest.expect(403);
  });

  it('allows an authenticated business mutation only with the exact Origin', async () => {
    if (!app || !prisma || !cookie || userId === undefined) {
      throw new Error('Integration fixtures are unavailable');
    }

    const companyCount = await prisma.company.count({ where: { userId } });

    await request(app.getHttpServer())
      .post('/companies')
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', cookie)
      .send({ name: `Allowed ${marker}` })
      .expect(201);
    await expect(prisma.company.count({ where: { userId } })).resolves.toBe(
      companyCount + 1,
    );

    for (const origin of [
      undefined,
      'https://evil.example.com',
      'null',
      'http://localhost:5173.evil.test',
    ]) {
      const mutation = request(app.getHttpServer())
        .post('/companies')
        .set('Cookie', cookie)
        .send({ name: `Rejected ${origin ?? 'absent'} ${marker}` });

      if (origin !== undefined) {
        mutation.set('Origin', origin);
      }

      await mutation.expect(403);
    }

    await expect(prisma.company.count({ where: { userId } })).resolves.toBe(
      companyCount + 1,
    );
  });

  it('rejects a bad-origin upload before database and filesystem side effects', async () => {
    if (!app || !prisma || !uploadFixturePath) {
      throw new Error('Integration fixtures are unavailable');
    }

    const documentCount = await prisma.document.count();
    const eventCount = await prisma.applicationEvent.count();
    const uploadsBefore = await readUploadNames();

    await request(app.getHttpServer())
      .post('/documents')
      .set('Origin', 'https://evil.example.com')
      .field('name', 'Rejected upload')
      .field('type', 'OTHER')
      .attach('file', uploadFixturePath)
      .expect(403);

    await expect(prisma.document.count()).resolves.toBe(documentCount);
    await expect(prisma.applicationEvent.count()).resolves.toBe(eventCount);
    await expect(readUploadNames()).resolves.toEqual(uploadsBefore);
  });
});
