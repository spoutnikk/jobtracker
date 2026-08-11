import {
  DEFAULT_FRONTEND_ORIGIN,
  getCorsConfiguration,
} from './http-configuration';

describe('HTTP configuration', () => {
  it('enables credentialed CORS for the exact configured origin', () => {
    expect(
      getCorsConfiguration({ FRONTEND_ORIGIN: 'https://app.example.com' }),
    ).toEqual({
      origin: 'https://app.example.com',
      credentials: true,
    });
  });

  it('uses the documented development origin without a wildcard', () => {
    expect(getCorsConfiguration({})).toEqual({
      origin: DEFAULT_FRONTEND_ORIGIN,
      credentials: true,
    });
    expect(DEFAULT_FRONTEND_ORIGIN).not.toBe('*');
  });
});
