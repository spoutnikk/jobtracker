import { Injectable } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from './authenticated-user';
import { readAuthSessionTtlSeconds } from './auth-cookie';
import type { LoginDto } from './dto/login.dto';

const INVALID_CREDENTIALS_MESSAGE = 'Email ou mot de passe incorrect';
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$hTl/67DtOMHpxMC7GCSwkw$71TLXdhkrUngvzPzN9P2w9vY7NznsRJ8ikWyvWtEcAQ';

export interface CreatedAuthSession {
  user: AuthenticatedUser;
  token: string;
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  readonly sessionTtlSeconds: number;

  constructor(private readonly prisma: PrismaService) {
    this.sessionTtlSeconds = readAuthSessionTtlSeconds(process.env);
  }

  async login(loginDto: LoginDto): Promise<CreatedAuthSession> {
    const email = loginDto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        passwordHash: true,
      },
    });
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await argon2.verify(
      passwordHash,
      loginDto.password,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1000);

    await this.prisma.session.create({
      data: {
        tokenHash: hashSessionToken(token),
        expiresAt,
        userId: user.id,
      },
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  async logout(token: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: {
        tokenHash: hashSessionToken(token),
      },
    });
  }

  async authenticateSessionToken(
    token: string,
  ): Promise<AuthenticatedUser | null> {
    const tokenHash = hashSessionToken(token);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      select: {
        expiresAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    const now = new Date();

    if (session.expiresAt.getTime() <= now.getTime()) {
      try {
        await this.prisma.session.deleteMany({
          where: {
            tokenHash,
            expiresAt: {
              lte: now,
            },
          },
        });
      } catch {
        return null;
      }

      return null;
    }

    return session.user;
  }
}
