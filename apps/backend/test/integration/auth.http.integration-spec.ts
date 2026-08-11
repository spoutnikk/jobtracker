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

const databaseName = databaseUrl.pathname.slice(1);

if (databaseName !== 'jobtracker_test') {
  throw new Error(
    `Integration tests require the jobtracker_test database, received: ${databaseName || '<empty>'}`,
  );
}

function readSetCookieHeaders(headers: unknown): string[] {
  if (typeof headers !== 'object' || headers === null) {
    return [];
  }

  const value = (headers as Record<string, unknown>)['set-cookie'];

  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : [];
}

describe('Authentication HTTP integration', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;
  let userId: number | undefined;
  const password = 'integration-password';
  const email = `auth-${randomUUID()}@jobtracker.test`;

  beforeAll(async () => {
    process.env.AUTH_SESSION_TTL_SECONDS = '3600';

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
        firstName: 'Integration',
        lastName: 'Auth',
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
      select: { id: true },
    });
    userId = user.id;
  });

  afterAll(async () => {
    const prismaClient = prisma;

    if (prismaClient && userId !== undefined) {
      await prismaClient.user.deleteMany({ where: { id: userId } });
    }

    if (app) {
      await app.close();
    }

    delete process.env.AUTH_SESSION_TTL_SECONDS;
  });

  it('authenticates, exposes me, revokes the session and rejects the old cookie', async () => {
    if (!app || !prisma || userId === undefined) {
      throw new Error('Authentication integration fixtures are unavailable');
    }

    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/companies').expect(401);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .send({ email: email.toUpperCase(), password })
      .expect(200);
    const setCookieHeader = readSetCookieHeaders(loginResponse.headers);

    if (!Array.isArray(setCookieHeader) || !setCookieHeader[0]) {
      throw new Error('Login did not return a session cookie');
    }

    const sessionCookie = setCookieHeader[0].split(';')[0];
    expect(setCookieHeader[0]).toContain('HttpOnly');
    expect(setCookieHeader[0]).toContain('SameSite=Lax');
    expect(loginResponse.body).toEqual({
      id: userId,
      email,
      firstName: 'Integration',
      lastName: 'Auth',
    });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', sessionCookie)
      .expect(200)
      .expect({
        id: userId,
        email,
        firstName: 'Integration',
        lastName: 'Auth',
      });

    const logoutResponse = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', DEFAULT_FRONTEND_ORIGIN)
      .set('Cookie', sessionCookie)
      .expect(204);

    expect(readSetCookieHeaders(logoutResponse.headers)[0]).toContain(
      'jobtracker_session=',
    );
    await expect(prisma.session.count({ where: { userId } })).resolves.toBe(0);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', sessionCookie)
      .expect(401);
  });

  it('rejects and removes an expired session', async () => {
    if (!app || !prisma || userId === undefined) {
      throw new Error('Authentication integration fixtures are unavailable');
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await prisma.session.create({
      data: {
        tokenHash,
        expiresAt: new Date(Date.now() - 60_000),
        userId,
      },
    });

    await request(app.getHttpServer())
      .get('/companies')
      .set('Cookie', `jobtracker_session=${rawToken}`)
      .expect(401);

    await expect(prisma.session.count({ where: { tokenHash } })).resolves.toBe(
      0,
    );
  });
});
