import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { getAuthSessionToken } from './auth-cookie';
import type { AuthenticatedRequest } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = getAuthSessionToken(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    const user = await this.authService.authenticateSessionToken(token);

    if (!user) {
      throw new UnauthorizedException();
    }

    request.user = user;

    return true;
  }
}
