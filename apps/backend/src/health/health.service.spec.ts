import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  const prismaServiceMock = {
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('returns true when the database query succeeds', async () => {
    prismaServiceMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(service.checkDatabase()).resolves.toBe(true);

    expect(prismaServiceMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns false when the database query fails', async () => {
    prismaServiceMock.$queryRaw.mockRejectedValue(
      new Error('Database unavailable'),
    );

    await expect(service.checkDatabase()).resolves.toBe(false);

    expect(prismaServiceMock.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
