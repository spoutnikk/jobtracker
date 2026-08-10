import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from './companies.service';

describe('CompaniesService', () => {
  let service: CompaniesService;

  const prismaServiceMock = {
    company: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return all companies', async () => {
    const companies = [
      {
        id: 1,
        name: 'Acme Corp',
        website: 'https://example.com',
        city: 'Paris',
        jobOffers: [],
      },
    ];

    prismaServiceMock.company.findMany.mockResolvedValue(companies);

    await expect(service.findAll()).resolves.toEqual(companies);

    expect(prismaServiceMock.company.findMany).toHaveBeenCalledWith({
      include: {
        jobOffers: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  });
});
