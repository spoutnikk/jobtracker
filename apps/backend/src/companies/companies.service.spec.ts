import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from './companies.service';

describe('CompaniesService', () => {
  let service: CompaniesService;

  const prismaServiceMock = {
    company: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
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

  it('should return one company', async () => {
    const company = {
      id: 1,
      name: 'Acme Corp',
      jobOffers: [],
    };

    prismaServiceMock.company.findUnique.mockResolvedValue(company);

    await expect(service.findOne(1)).resolves.toEqual(company);

    expect(prismaServiceMock.company.findUnique).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      include: {
        jobOffers: true,
      },
    });
  });

  it('should throw NotFoundException when company does not exist', async () => {
    prismaServiceMock.company.findUnique.mockResolvedValue(null);

    await expect(service.findOne(9999)).rejects.toThrow(
      'Company with id 9999 not found',
    );
  });
});
