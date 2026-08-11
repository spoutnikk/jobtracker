import { HttpStatus, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JobOffersService } from './job-offers.service';

describe('JobOffersService', () => {
  let service: JobOffersService;

  const prismaServiceMock = {
    company: {
      findUnique: jest.fn(),
    },
    jobOffer: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
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

  it('should return one job offer with its company', async () => {
    const jobOffer = {
      id: 1,
      title: 'Développeur TypeScript',
      companyId: 2,
      company: {
        id: 2,
        name: 'TechNova',
      },
    };

    prismaServiceMock.jobOffer.findUnique.mockResolvedValue(jobOffer);

    await expect(service.findOne(1)).resolves.toEqual(jobOffer);

    expect(prismaServiceMock.jobOffer.findUnique).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      include: {
        company: true,
      },
    });
  });

  it('should throw NotFoundException when job offer does not exist', async () => {
    prismaServiceMock.jobOffer.findUnique.mockResolvedValue(null);

    const error: unknown = await service
      .findOne(9999)
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(NotFoundException);

    if (!(error instanceof NotFoundException)) {
      throw new Error('Expected a NotFoundException');
    }

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(error.message).toBe('Job offer with id 9999 not found');
  });

  it('should create a job offer with all fields', async () => {
    const dto = {
      title: 'Développeur TypeScript',
      companyId: 2,
      url: 'https://example.com/jobs/typescript',
      description: 'Développement d’une application métier',
      location: 'Paris',
      contractType: 'CDI' as const,
      salary: '50k-60k',
      publishedAt: '2026-08-12T09:00:00.000Z',
    };
    const createdJobOffer = {
      id: 1,
      ...dto,
      publishedAt: new Date(dto.publishedAt),
      company: {
        id: 2,
        name: 'TechNova',
      },
    };

    prismaServiceMock.jobOffer.create.mockResolvedValue(createdJobOffer);

    await expect(service.create(dto)).resolves.toEqual(createdJobOffer);

    expect(prismaServiceMock.jobOffer.create).toHaveBeenCalledWith({
      data: {
        title: 'Développeur TypeScript',
        companyId: 2,
        url: 'https://example.com/jobs/typescript',
        description: 'Développement d’une application métier',
        location: 'Paris',
        contractType: 'CDI',
        salary: '50k-60k',
        publishedAt: new Date('2026-08-12T09:00:00.000Z'),
      },
      include: {
        company: true,
      },
    });
    expect(prismaServiceMock.company.findUnique).not.toHaveBeenCalled();
  });

  it('should create a job offer without publishedAt', async () => {
    const dto = {
      title: 'Développeur TypeScript',
      companyId: 2,
    };
    const createdJobOffer = {
      id: 1,
      ...dto,
      publishedAt: null,
      company: {
        id: 2,
        name: 'TechNova',
      },
    };

    prismaServiceMock.jobOffer.create.mockResolvedValue(createdJobOffer);

    await expect(service.create(dto)).resolves.toEqual(createdJobOffer);

    expect(prismaServiceMock.jobOffer.create).toHaveBeenCalledWith({
      data: {
        title: 'Développeur TypeScript',
        companyId: 2,
        url: undefined,
        description: undefined,
        location: undefined,
        contractType: undefined,
        salary: undefined,
        publishedAt: undefined,
      },
      include: {
        company: true,
      },
    });
    expect(prismaServiceMock.company.findUnique).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when creating for an unknown company', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: '7.9.1',
      },
    );
    const dto = {
      title: 'Développeur TypeScript',
      companyId: 9999,
    };

    prismaServiceMock.jobOffer.create.mockRejectedValueOnce(prismaError);
    prismaServiceMock.company.findUnique.mockResolvedValueOnce(null);

    const error: unknown = await service
      .create(dto)
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(NotFoundException);

    if (!(error instanceof NotFoundException)) {
      throw new Error('Expected a NotFoundException');
    }

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(error.message).toBe('Company with id 9999 not found');
    expect(prismaServiceMock.company.findUnique).toHaveBeenCalledWith({
      where: {
        id: 9999,
      },
      select: {
        id: true,
      },
    });
  });

  it('should propagate P2003 when the company exists', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: '7.9.1',
      },
    );
    const dto = {
      title: 'Développeur TypeScript',
      companyId: 2,
    };

    prismaServiceMock.jobOffer.create.mockRejectedValueOnce(prismaError);
    prismaServiceMock.company.findUnique.mockResolvedValueOnce({ id: 2 });

    await expect(service.create(dto)).rejects.toBe(prismaError);

    expect(prismaServiceMock.company.findUnique).toHaveBeenCalledWith({
      where: {
        id: 2,
      },
      select: {
        id: true,
      },
    });
  });

  it('should propagate a non-P2003 error without checking the company', async () => {
    const creationError = new Error('Job offer creation failed');
    const dto = {
      title: 'Développeur TypeScript',
      companyId: 2,
    };

    prismaServiceMock.jobOffer.create.mockRejectedValueOnce(creationError);

    await expect(service.create(dto)).rejects.toBe(creationError);

    expect(prismaServiceMock.company.findUnique).not.toHaveBeenCalled();
  });
});
