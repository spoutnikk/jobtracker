import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AUTH_SESSION_COOKIE_NAME } from './auth-cookie';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  const authServiceMock = {
    sessionTtlSeconds: 3600,
    register: jest.fn(),
    login: jest.fn(),
    updateProfile: jest.fn(),
    changePassword: jest.fn(),
    deleteAccount: jest.fn(),
    logout: jest.fn(),
    revokeOtherSessions: jest.fn(),
  };
  const user = {
    id: 7,
    email: 'user@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authServiceMock }],
    }).compile();

    controller = module.get(AuthController);
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  it('sets the session cookie and returns the public user after registration', async () => {
    authServiceMock.register.mockResolvedValue({
      user,
      token: 'registration-token',
    });
    const responseMock = { cookie: jest.fn() };
    const response = responseMock as unknown as Response;
    const dto = {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: user.email,
      password: 'correct-password',
    };

    await expect(controller.register(dto, response)).resolves.toEqual(user);

    expect(authServiceMock.register).toHaveBeenCalledWith(dto);
    expect(responseMock.cookie).toHaveBeenCalledWith(
      AUTH_SESSION_COOKIE_NAME,
      'registration-token',
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
        maxAge: 3_600_000,
      },
    );
  });

  it('sets the session cookie and returns the public user after login', async () => {
    authServiceMock.login.mockResolvedValue({ user, token: 'opaque-token' });
    const responseMock = { cookie: jest.fn() };
    const response = responseMock as unknown as Response;
    const dto = { email: user.email, password: 'password' };

    await expect(controller.login(dto, response)).resolves.toEqual(user);

    expect(authServiceMock.login).toHaveBeenCalledWith(dto);
    expect(responseMock.cookie).toHaveBeenCalledWith(
      AUTH_SESSION_COOKIE_NAME,
      'opaque-token',
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
        maxAge: 3_600_000,
      },
    );
  });

  it('revokes the session and clears the cookie on logout', async () => {
    authServiceMock.logout.mockResolvedValue(undefined);
    const request = {
      cookies: { [AUTH_SESSION_COOKIE_NAME]: 'opaque-token' },
    } as Request;
    const responseMock = { clearCookie: jest.fn() };
    const response = responseMock as unknown as Response;

    await expect(controller.logout(request, response)).resolves.toBeUndefined();

    expect(authServiceMock.logout).toHaveBeenCalledWith('opaque-token');
    expect(responseMock.clearCookie).toHaveBeenCalledWith(
      AUTH_SESSION_COOKIE_NAME,
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
      },
    );
  });

  it('deletes the authenticated account and clears the session cookie', async () => {
    authServiceMock.deleteAccount.mockResolvedValue(undefined);
    const responseMock = { clearCookie: jest.fn() };
    const response = responseMock as unknown as Response;
    const dto = {
      password: 'current-password',
    };

    await expect(
      controller.deleteAccount(user, dto, response),
    ).resolves.toBeUndefined();

    expect(authServiceMock.deleteAccount).toHaveBeenCalledWith(user.id, dto);
    expect(responseMock.clearCookie).toHaveBeenCalledWith(
      AUTH_SESSION_COOKIE_NAME,
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
      },
    );
  });

  it('does not clear the cookie when account deletion fails', async () => {
    authServiceMock.deleteAccount.mockRejectedValue(
      new UnauthorizedException('Mot de passe actuel incorrect'),
    );
    const responseMock = { clearCookie: jest.fn() };
    const response = responseMock as unknown as Response;
    const dto = {
      password: 'wrong-password',
    };

    await expect(
      controller.deleteAccount(user, dto, response),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(responseMock.clearCookie).not.toHaveBeenCalled();
  });

  it('revokes every other session while preserving the current session', async () => {
    authServiceMock.revokeOtherSessions.mockResolvedValue(undefined);
    const request = {
      cookies: { [AUTH_SESSION_COOKIE_NAME]: 'current-session-token' },
    } as Request;

    await expect(
      controller.revokeOtherSessions(user, request),
    ).resolves.toBeUndefined();

    expect(authServiceMock.revokeOtherSessions).toHaveBeenCalledWith(
      user.id,
      'current-session-token',
    );
  });

  it('rejects other-session revocation without the current session cookie', async () => {
    const request = { cookies: {} } as Request;

    await expect(
      controller.revokeOtherSessions(user, request),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authServiceMock.revokeOtherSessions).not.toHaveBeenCalled();
  });

  it('changes the password for the authenticated user and preserves the current session', async () => {
    authServiceMock.changePassword.mockResolvedValue(undefined);
    const request = {
      cookies: { [AUTH_SESSION_COOKIE_NAME]: 'current-session-token' },
    } as Request;
    const dto = {
      currentPassword: 'current-password',
      newPassword: 'new-secure-password',
    };

    await expect(
      controller.changePassword(user, request, dto),
    ).resolves.toBeUndefined();

    expect(authServiceMock.changePassword).toHaveBeenCalledWith(
      user.id,
      'current-session-token',
      dto,
    );
  });

  it('rejects a password change without the current session cookie', async () => {
    const request = { cookies: {} } as Request;
    const dto = {
      currentPassword: 'current-password',
      newPassword: 'new-secure-password',
    };

    await expect(
      controller.changePassword(user, request, dto),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authServiceMock.changePassword).not.toHaveBeenCalled();
  });

  it('updates the authenticated profile through the service', async () => {
    const updatedUser = {
      ...user,
      firstName: 'Grace',
    };
    const dto = {
      firstName: 'Grace',
      lastName: 'Lovelace',
      email: user.email,
    };
    authServiceMock.updateProfile.mockResolvedValue(updatedUser);

    await expect(controller.updateProfile(user, dto)).resolves.toEqual(
      updatedUser,
    );

    expect(authServiceMock.updateProfile).toHaveBeenCalledWith(user.id, dto);
  });

  it('returns exactly the authenticated user from me', () => {
    expect(controller.me(user)).toEqual(user);
  });
});
