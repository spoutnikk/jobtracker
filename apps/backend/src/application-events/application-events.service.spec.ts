import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationEventsService } from './application-events.service';

describe('ApplicationEventsService', () => {
  let service: ApplicationEventsService;

  const prismaServiceMock = {
    application: {
      findUnique: jest.fn(),
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

    prismaServiceMock.application.findUnique.mockResolvedValue(application);
    prismaServiceMock.applicationEvent.create.mockResolvedValue(createdEvent);

    await expect(service.create(dto)).resolves.toEqual(createdEvent);

    expect(prismaServiceMock.application.findUnique).toHaveBeenCalledWith({
      where: {
        id: 4,
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

    prismaServiceMock.application.findUnique.mockResolvedValue(application);
    prismaServiceMock.applicationEvent.create.mockResolvedValue(createdEvent);

    await expect(service.create(dto)).resolves.toEqual(createdEvent);

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
    prismaServiceMock.application.findUnique.mockResolvedValue(null);

    await expect(
      service.create({
        applicationId: 9999,
        type: 'NOTE',
        title: 'Événement impossible',
      }),
    ).rejects.toThrow('Application with id 9999 not found');

    expect(prismaServiceMock.applicationEvent.create).not.toHaveBeenCalled();
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

    prismaServiceMock.application.findUnique.mockResolvedValue(application);
    prismaServiceMock.applicationEvent.findMany.mockResolvedValue(events);

    await expect(service.findByApplication(4)).resolves.toEqual(events);

    expect(prismaServiceMock.application.findUnique).toHaveBeenCalledWith({
      where: {
        id: 4,
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
    prismaServiceMock.application.findUnique.mockResolvedValue(null);

    await expect(service.findByApplication(9999)).rejects.toThrow(
      'Application with id 9999 not found',
    );

    expect(prismaServiceMock.applicationEvent.findMany).not.toHaveBeenCalled();
  });
});
