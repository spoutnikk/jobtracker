import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from './authenticated-user';
import { readAuthSessionTtlSeconds } from './auth-cookie';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';

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

  async register(registerDto: RegisterDto): Promise<CreatedAuthSession> {
    const email = registerDto.email.trim().toLowerCase();
    const firstName = registerDto.firstName.trim();
    const lastName = registerDto.lastName.trim();
    const passwordHash = await argon2.hash(registerDto.password);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1000);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email,
            firstName,
            lastName,
            passwordHash,
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        });

        await tx.session.create({
          data: {
            tokenHash: hashSessionToken(token),
            expiresAt,
            userId: createdUser.id,
          },
        });

        return createdUser;
      });

      return {
        token,
        user,
      };
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2002'
      ) {
        throw new ConflictException(
          'Un compte existe déjà avec cette adresse email',
        );
      }

      throw error;
    }
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

  async updateProfile(
    userId: number,
    updateProfileDto: UpdateProfileDto,
  ): Promise<AuthenticatedUser> {
    const data = {
      ...(updateProfileDto.firstName !== undefined
        ? { firstName: updateProfileDto.firstName.trim() }
        : {}),
      ...(updateProfileDto.lastName !== undefined
        ? { lastName: updateProfileDto.lastName.trim() }
        : {}),
      ...(updateProfileDto.email !== undefined
        ? { email: updateProfileDto.email.trim().toLowerCase() }
        : {}),
    };

    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2002'
      ) {
        throw new ConflictException(
          'Un compte existe déjà avec cette adresse email',
        );
      }

      throw error;
    }
  }

  async changePassword(
    userId: number,
    currentSessionToken: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        passwordHash: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      changePasswordDto.currentPassword,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    const newPasswordHash = await argon2.hash(changePasswordDto.newPassword);
    const currentTokenHash = hashSessionToken(currentSessionToken);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
        },
      });

      await tx.session.deleteMany({
        where: {
          userId,
          tokenHash: {
            not: currentTokenHash,
          },
        },
      });
    });
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
