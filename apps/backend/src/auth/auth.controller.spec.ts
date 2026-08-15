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
    logout: jest.fn(),
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

  it('returns exactly the authenticated user from me', () => {
    expect(controller.me(user)).toEqual(user);
  });
});
