import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from './authenticated-user';
import {
  AUTH_SESSION_COOKIE_NAME,
  getAuthSessionClearCookieOptions,
  getAuthSessionCookieOptions,
  getAuthSessionToken,
} from './auth-cookie';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedUser> {
    const session = await this.authService.login(loginDto);

    response.cookie(
      AUTH_SESSION_COOKIE_NAME,
      session.token,
      getAuthSessionCookieOptions(
        this.authService.sessionTtlSeconds,
        process.env.NODE_ENV,
      ),
    );

    return session.user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = getAuthSessionToken(request);

    if (token !== undefined) {
      await this.authService.logout(token);
    }

    response.clearCookie(
      AUTH_SESSION_COOKIE_NAME,
      getAuthSessionClearCookieOptions(process.env.NODE_ENV),
    );
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
