import {
  DEFAULT_AUTH_SESSION_TTL_SECONDS,
  getAuthSessionClearCookieOptions,
  getAuthSessionCookieOptions,
  readAuthSessionTtlSeconds,
} from './auth-cookie';

describe('authentication cookie configuration', () => {
  it('uses the documented seven-day TTL by default', () => {
    expect(readAuthSessionTtlSeconds({})).toBe(
      DEFAULT_AUTH_SESSION_TTL_SECONDS,
    );
  });

  it('rejects an invalid configured TTL', () => {
    expect(() =>
      readAuthSessionTtlSeconds({ AUTH_SESSION_TTL_SECONDS: '0' }),
    ).toThrow('AUTH_SESSION_TTL_SECONDS must be a positive integer');
  });

  it('creates a secure production cookie with the configured TTL', () => {
    expect(getAuthSessionCookieOptions(3600, 'production')).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 3_600_000,
    });
  });

  it('uses the same structural attributes when clearing the cookie', () => {
    expect(getAuthSessionClearCookieOptions('production')).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
  });
});
