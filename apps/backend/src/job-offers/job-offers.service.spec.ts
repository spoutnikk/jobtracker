import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { JobOffersService } from './job-offers.service';

describe('JobOffersService', () => {
  let service: JobOffersService;

  const prismaServiceMock = {
    jobOffer: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobOffersService,
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
      ],
    }).compile();

    service = module.get<JobOffersService>(JobOffersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return all job offers', async () => {
    const jobOffers = [
      {
        id: 1,
        title: 'Développeur TypeScript',
      },
    ];

    prismaServiceMock.jobOffer.findMany.mockResolvedValue(jobOffers);

    await expect(service.findAll()).resolves.toEqual(jobOffers);

    expect(prismaServiceMock.jobOffer.findMany).toHaveBeenCalledWith({
      include: {
        company: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  });
});
