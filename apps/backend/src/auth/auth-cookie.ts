import type { CookieOptions, Request } from 'express';

export const AUTH_SESSION_COOKIE_NAME = 'jobtracker_session';
export const DEFAULT_AUTH_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function readAuthSessionTtlSeconds(
  environment: NodeJS.ProcessEnv,
): number {
  const rawValue = environment.AUTH_SESSION_TTL_SECONDS;

  if (rawValue === undefined) {
    return DEFAULT_AUTH_SESSION_TTL_SECONDS;
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('AUTH_SESSION_TTL_SECONDS must be a positive integer');
  }

  return value;
}

export function getAuthSessionCookieOptions(
  ttlSeconds: number,
  nodeEnvironment: string | undefined,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: nodeEnvironment === 'production',
    path: '/',
    maxAge: ttlSeconds * 1000,
  };
}

export function getAuthSessionClearCookieOptions(
  nodeEnvironment: string | undefined,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: nodeEnvironment === 'production',
    path: '/',
  };
}

export function getAuthSessionToken(request: Request): string | undefined {
  const cookies: unknown = request.cookies;

  if (typeof cookies !== 'object' || cookies === null) {
    return undefined;
  }

  const token = (cookies as Record<string, unknown>)[AUTH_SESSION_COOKIE_NAME];

  return typeof token === 'string' && token !== '' ? token : undefined;
}
