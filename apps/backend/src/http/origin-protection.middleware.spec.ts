import { ForbiddenException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { OriginProtectionMiddleware } from './origin-protection.middleware';

const allowedOrigin = 'http://localhost:5173';

function createRequest(method: string, origin?: string): Request {
  return {
    method,
    headers: origin === undefined ? {} : { origin },
  } as Request;
}

describe('OriginProtectionMiddleware', () => {
  let middleware: OriginProtectionMiddleware;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    delete process.env.FRONTEND_ORIGIN;
    middleware = new OriginProtectionMiddleware();
    next = jest.fn();
  });

  afterAll(() => {
    delete process.env.FRONTEND_ORIGIN;
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'allows %s without an Origin header',
    (method) => {
      middleware.use(createRequest(method), {} as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['POST', 'PATCH', 'DELETE'])(
    'allows %s with the exact configured origin',
    (method) => {
      middleware.use(
        createRequest(method, allowedOrigin),
        {} as Response,
        next,
      );

      expect(next).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['an absent origin', undefined],
    ['a null origin', 'null'],
    ['a foreign origin', 'https://evil.example.com'],
    ['the same host on another port', 'http://localhost:5174'],
    ['the same host with another protocol', 'https://localhost:5173'],
    ['another loopback hostname', 'http://127.0.0.1:5173'],
    ['a lookalike origin', 'http://localhost:5173.evil.test'],
  ])('rejects POST with %s', (_description, origin) => {
    expect(() =>
      middleware.use(createRequest('POST', origin), {} as Response, next),
    ).toThrow(new ForbiddenException('Invalid request origin'));
    expect(next).not.toHaveBeenCalled();
  });
});
