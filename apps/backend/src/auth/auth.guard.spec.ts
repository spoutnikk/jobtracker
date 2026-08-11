import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_SESSION_COOKIE_NAME } from './auth-cookie';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './current-user.decorator';

describe('AuthGuard', () => {
  const reflectorMock = {
    getAllAndOverride: jest.fn(),
  };
  const authServiceMock = {
    authenticateSessionToken: jest.fn(),
  };

  function createContext(token?: string) {
    const request = {
      headers: {},
      cookies: token === undefined ? {} : { [AUTH_SESSION_COOKIE_NAME]: token },
    } as AuthenticatedRequest;
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    return { context, request };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows a public route without looking up a session', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const guard = new AuthGuard(
      reflectorMock as unknown as Reflector,
      authServiceMock as unknown as AuthService,
    );

    await expect(guard.canActivate(createContext().context)).resolves.toBe(
      true,
    );
    expect(authServiceMock.authenticateSessionToken).not.toHaveBeenCalled();
  });

  it('rejects a request without a session cookie', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    const guard = new AuthGuard(
      reflectorMock as unknown as Reflector,
      authServiceMock as unknown as AuthService,
    );

    await expect(
      guard.canActivate(createContext().context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown session', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    authServiceMock.authenticateSessionToken.mockResolvedValue(null);
    const guard = new AuthGuard(
      reflectorMock as unknown as Reflector,
      authServiceMock as unknown as AuthService,
    );
    const { context } = createContext('unknown');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired session', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    authServiceMock.authenticateSessionToken.mockResolvedValue(null);
    const guard = new AuthGuard(
      reflectorMock as unknown as Reflector,
      authServiceMock as unknown as AuthService,
    );
    const { context } = createContext('expired');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the authenticated user for a valid session', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    const user = {
      id: 7,
      email: 'user@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    };
    authServiceMock.authenticateSessionToken.mockResolvedValue(user);
    const guard = new AuthGuard(
      reflectorMock as unknown as Reflector,
      authServiceMock as unknown as AuthService,
    );
    const { context, request } = createContext('opaque token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authServiceMock.authenticateSessionToken).toHaveBeenCalledWith(
      'opaque token',
    );
    expect(request.user).toEqual(user);
  });
});
