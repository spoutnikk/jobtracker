import {
  ConflictException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JobOffersService } from './job-offers.service';

describe('JobOffersService', () => {
  let service: JobOffersService;

  const prismaServiceMock = {
    application: {
      findFirst: jest.fn(),
    },
    company: {
      findFirst: jest.fn(),
    },
    jobOffer: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
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

    await expect(service.findAll(7)).resolves.toEqual(jobOffers);

    expect(prismaServiceMock.jobOffer.findMany).toHaveBeenCalledWith({
      where: {
        company: {
          userId: 7,
        },
      },
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

    prismaServiceMock.jobOffer.findFirst.mockResolvedValue(jobOffer);

    await expect(service.findOne(7, 1)).resolves.toEqual(jobOffer);

    expect(prismaServiceMock.jobOffer.findFirst).toHaveBeenCalledWith({
      where: {
        id: 1,
        company: {
          userId: 7,
        },
      },
      include: {
        company: true,
      },
    });
  });

  it('should throw NotFoundException when job offer does not exist', async () => {
    prismaServiceMock.jobOffer.findFirst.mockResolvedValue(null);

    const error: unknown = await service
      .findOne(7, 9999)
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

    prismaServiceMock.company.findFirst.mockResolvedValue({ id: 2 });
    prismaServiceMock.jobOffer.create.mockResolvedValue(createdJobOffer);

    await expect(service.create(7, dto)).resolves.toEqual(createdJobOffer);

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
    expect(prismaServiceMock.company.findFirst).toHaveBeenCalledWith({
      where: {
        id: 2,
        userId: 7,
      },
      select: {
        id: true,
      },
    });
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

    prismaServiceMock.company.findFirst.mockResolvedValue({ id: 2 });
    prismaServiceMock.jobOffer.create.mockResolvedValue(createdJobOffer);

    await expect(service.create(7, dto)).resolves.toEqual(createdJobOffer);

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
    expect(prismaServiceMock.company.findFirst).toHaveBeenCalledWith({
      where: {
        id: 2,
        userId: 7,
      },
      select: {
        id: true,
      },
    });
  });

  it('should throw NotFoundException when creating for an unknown company', async () => {
    const dto = {
      title: 'Développeur TypeScript',
      companyId: 9999,
    };

    prismaServiceMock.company.findFirst.mockResolvedValueOnce(null);

    const error: unknown = await service
      .create(7, dto)
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(NotFoundException);

    if (!(error instanceof NotFoundException)) {
      throw new Error('Expected a NotFoundException');
    }

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(error.message).toBe('Company with id 9999 not found');
    expect(prismaServiceMock.company.findFirst).toHaveBeenCalledWith({
      where: {
        id: 9999,
        userId: 7,
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
    prismaServiceMock.company.findFirst
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce({ id: 2 });

    await expect(service.create(7, dto)).rejects.toBe(prismaError);

    expect(prismaServiceMock.company.findFirst).toHaveBeenCalledWith({
      where: {
        id: 2,
        userId: 7,
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
    prismaServiceMock.company.findFirst.mockResolvedValueOnce({ id: 2 });

    await expect(service.create(7, dto)).rejects.toBe(creationError);

    expect(prismaServiceMock.company.findFirst).toHaveBeenCalledTimes(1);
  });

  it('should update a job offer with all fields', async () => {
    const existingJobOffer = {
      id: 1,
      title: 'Développeur TypeScript',
      company: { id: 2, name: 'TechNova' },
    };
    const dto = {
      title: 'Lead TypeScript',
      companyId: 3,
      url: 'https://example.com/jobs/lead-typescript',
      description: 'Pilotage technique',
      location: 'Lyon',
      contractType: 'CDI' as const,
      salary: '60k-70k',
      publishedAt: '2026-08-13T09:00:00.000Z',
    };
    const updatedJobOffer = {
      id: 1,
      ...dto,
      publishedAt: new Date(dto.publishedAt),
      company: { id: 3, name: 'Acme Corp' },
    };

    prismaServiceMock.jobOffer.findFirst.mockResolvedValue(existingJobOffer);
    prismaServiceMock.company.findFirst.mockResolvedValue({ id: 3 });
    prismaServiceMock.jobOffer.update.mockResolvedValue(updatedJobOffer);

    await expect(service.update(7, 1, dto)).resolves.toEqual(updatedJobOffer);

    expect(prismaServiceMock.jobOffer.update).toHaveBeenCalledWith({
      where: {
        id: 1,
        company: {
          userId: 7,
        },
      },
      data: {
        title: 'Lead TypeScript',
        companyId: 3,
        url: 'https://example.com/jobs/lead-typescript',
        description: 'Pilotage technique',
        location: 'Lyon',
        contractType: 'CDI',
        salary: '60k-70k',
        publishedAt: new Date('2026-08-13T09:00:00.000Z'),
      },
      include: {
        company: true,
      },
    });
    expect(prismaServiceMock.company.findFirst).toHaveBeenCalledWith({
      where: {
        id: 3,
        userId: 7,
      },
      select: {
        id: true,
      },
    });
  });

  it('should update a job offer without publishedAt', async () => {
    const existingJobOffer = {
      id: 1,
      title: 'Développeur TypeScript',
      company: { id: 2, name: 'TechNova' },
    };
    const updatedJobOffer = {
      ...existingJobOffer,
      title: 'Lead TypeScript',
    };

    prismaServiceMock.jobOffer.findFirst.mockResolvedValue(existingJobOffer);
    prismaServiceMock.jobOffer.update.mockResolvedValue(updatedJobOffer);

    await expect(
      service.update(7, 1, { title: 'Lead TypeScript' }),
    ).resolves.toEqual(updatedJobOffer);

    expect(prismaServiceMock.jobOffer.update).toHaveBeenCalledWith({
      where: {
        id: 1,
        company: {
          userId: 7,
        },
      },
      data: {
        title: 'Lead TypeScript',
        companyId: undefined,
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
  });

  it('should not update an unknown job offer', async () => {
    prismaServiceMock.jobOffer.findFirst.mockResolvedValue(null);

    await expect(
      service.update(7, 9999, { title: 'Lead TypeScript' }),
    ).rejects.toThrow('Job offer with id 9999 not found');

    expect(prismaServiceMock.jobOffer.update).not.toHaveBeenCalled();
  });

  it('should translate P2025 during update to the same NotFoundException', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Record not found',
      { code: 'P2025', clientVersion: '7.9.1' },
    );

    prismaServiceMock.jobOffer.findFirst.mockResolvedValue({
      id: 1,
      title: 'Développeur TypeScript',
      company: { id: 2, name: 'TechNova' },
    });
    prismaServiceMock.jobOffer.update.mockRejectedValueOnce(prismaError);

    await expect(
      service.update(7, 1, { title: 'Lead TypeScript' }),
    ).rejects.toThrow('Job offer with id 1 not found');
  });

  it('should throw NotFoundException when updating with an unknown company', async () => {
    prismaServiceMock.jobOffer.findFirst.mockResolvedValue({
      id: 1,
      title: 'Développeur TypeScript',
      company: { id: 2, name: 'TechNova' },
    });
    prismaServiceMock.company.findFirst.mockResolvedValueOnce(null);

    const error: unknown = await service
      .update(7, 1, { companyId: 9999 })
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(NotFoundException);

    if (!(error instanceof NotFoundException)) {
      throw new Error('Expected a NotFoundException');
    }

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(error.message).toBe('Company with id 9999 not found');
    expect(prismaServiceMock.company.findFirst).toHaveBeenCalledWith({
      where: {
        id: 9999,
        userId: 7,
      },
      select: {
        id: true,
      },
    });
  });

  it('should propagate P2003 when the updated company exists', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: '7.9.1',
      },
    );

    prismaServiceMock.jobOffer.findFirst.mockResolvedValue({
      id: 1,
      title: 'Développeur TypeScript',
      company: { id: 2, name: 'TechNova' },
    });
    prismaServiceMock.jobOffer.update.mockRejectedValueOnce(prismaError);
    prismaServiceMock.company.findFirst
      .mockResolvedValueOnce({ id: 3 })
      .mockResolvedValueOnce({ id: 3 });

    await expect(service.update(7, 1, { companyId: 3 })).rejects.toBe(
      prismaError,
    );

    expect(prismaServiceMock.company.findFirst).toHaveBeenCalledWith({
      where: {
        id: 3,
        userId: 7,
      },
      select: {
        id: true,
      },
    });
  });

  it('should propagate P2003 without checking a company when companyId is missing', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: '7.9.1',
      },
    );

    prismaServiceMock.jobOffer.findFirst.mockResolvedValue({
      id: 1,
      title: 'Développeur TypeScript',
      company: { id: 2, name: 'TechNova' },
    });
    prismaServiceMock.jobOffer.update.mockRejectedValueOnce(prismaError);

    await expect(
      service.update(7, 1, { title: 'Lead TypeScript' }),
    ).rejects.toBe(prismaError);

    expect(prismaServiceMock.company.findFirst).not.toHaveBeenCalled();
  });

  it('should propagate a non-P2003 update error without checking the company', async () => {
    const updateError = new Error('Job offer update failed');

    prismaServiceMock.jobOffer.findFirst.mockResolvedValue({
      id: 1,
      title: 'Développeur TypeScript',
      company: { id: 2, name: 'TechNova' },
    });
    prismaServiceMock.jobOffer.update.mockRejectedValueOnce(updateError);
    prismaServiceMock.company.findFirst.mockResolvedValueOnce({ id: 3 });

    await expect(service.update(7, 1, { companyId: 3 })).rejects.toBe(
      updateError,
    );

    expect(prismaServiceMock.company.findFirst).toHaveBeenCalledTimes(1);
  });

  it('should remove a job offer without applications', async () => {
    const jobOffer = {
      id: 1,
      title: 'Développeur TypeScript',
      company: { id: 2, name: 'TechNova' },
    };

    prismaServiceMock.jobOffer.findFirst.mockResolvedValue(jobOffer);
    prismaServiceMock.application.findFirst.mockResolvedValue(null);
    prismaServiceMock.jobOffer.delete.mockResolvedValue(jobOffer);

    await expect(service.remove(7, 1)).resolves.toEqual(jobOffer);

    expect(prismaServiceMock.application.findFirst).toHaveBeenCalledWith({
      where: {
        jobOfferId: 1,
        jobOffer: {
          company: {
            userId: 7,
          },
        },
      },
      select: {
        id: true,
      },
    });
    expect(prismaServiceMock.jobOffer.delete).toHaveBeenCalledWith({
      where: {
        id: 1,
        company: {
          userId: 7,
        },
      },
      include: {
        company: true,
      },
    });
  });

  it('should throw ConflictException when the job offer has applications', async () => {
    prismaServiceMock.jobOffer.findFirst.mockResolvedValue({
      id: 1,
      title: 'Développeur TypeScript',
      company: { id: 2, name: 'TechNova' },
    });
    prismaServiceMock.application.findFirst.mockResolvedValueOnce({ id: 10 });

    const error: unknown = await service
      .remove(7, 1)
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(ConflictException);

    if (!(error instanceof ConflictException)) {
      throw new Error('Expected a ConflictException');
    }

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.message).toBe(
      'Job offer with id 1 cannot be deleted because it has applications',
    );
    expect(prismaServiceMock.jobOffer.delete).not.toHaveBeenCalled();
  });

  it('should throw ConflictException when an application is created before deletion', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: '7.9.1',
      },
    );

    prismaServiceMock.jobOffer.findFirst.mockResolvedValue({
      id: 1,
      title: 'Développeur TypeScript',
      company: { id: 2, name: 'TechNova' },
    });
    prismaServiceMock.application.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 10 });
    prismaServiceMock.jobOffer.delete.mockRejectedValueOnce(prismaError);

    const error: unknown = await service
      .remove(7, 1)
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(ConflictException);

    if (!(error instanceof ConflictException)) {
      throw new Error('Expected a ConflictException');
    }

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.message).toBe(
      'Job offer with id 1 cannot be deleted because it has applications',
    );
    expect(prismaServiceMock.application.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        jobOfferId: 1,
        jobOffer: {
          company: {
            userId: 7,
          },
        },
      },
      select: {
        id: true,
      },
    });
  });

  it('should propagate P2003 when no application references the job offer', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: '7.9.1',
      },
    );

    prismaServiceMock.jobOffer.findFirst.mockResolvedValue({
      id: 1,
      title: 'Développeur TypeScript',
      company: { id: 2, name: 'TechNova' },
    });
    prismaServiceMock.application.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaServiceMock.jobOffer.delete.mockRejectedValueOnce(prismaError);

    await expect(service.remove(7, 1)).rejects.toBe(prismaError);

    expect(prismaServiceMock.application.findFirst).toHaveBeenCalledTimes(2);
  });

  it('should propagate a non-P2003 deletion error without checking applications again', async () => {
    const deletionError = new Error('Job offer deletion failed');

    prismaServiceMock.jobOffer.findFirst.mockResolvedValue({
      id: 1,
      title: 'Développeur TypeScript',
      company: { id: 2, name: 'TechNova' },
    });
    prismaServiceMock.application.findFirst.mockResolvedValueOnce(null);
    prismaServiceMock.jobOffer.delete.mockRejectedValueOnce(deletionError);

    await expect(service.remove(7, 1)).rejects.toBe(deletionError);

    expect(prismaServiceMock.application.findFirst).toHaveBeenCalledTimes(1);
  });

  it('should translate P2025 during removal to the same NotFoundException', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Record not found',
      { code: 'P2025', clientVersion: '7.9.1' },
    );

    prismaServiceMock.jobOffer.findFirst.mockResolvedValue({
      id: 1,
      title: 'Développeur TypeScript',
      company: { id: 2, name: 'TechNova' },
    });
    prismaServiceMock.application.findFirst.mockResolvedValueOnce(null);
    prismaServiceMock.jobOffer.delete.mockRejectedValueOnce(prismaError);

    await expect(service.remove(7, 1)).rejects.toThrow(
      'Job offer with id 1 not found',
    );
    expect(prismaServiceMock.application.findFirst).toHaveBeenCalledTimes(1);
  });

  it('should not remove an unknown job offer', async () => {
    prismaServiceMock.jobOffer.findFirst.mockResolvedValue(null);

    await expect(service.remove(7, 9999)).rejects.toThrow(
      'Job offer with id 9999 not found',
    );

    expect(prismaServiceMock.application.findFirst).not.toHaveBeenCalled();
    expect(prismaServiceMock.jobOffer.delete).not.toHaveBeenCalled();
  });
});
