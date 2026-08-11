import { HttpStatus, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationEventsService } from './application-events.service';

describe('ApplicationEventsService', () => {
  let service: ApplicationEventsService;

  const prismaServiceMock = {
    application: {
      findFirst: jest.fn(),
    },
    applicationEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationEventsService,
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
      ],
    }).compile();

    service = module.get<ApplicationEventsService>(ApplicationEventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create an application event', async () => {
    const application = {
      id: 4,
    };

    const dto = {
      applicationId: 4,
      type: 'NOTE' as const,
      title: 'Premier événement manuel',
      description: 'Test du journal de candidature',
    };

    const createdEvent = {
      id: 1,
      ...dto,
      occurredAt: new Date('2026-08-10T23:33:44.237Z'),
      createdAt: new Date('2026-08-10T23:33:44.237Z'),
    };

    prismaServiceMock.application.findFirst.mockResolvedValue(application);
    prismaServiceMock.applicationEvent.create.mockResolvedValue(createdEvent);

    await expect(service.create(7, dto)).resolves.toEqual(createdEvent);

    expect(prismaServiceMock.application.findFirst).toHaveBeenCalledWith({
      where: {
        id: 4,
        userId: 7,
      },
      select: {
        id: true,
      },
    });

    expect(prismaServiceMock.applicationEvent.create).toHaveBeenCalledWith({
      data: {
        applicationId: 4,
        type: 'NOTE',
        title: 'Premier événement manuel',
        description: 'Test du journal de candidature',
        occurredAt: undefined,
      },
    });
  });

  it('should create an application event with a custom occurredAt date', async () => {
    const application = {
      id: 4,
    };

    const dto = {
      applicationId: 4,
      type: 'FOLLOW_UP' as const,
      title: 'Relance envoyée',
      occurredAt: '2026-08-15T09:00:00.000Z',
    };

    const createdEvent = {
      id: 2,
      ...dto,
      occurredAt: new Date(dto.occurredAt),
      createdAt: new Date(),
    };

    prismaServiceMock.application.findFirst.mockResolvedValue(application);
    prismaServiceMock.applicationEvent.create.mockResolvedValue(createdEvent);

    await expect(service.create(7, dto)).resolves.toEqual(createdEvent);

    expect(prismaServiceMock.applicationEvent.create).toHaveBeenCalledWith({
      data: {
        applicationId: 4,
        type: 'FOLLOW_UP',
        title: 'Relance envoyée',
        description: undefined,
        occurredAt: new Date('2026-08-15T09:00:00.000Z'),
      },
    });
  });

  it('should throw NotFoundException when creating an event for an unknown application', async () => {
    prismaServiceMock.application.findFirst.mockResolvedValue(null);

    const error: unknown = await service
      .create(7, {
        applicationId: 9999,
        type: 'NOTE',
        title: 'Événement impossible',
      })
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(NotFoundException);

    if (!(error instanceof NotFoundException)) {
      throw new Error('Expected a NotFoundException');
    }

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(error.message).toBe('Application with id 9999 not found');

    expect(prismaServiceMock.applicationEvent.create).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when the application is deleted before event creation', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: '7.9.1',
      },
    );
    const dto = {
      applicationId: 4,
      type: 'NOTE' as const,
      title: 'Événement concurrent',
    };

    prismaServiceMock.application.findFirst
      .mockResolvedValueOnce({ id: 4 })
      .mockResolvedValueOnce(null);
    prismaServiceMock.applicationEvent.create.mockRejectedValueOnce(
      prismaError,
    );

    const error: unknown = await service
      .create(7, dto)
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(NotFoundException);

    if (!(error instanceof NotFoundException)) {
      throw new Error('Expected a NotFoundException');
    }

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(error.message).toBe('Application with id 4 not found');
    expect(prismaServiceMock.application.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        id: 4,
        userId: 7,
      },
      select: {
        id: true,
      },
    });
  });

  it('should propagate P2003 when the application still exists', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: '7.9.1',
      },
    );
    const dto = {
      applicationId: 4,
      type: 'NOTE' as const,
      title: 'Événement concurrent',
    };

    prismaServiceMock.application.findFirst
      .mockResolvedValueOnce({ id: 4 })
      .mockResolvedValueOnce({ id: 4 });
    prismaServiceMock.applicationEvent.create.mockRejectedValueOnce(
      prismaError,
    );

    await expect(service.create(7, dto)).rejects.toBe(prismaError);

    expect(prismaServiceMock.application.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        id: 4,
        userId: 7,
      },
      select: {
        id: true,
      },
    });
  });

  it('should propagate a non-P2003 error without checking the application again', async () => {
    const creationError = new Error('Application event creation failed');
    const dto = {
      applicationId: 4,
      type: 'NOTE' as const,
      title: 'Événement impossible',
    };

    prismaServiceMock.application.findFirst.mockResolvedValueOnce({ id: 4 });
    prismaServiceMock.applicationEvent.create.mockRejectedValueOnce(
      creationError,
    );

    await expect(service.create(7, dto)).rejects.toBe(creationError);

    expect(prismaServiceMock.application.findFirst).toHaveBeenCalledTimes(1);
  });

  it('should return application events ordered by date', async () => {
    const application = {
      id: 4,
    };

    const events = [
      {
        id: 1,
        applicationId: 4,
        type: 'CREATED',
        title: 'Candidature créée',
      },
      {
        id: 2,
        applicationId: 4,
        type: 'NOTE',
        title: 'Note ajoutée',
      },
    ];

    prismaServiceMock.application.findFirst.mockResolvedValue(application);
    prismaServiceMock.applicationEvent.findMany.mockResolvedValue(events);

    await expect(service.findByApplication(7, 4)).resolves.toEqual(events);

    expect(prismaServiceMock.application.findFirst).toHaveBeenCalledWith({
      where: {
        id: 4,
        userId: 7,
      },
      select: {
        id: true,
      },
    });

    expect(prismaServiceMock.applicationEvent.findMany).toHaveBeenCalledWith({
      where: {
        applicationId: 4,
      },
      orderBy: {
        occurredAt: 'asc',
      },
    });
  });

  it('should throw NotFoundException when application does not exist', async () => {
    prismaServiceMock.application.findFirst.mockResolvedValue(null);

    await expect(service.findByApplication(7, 9999)).rejects.toThrow(
      'Application with id 9999 not found',
    );

    expect(prismaServiceMock.applicationEvent.findMany).not.toHaveBeenCalled();
  });
});
