import {
  ForbiddenException,
  Injectable,
  type NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { getFrontendOrigin } from '../http-configuration';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class OriginProtectionMiddleware implements NestMiddleware {
  private readonly allowedOrigin = getFrontendOrigin(process.env);

  use(request: Request, _response: Response, next: NextFunction): void {
    if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
      next();
      return;
    }

    if (request.headers.origin !== this.allowedOrigin) {
      throw new ForbiddenException('Invalid request origin');
    }

    next();
  }
}
