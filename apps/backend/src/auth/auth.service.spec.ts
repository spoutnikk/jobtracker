import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { createHash } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, DUMMY_PASSWORD_HASH } from './auth.service';

jest.mock('fs/promises', () => ({
  unlink: jest.fn(),
}));

jest.mock('argon2', () => ({
  __esModule: true,
  default: {
    verify: jest.fn(),
    hash: jest.fn(),
  },
}));

describe('AuthService', () => {
  let service: AuthService;

  const prismaServiceMock = {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    document: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    application: {
      deleteMany: jest.fn(),
    },
    jobOffer: {
      deleteMany: jest.fn(),
    },
    company: {
      deleteMany: jest.fn(),
    },
    session: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const verifyPassword = jest.mocked(argon2.verify);
  const hashPassword = jest.mocked(argon2.hash);
  const publicUser = {
    id: 7,
    email: 'user@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(unlink).mockResolvedValue(undefined);
    process.env.AUTH_SESSION_TTL_SECONDS = '3600';
    prismaServiceMock.$transaction.mockImplementation(
      (callback: (transaction: typeof prismaServiceMock) => Promise<unknown>) =>
        callback(prismaServiceMock),
    );

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

  it('creates a user and a server session atomically on registration', async () => {
    const now = new Date('2026-08-11T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    hashPassword.mockResolvedValue('new-password-hash');
    prismaServiceMock.user.create.mockResolvedValue(publicUser);
    prismaServiceMock.session.create.mockResolvedValue({ id: 'session-id' });

    const result = await service.register({
      firstName: '  Ada ',
      lastName: ' Lovelace  ',
      email: '  USER@Example.com ',
      password: 'correct-password',
    });

    expect(hashPassword).toHaveBeenCalledWith('correct-password');
    expect(prismaServiceMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaServiceMock.user.create).toHaveBeenCalledWith({
      data: {
        email: 'user@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        passwordHash: 'new-password-hash',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
    expect(result.user).toEqual(publicUser);
    expect(result.token).toEqual(expect.any(String));
    expect(prismaServiceMock.session.create).toHaveBeenCalledWith({
      data: {
        tokenHash: createHash('sha256').update(result.token).digest('hex'),
        expiresAt: new Date('2026-08-11T13:00:00.000Z'),
        userId: publicUser.id,
      },
    });
  });

  it('returns a stable conflict when the normalized email already exists', async () => {
    hashPassword.mockResolvedValue('new-password-hash');
    prismaServiceMock.$transaction.mockRejectedValue({ code: 'P2002' });

    const error: unknown = await service
      .register({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: '  USER@Example.com ',
        password: 'correct-password',
      })
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(
      'Un compte existe déjà avec cette adresse email',
    );
  });

  it('propagates an unexpected registration failure', async () => {
    const registrationError = new Error('Database unavailable');
    hashPassword.mockResolvedValue('new-password-hash');
    prismaServiceMock.$transaction.mockRejectedValue(registrationError);

    await expect(
      service.register({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'user@example.com',
        password: 'correct-password',
      }),
    ).rejects.toBe(registrationError);
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

  it('changes the password and revokes every other session', async () => {
    prismaServiceMock.user.findUnique.mockResolvedValue({
      passwordHash: 'current-password-hash',
    });
    verifyPassword.mockResolvedValue(true);
    hashPassword.mockResolvedValue('new-password-hash');
    prismaServiceMock.user.update.mockResolvedValue(publicUser);
    prismaServiceMock.session.deleteMany.mockResolvedValue({ count: 2 });

    await expect(
      service.changePassword(7, 'current-session-token', {
        currentPassword: 'current-password',
        newPassword: 'new-secure-password',
      }),
    ).resolves.toBeUndefined();

    expect(verifyPassword).toHaveBeenCalledWith(
      'current-password-hash',
      'current-password',
    );
    expect(hashPassword).toHaveBeenCalledWith('new-secure-password');
    expect(prismaServiceMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaServiceMock.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        passwordHash: 'new-password-hash',
      },
    });
    expect(prismaServiceMock.session.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
        tokenHash: {
          not: createHash('sha256')
            .update('current-session-token')
            .digest('hex'),
        },
      },
    });
  });

  it('rejects a password change when the current password is invalid', async () => {
    prismaServiceMock.user.findUnique.mockResolvedValue({
      passwordHash: 'current-password-hash',
    });
    verifyPassword.mockResolvedValue(false);

    const error: unknown = await service
      .changePassword(7, 'current-session-token', {
        currentPassword: 'wrong-password',
        newPassword: 'new-secure-password',
      })
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe(
      'Mot de passe actuel incorrect',
    );
    expect(hashPassword).not.toHaveBeenCalled();
    expect(prismaServiceMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a password change when the user no longer exists', async () => {
    prismaServiceMock.user.findUnique.mockResolvedValue(null);

    await expect(
      service.changePassword(7, 'current-session-token', {
        currentPassword: 'current-password',
        newPassword: 'new-secure-password',
      }),
    ).rejects.toThrow('Mot de passe actuel incorrect');

    expect(verifyPassword).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('updates only the authenticated user profile and returns public fields', async () => {
    const updatedUser = {
      ...publicUser,
      email: 'ada@example.com',
    };
    prismaServiceMock.user.update.mockResolvedValue(updatedUser);

    await expect(
      service.updateProfile(publicUser.id, {
        firstName: '  Ada ',
        lastName: ' Lovelace  ',
        email: ' ADA@Example.com ',
      }),
    ).resolves.toEqual(updatedUser);

    expect(prismaServiceMock.user.update).toHaveBeenCalledWith({
      where: { id: publicUser.id },
      data: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
  });

  it('supports a partial profile update', async () => {
    prismaServiceMock.user.update.mockResolvedValue({
      ...publicUser,
      firstName: 'Grace',
    });

    await service.updateProfile(publicUser.id, {
      firstName: ' Grace ',
    });

    expect(prismaServiceMock.user.update).toHaveBeenCalledWith({
      where: { id: publicUser.id },
      data: {
        firstName: 'Grace',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
  });

  it('returns a stable conflict when a profile email already exists', async () => {
    prismaServiceMock.user.update.mockRejectedValue({ code: 'P2002' });

    const error: unknown = await service
      .updateProfile(publicUser.id, {
        email: ' existing@example.com ',
      })
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(
      'Un compte existe déjà avec cette adresse email',
    );
  });

  it('propagates an unexpected profile update failure', async () => {
    const updateError = new Error('Database unavailable');
    prismaServiceMock.user.update.mockRejectedValue(updateError);

    await expect(
      service.updateProfile(publicUser.id, {
        firstName: 'Grace',
      }),
    ).rejects.toBe(updateError);
  });

  it('deletes the authenticated account data transactionally and then removes files', async () => {
    prismaServiceMock.user.findUnique.mockResolvedValue({
      passwordHash: 'current-password-hash',
    });
    verifyPassword.mockResolvedValue(true);
    prismaServiceMock.document.findMany.mockResolvedValue([
      { path: 'uploads/cv.pdf' },
      { path: 'uploads/cover-letter.pdf' },
    ]);
    prismaServiceMock.document.deleteMany.mockResolvedValue({ count: 2 });
    prismaServiceMock.application.deleteMany.mockResolvedValue({ count: 3 });
    prismaServiceMock.jobOffer.deleteMany.mockResolvedValue({ count: 2 });
    prismaServiceMock.company.deleteMany.mockResolvedValue({ count: 1 });
    prismaServiceMock.user.delete.mockResolvedValue(publicUser);

    await expect(
      service.deleteAccount(7, {
        password: 'current-password',
      }),
    ).resolves.toBeUndefined();

    expect(verifyPassword).toHaveBeenCalledWith(
      'current-password-hash',
      'current-password',
    );
    expect(prismaServiceMock.document.findMany).toHaveBeenCalledWith({
      where: { userId: 7 },
      select: { path: true },
    });
    expect(prismaServiceMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaServiceMock.document.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7 },
    });
    expect(prismaServiceMock.application.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7 },
    });
    expect(prismaServiceMock.jobOffer.deleteMany).toHaveBeenCalledWith({
      where: {
        company: {
          userId: 7,
        },
      },
    });
    expect(prismaServiceMock.company.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7 },
    });
    expect(prismaServiceMock.user.delete).toHaveBeenCalledWith({
      where: { id: 7 },
    });
    expect(unlink).toHaveBeenCalledTimes(2);
    expect(unlink).toHaveBeenCalledWith('uploads/cv.pdf');
    expect(unlink).toHaveBeenCalledWith('uploads/cover-letter.pdf');
  });

  it('rejects account deletion when the current password is invalid', async () => {
    prismaServiceMock.user.findUnique.mockResolvedValue({
      passwordHash: 'current-password-hash',
    });
    verifyPassword.mockResolvedValue(false);

    const error: unknown = await service
      .deleteAccount(7, {
        password: 'wrong-password',
      })
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe(
      'Mot de passe actuel incorrect',
    );
    expect(prismaServiceMock.document.findMany).not.toHaveBeenCalled();
    expect(prismaServiceMock.$transaction).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
  });

  it('keeps physical files when the database transaction fails', async () => {
    const databaseError = new Error('Database deletion failed');
    prismaServiceMock.user.findUnique.mockResolvedValue({
      passwordHash: 'current-password-hash',
    });
    verifyPassword.mockResolvedValue(true);
    prismaServiceMock.document.findMany.mockResolvedValue([
      { path: 'uploads/cv.pdf' },
    ]);
    prismaServiceMock.$transaction.mockRejectedValue(databaseError);

    await expect(
      service.deleteAccount(7, {
        password: 'current-password',
      }),
    ).rejects.toBe(databaseError);

    expect(unlink).not.toHaveBeenCalled();
  });

  it('does not fail account deletion when physical cleanup fails', async () => {
    prismaServiceMock.user.findUnique.mockResolvedValue({
      passwordHash: 'current-password-hash',
    });
    verifyPassword.mockResolvedValue(true);
    prismaServiceMock.document.findMany.mockResolvedValue([
      { path: 'uploads/cv.pdf' },
    ]);
    prismaServiceMock.user.delete.mockResolvedValue(publicUser);
    jest.mocked(unlink).mockRejectedValue(new Error('File cleanup failed'));

    await expect(
      service.deleteAccount(7, {
        password: 'current-password',
      }),
    ).resolves.toBeUndefined();

    expect(unlink).toHaveBeenCalledWith('uploads/cv.pdf');
  });

  it('revokes every other session while preserving the current session', async () => {
    prismaServiceMock.session.deleteMany.mockResolvedValue({ count: 2 });

    await expect(
      service.revokeOtherSessions(7, 'current-session-token'),
    ).resolves.toBeUndefined();

    expect(prismaServiceMock.session.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
        tokenHash: {
          not: createHash('sha256')
            .update('current-session-token')
            .digest('hex'),
        },
      },
    });
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
    expect(prismaServiceMock.session.deleteMany).not.toHaveBeenCalled();
  });

  it('returns null for an unknown session', async () => {
    prismaServiceMock.session.findUnique.mockResolvedValue(null);

    await expect(
      service.authenticateSessionToken('unknown'),
    ).resolves.toBeNull();
    expect(prismaServiceMock.session.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes an expired session idempotently and returns null', async () => {
    const now = new Date('2026-08-11T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    prismaServiceMock.session.findUnique.mockResolvedValue({
      expiresAt: new Date('2026-08-11T11:59:59.999Z'),
      user: publicUser,
    });
    prismaServiceMock.session.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      service.authenticateSessionToken('expired'),
    ).resolves.toBeNull();
    expect(prismaServiceMock.session.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaServiceMock.session.deleteMany).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update('expired').digest('hex'),
        expiresAt: {
          lte: now,
        },
      },
    });
  });

  it('returns null when an expired session was deleted concurrently', async () => {
    prismaServiceMock.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 1),
      user: publicUser,
    });
    prismaServiceMock.session.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.authenticateSessionToken('expired'),
    ).resolves.toBeNull();
  });

  it('returns null when cleanup of an expired session fails', async () => {
    prismaServiceMock.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 1),
      user: publicUser,
    });
    prismaServiceMock.session.deleteMany.mockRejectedValue(
      new Error('Database unavailable'),
    );

    await expect(
      service.authenticateSessionToken('expired'),
    ).resolves.toBeNull();
  });
});
