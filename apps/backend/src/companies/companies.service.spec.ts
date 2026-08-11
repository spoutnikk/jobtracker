import { ConflictException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from './companies.service';

describe('CompaniesService', () => {
  let service: CompaniesService;

  const prismaServiceMock = {
    jobOffer: {
      findFirst: jest.fn(),
    },
    company: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(<T>(operations: Promise<T>[]): Promise<T[]> =>
      Promise.all(operations),
    ),
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
    prismaServiceMock.company.count.mockResolvedValue(1);

    await expect(service.findAll(7)).resolves.toEqual({
      items: companies,
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });

    expect(prismaServiceMock.company.findMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
      },
      include: {
        jobOffers: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 10,
    });
    expect(prismaServiceMock.company.count).toHaveBeenCalledWith({
      where: { userId: 7 },
    });
  });

  it('should search, sort, and paginate without weakening ownership', async () => {
    prismaServiceMock.company.findMany.mockResolvedValue([]);
    prismaServiceMock.company.count.mockResolvedValue(12);

    await expect(
      service.findAll(7, {
        search: 'Acme',
        page: 2,
        pageSize: 5,
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    ).resolves.toEqual({
      items: [],
      page: 2,
      pageSize: 5,
      total: 12,
      totalPages: 3,
    });

    const where = {
      userId: 7,
      name: {
        contains: 'Acme',
        mode: 'insensitive',
      },
    };

    expect(prismaServiceMock.company.findMany).toHaveBeenCalledWith({
      where,
      include: { jobOffers: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 5,
      take: 5,
    });
    expect(prismaServiceMock.company.count).toHaveBeenCalledWith({ where });
  });

  it('returns zero total pages for an empty result', async () => {
    prismaServiceMock.company.findMany.mockResolvedValue([]);
    prismaServiceMock.company.count.mockResolvedValue(0);

    await expect(service.findAll(7)).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });
  });

  it('should return one company', async () => {
    const company = {
      id: 1,
      name: 'Acme Corp',
      jobOffers: [],
    };

    prismaServiceMock.company.findFirst.mockResolvedValue(company);

    await expect(service.findOne(7, 1)).resolves.toEqual(company);

    expect(prismaServiceMock.company.findFirst).toHaveBeenCalledWith({
      where: {
        id: 1,
        userId: 7,
      },
      include: {
        jobOffers: true,
      },
    });
  });

  it('should throw NotFoundException when company does not exist', async () => {
    prismaServiceMock.company.findFirst.mockResolvedValue(null);

    await expect(service.findOne(7, 9999)).rejects.toThrow(
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

    await expect(service.create(7, dto)).resolves.toEqual(company);

    expect(prismaServiceMock.company.create).toHaveBeenCalledWith({
      data: {
        ...dto,
        userId: 7,
      },
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

    prismaServiceMock.company.findFirst.mockResolvedValue(existingCompany);
    prismaServiceMock.company.update.mockResolvedValue(updatedCompany);

    const dto = {
      city: 'Villeurbanne',
    };

    await expect(service.update(7, 2, dto)).resolves.toEqual(updatedCompany);

    expect(prismaServiceMock.company.update).toHaveBeenCalledWith({
      where: {
        id: 2,
        userId: 7,
      },
      data: dto,
      include: {
        jobOffers: true,
      },
    });
  });

  it('should throw NotFoundException when updating an unknown company', async () => {
    prismaServiceMock.company.findFirst.mockResolvedValue(null);

    await expect(
      service.update(7, 9999, {
        city: 'Paris',
      }),
    ).rejects.toThrow('Company with id 9999 not found');

    expect(prismaServiceMock.company.update).not.toHaveBeenCalled();
  });

  it('should translate P2025 during update to the same NotFoundException', async () => {
    const company = { id: 2, name: 'TechNova', jobOffers: [] };
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Record not found',
      { code: 'P2025', clientVersion: '7.9.1' },
    );

    prismaServiceMock.company.findFirst.mockResolvedValue(company);
    prismaServiceMock.company.update.mockRejectedValueOnce(prismaError);

    await expect(service.update(7, 2, { city: 'Paris' })).rejects.toThrow(
      'Company with id 2 not found',
    );
  });

  it('should remove a company without job offers', async () => {
    const company = {
      id: 2,
      name: 'TechNova',
      website: 'https://technova.example',
      city: 'Villeurbanne',
      jobOffers: [],
    };

    prismaServiceMock.company.findFirst.mockResolvedValue(company);
    prismaServiceMock.company.delete.mockResolvedValue(company);

    await expect(service.remove(7, 3)).resolves.toEqual(company);

    expect(prismaServiceMock.company.delete).toHaveBeenCalledWith({
      where: {
        id: 3,
        userId: 7,
      },
    });
    expect(prismaServiceMock.jobOffer.findFirst).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when removing an unknown company', async () => {
    prismaServiceMock.company.findFirst.mockResolvedValue(null);

    await expect(service.remove(7, 9999)).rejects.toThrow(
      'Company with id 9999 not found',
    );

    expect(prismaServiceMock.company.delete).not.toHaveBeenCalled();
  });

  it('should translate P2025 during removal to the same NotFoundException', async () => {
    const company = { id: 2, name: 'TechNova', jobOffers: [] };
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Record not found',
      { code: 'P2025', clientVersion: '7.9.1' },
    );

    prismaServiceMock.company.findFirst.mockResolvedValue(company);
    prismaServiceMock.company.delete.mockRejectedValueOnce(prismaError);

    await expect(service.remove(7, 2)).rejects.toThrow(
      'Company with id 2 not found',
    );
    expect(prismaServiceMock.jobOffer.findFirst).not.toHaveBeenCalled();
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

    prismaServiceMock.company.findFirst.mockResolvedValue(company);

    const error: unknown = await service
      .remove(7, 1)
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(ConflictException);

    if (!(error instanceof ConflictException)) {
      throw new Error('Expected a ConflictException');
    }

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.message).toBe(
      'Company with id 1 cannot be deleted because it has job offers',
    );

    expect(prismaServiceMock.company.delete).not.toHaveBeenCalled();
    expect(prismaServiceMock.jobOffer.findFirst).not.toHaveBeenCalled();
  });

  it('should throw ConflictException when a job offer is created before deletion', async () => {
    const company = {
      id: 1,
      name: 'Acme Corp',
      jobOffers: [],
    };
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: '7.9.1',
      },
    );

    prismaServiceMock.company.findFirst.mockResolvedValue(company);
    prismaServiceMock.company.delete.mockRejectedValueOnce(prismaError);
    prismaServiceMock.jobOffer.findFirst.mockResolvedValueOnce({ id: 42 });

    const error: unknown = await service
      .remove(7, 1)
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(ConflictException);

    if (!(error instanceof ConflictException)) {
      throw new Error('Expected a ConflictException');
    }

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.message).toBe(
      'Company with id 1 cannot be deleted because it has job offers',
    );
    expect(prismaServiceMock.jobOffer.findFirst).toHaveBeenCalledWith({
      where: {
        companyId: 1,
        company: {
          userId: 7,
        },
      },
      select: {
        id: true,
      },
    });
  });

  it('should propagate P2003 when no job offer references the company', async () => {
    const company = {
      id: 1,
      name: 'Acme Corp',
      jobOffers: [],
    };
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: '7.9.1',
      },
    );

    prismaServiceMock.company.findFirst.mockResolvedValue(company);
    prismaServiceMock.company.delete.mockRejectedValueOnce(prismaError);
    prismaServiceMock.jobOffer.findFirst.mockResolvedValueOnce(null);

    await expect(service.remove(7, 1)).rejects.toBe(prismaError);

    expect(prismaServiceMock.jobOffer.findFirst).toHaveBeenCalledWith({
      where: {
        companyId: 1,
        company: {
          userId: 7,
        },
      },
      select: {
        id: true,
      },
    });
  });

  it('should propagate a non-P2003 deletion error without looking for job offers', async () => {
    const company = {
      id: 1,
      name: 'Acme Corp',
      jobOffers: [],
    };
    const deletionError = new Error('Company deletion failed');

    prismaServiceMock.company.findFirst.mockResolvedValue(company);
    prismaServiceMock.company.delete.mockRejectedValueOnce(deletionError);

    await expect(service.remove(7, 1)).rejects.toBe(deletionError);

    expect(prismaServiceMock.jobOffer.findFirst).not.toHaveBeenCalled();
  });
});
