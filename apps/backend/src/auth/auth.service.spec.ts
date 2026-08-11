import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, DUMMY_PASSWORD_HASH } from './auth.service';

jest.mock('argon2', () => ({
  __esModule: true,
  default: {
    verify: jest.fn(),
  },
}));

describe('AuthService', () => {
  let service: AuthService;

  const prismaServiceMock = {
    user: {
      findUnique: jest.fn(),
    },
    session: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const verifyPassword = jest.mocked(argon2.verify);
  const publicUser = {
    id: 7,
    email: 'user@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.AUTH_SESSION_TTL_SECONDS = '3600';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaServiceMock },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.AUTH_SESSION_TTL_SECONDS;
  });

  it('creates a server session and returns a public user for valid credentials', async () => {
    const now = new Date('2026-08-11T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    prismaServiceMock.user.findUnique.mockResolvedValue({
      ...publicUser,
      passwordHash: 'argon2id-hash',
    });
    verifyPassword.mockResolvedValue(true);
    prismaServiceMock.session.create.mockResolvedValue({ id: 'session-id' });

    const result = await service.login({
      email: '  USER@Example.com ',
      password: 'correct password',
    });

    expect(prismaServiceMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        passwordHash: true,
      },
    });
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(verifyPassword).toHaveBeenCalledWith(
      'argon2id-hash',
      'correct password',
    );
    expect(result.user).toEqual(publicUser);
    expect(result.token).toEqual(expect.any(String));
    expect(prismaServiceMock.session.create).toHaveBeenCalledWith({
      data: {
        tokenHash: createHash('sha256').update(result.token).digest('hex'),
        expiresAt: new Date('2026-08-11T13:00:00.000Z'),
        userId: 7,
      },
    });

    expect(createHash('sha256').update(result.token).digest('hex')).not.toBe(
      result.token,
    );
  });

  it('uses the same UnauthorizedException for an unknown email', async () => {
    prismaServiceMock.user.findUnique.mockResolvedValue(null);

    const error: unknown = await service
      .login({ email: 'missing@example.com', password: 'password' })
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe(
      'Email ou mot de passe incorrect',
    );
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(verifyPassword).toHaveBeenCalledWith(
      DUMMY_PASSWORD_HASH,
      'password',
    );
    expect(prismaServiceMock.session.create).not.toHaveBeenCalled();
  });

  it('uses the same UnauthorizedException for an invalid password', async () => {
    prismaServiceMock.user.findUnique.mockResolvedValue({
      ...publicUser,
      passwordHash: 'argon2id-hash',
    });
    verifyPassword.mockResolvedValue(false);

    const error: unknown = await service
      .login({ email: publicUser.email, password: 'invalid' })
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe(
      'Email ou mot de passe incorrect',
    );
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(verifyPassword).toHaveBeenCalledWith('argon2id-hash', 'invalid');
    expect(prismaServiceMock.session.create).not.toHaveBeenCalled();
  });

  it('deletes a session by the hash of its opaque token', async () => {
    prismaServiceMock.session.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.logout('opaque-token')).resolves.toBeUndefined();

    expect(prismaServiceMock.session.deleteMany).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update('opaque-token').digest('hex'),
      },
    });
  });

  it('hashes the opaque token and returns only the minimal user', async () => {
    const token = 'opaque-session-token';
    prismaServiceMock.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      user: publicUser,
    });

    await expect(service.authenticateSessionToken(token)).resolves.toEqual(
      publicUser,
    );
    expect(prismaServiceMock.session.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
      },
      select: {
        expiresAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  });

  it('returns null for an unknown session', async () => {
    prismaServiceMock.session.findUnique.mockResolvedValue(null);

    await expect(
      service.authenticateSessionToken('unknown'),
    ).resolves.toBeNull();
  });

  it('returns null for an expired session', async () => {
    prismaServiceMock.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 1),
      user: publicUser,
    });

    await expect(
      service.authenticateSessionToken('expired'),
    ).resolves.toBeNull();
  });
});
