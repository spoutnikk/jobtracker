import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from './companies.service';

describe('CompaniesService', () => {
  let service: CompaniesService;

  const prismaServiceMock = {
    company: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
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

  it('should create a company', async () => {
    const company = {
      id: 2,
      name: 'TechNova',
      website: 'https://technova.example',
      city: 'Lyon',
      jobOffers: [],
    };

    prismaServiceMock.company.create.mockResolvedValue(company);

    const dto = {
      name: 'TechNova',
      website: 'https://technova.example',
      city: 'Lyon',
    };

    await expect(service.create(dto)).resolves.toEqual(company);

    expect(prismaServiceMock.company.create).toHaveBeenCalledWith({
      data: dto,
      include: {
        jobOffers: true,
      },
    });
  });

  it('should update a company', async () => {
    const existingCompany = {
      id: 2,
      name: 'TechNova',
      website: 'https://technova.example',
      city: 'Lyon',
      jobOffers: [],
    };

    const updatedCompany = {
      ...existingCompany,
      city: 'Villeurbanne',
    };

    prismaServiceMock.company.findUnique.mockResolvedValue(existingCompany);
    prismaServiceMock.company.update.mockResolvedValue(updatedCompany);

    const dto = {
      city: 'Villeurbanne',
    };

    await expect(service.update(2, dto)).resolves.toEqual(updatedCompany);

    expect(prismaServiceMock.company.update).toHaveBeenCalledWith({
      where: {
        id: 2,
      },
      data: dto,
      include: {
        jobOffers: true,
      },
    });
  });

  it('should throw NotFoundException when updating an unknown company', async () => {
    prismaServiceMock.company.findUnique.mockResolvedValue(null);

    await expect(
      service.update(9999, {
        city: 'Paris',
      }),
    ).rejects.toThrow('Company with id 9999 not found');

    expect(prismaServiceMock.company.update).not.toHaveBeenCalled();
  });

  it('should remove a company without job offers', async () => {
    const company = {
      id: 2,
      name: 'TechNova',
      website: 'https://technova.example',
      city: 'Villeurbanne',
      jobOffers: [],
    };

    prismaServiceMock.company.findUnique.mockResolvedValue(company);
    prismaServiceMock.company.delete.mockResolvedValue(company);

    await expect(service.remove(3)).resolves.toEqual(company);

    expect(prismaServiceMock.company.delete).toHaveBeenCalledWith({
      where: {
        id: 3,
      },
    });
  });

  it('should throw NotFoundException when removing an unknown company', async () => {
    prismaServiceMock.company.findUnique.mockResolvedValue(null);

    await expect(service.remove(9999)).rejects.toThrow(
      'Company with id 9999 not found',
    );

    expect(prismaServiceMock.company.delete).not.toHaveBeenCalled();
  });

  it('should throw ConflictException when company has job offers', async () => {
    const company = {
      id: 1,
      name: 'Acme Corp',
      website: 'https://example.com',
      city: 'Paris',
      jobOffers: [
        {
          id: 1,
          title: 'Développeur TypeScript',
        },
      ],
    };

    prismaServiceMock.company.findUnique.mockResolvedValue(company);

    await expect(service.remove(1)).rejects.toThrow(
      'Company with id 1 cannot be deleted because it has job offers',
    );

    expect(prismaServiceMock.company.delete).not.toHaveBeenCalled();
  });
});
