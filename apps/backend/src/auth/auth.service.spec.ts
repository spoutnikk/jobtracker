import { createHash } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const prismaServiceMock = {
    session: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaServiceMock },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('hashes the opaque token and returns only the minimal user', async () => {
    const token = 'opaque-session-token';
    const user = {
      id: 7,
      email: 'user@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    };
    prismaServiceMock.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      user,
    });

    await expect(service.authenticateSessionToken(token)).resolves.toEqual(
      user,
    );
    expect(prismaServiceMock.session.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
      },
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
  });

  it('returns null for an unknown session', async () => {
    prismaServiceMock.session.findUnique.mockResolvedValue(null);

    await expect(
      service.authenticateSessionToken('unknown'),
    ).resolves.toBeNull();
  });

  it('returns null for an expired session', async () => {
    prismaServiceMock.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 1),
      user: {
        id: 7,
        email: 'user@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
      },
    });

    await expect(
      service.authenticateSessionToken('expired'),
    ).resolves.toBeNull();
  });
});
