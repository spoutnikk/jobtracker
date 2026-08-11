import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationsService } from './applications.service';

describe('ApplicationsService', () => {
  let service: ApplicationsService;

  const transactionClientMock = {
    application: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    applicationEvent: {
      create: jest.fn(),
    },
  };

  const prismaServiceMock = {
    ...transactionClientMock,
    $transaction: jest.fn(
      <T>(
        callback: (tx: typeof transactionClientMock) => Promise<T>,
      ): Promise<T> => callback(transactionClientMock),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
      ],
    }).compile();

    service = module.get<ApplicationsService>(ApplicationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return all applications', async () => {
    const applications = [
      {
        id: 1,
        status: 'APPLIED',
      },
    ];

    prismaServiceMock.application.findMany.mockResolvedValue(applications);

    await expect(service.findAll()).resolves.toEqual(applications);

    expect(prismaServiceMock.application.findMany).toHaveBeenCalledWith({
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  });

  it('should return one application', async () => {
    const application = {
      id: 1,
      status: 'APPLIED',
    };

    prismaServiceMock.application.findUnique.mockResolvedValue(application);

    await expect(service.findOne(1)).resolves.toEqual(application);

    expect(prismaServiceMock.application.findUnique).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
    });
  });

  it('should throw NotFoundException when application does not exist', async () => {
    prismaServiceMock.application.findUnique.mockResolvedValue(null);

    await expect(service.findOne(9999)).rejects.toThrow(
      'Application with id 9999 not found',
    );
  });

  it('should create an application', async () => {
    const createdApplication = {
      id: 1,
      status: 'APPLIED',
    };

    prismaServiceMock.application.create.mockResolvedValue(createdApplication);

    const dto = {
      userId: 1,
      jobOfferId: 1,
      status: 'APPLIED' as const,
      source: 'France Travail',
      appliedAt: '2026-08-09T10:00:00.000Z',
    };

    await expect(service.create(dto)).resolves.toEqual(createdApplication);

    expect(prismaServiceMock.application.create).toHaveBeenCalledWith({
      data: {
        userId: 1,
        jobOfferId: 1,
        status: 'APPLIED',
        appliedAt: new Date('2026-08-09T10:00:00.000Z'),
        source: 'France Travail',
        notes: undefined,
        contactName: undefined,
        contactEmail: undefined,
        followUpAt: undefined,
        interviewAt: undefined,
      },
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
    });

    expect(prismaServiceMock.applicationEvent.create).toHaveBeenNthCalledWith(
      1,
      {
        data: {
          applicationId: 1,
          type: 'CREATED',
          title: 'Candidature créée',
        },
      },
    );
    expect(prismaServiceMock.applicationEvent.create).toHaveBeenNthCalledWith(
      2,
      {
        data: {
          applicationId: 1,
          type: 'APPLICATION_SENT',
          title: 'Candidature envoyée',
          occurredAt: new Date('2026-08-09T10:00:00.000Z'),
        },
      },
    );
  });

  it('should use the current date when creating an applied application without appliedAt', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-11T09:30:00.000Z'));

    try {
      const createdApplication = {
        id: 1,
        status: 'APPLIED',
      };
      const dto = {
        userId: 1,
        jobOfferId: 1,
        status: 'APPLIED' as const,
      };

      prismaServiceMock.application.create.mockResolvedValue(
        createdApplication,
      );

      await expect(service.create(dto)).resolves.toEqual(createdApplication);

      expect(prismaServiceMock.application.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          jobOfferId: 1,
          status: 'APPLIED',
          appliedAt: new Date('2026-08-11T09:30:00.000Z'),
          source: undefined,
          notes: undefined,
          contactName: undefined,
          contactEmail: undefined,
          followUpAt: undefined,
          interviewAt: undefined,
        },
        include: {
          jobOffer: {
            include: {
              company: true,
            },
          },
        },
      });
      expect(prismaServiceMock.applicationEvent.create).toHaveBeenNthCalledWith(
        2,
        {
          data: {
            applicationId: 1,
            type: 'APPLICATION_SENT',
            title: 'Candidature envoyée',
            occurredAt: new Date('2026-08-11T09:30:00.000Z'),
          },
        },
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('should not set appliedAt or create an application sent event for a draft', async () => {
    const createdApplication = {
      id: 1,
      status: 'DRAFT',
    };
    const dto = {
      userId: 1,
      jobOfferId: 1,
      status: 'DRAFT' as const,
    };

    prismaServiceMock.application.create.mockResolvedValue(createdApplication);

    await expect(service.create(dto)).resolves.toEqual(createdApplication);

    expect(prismaServiceMock.application.create).toHaveBeenCalledWith({
      data: {
        userId: 1,
        jobOfferId: 1,
        status: 'DRAFT',
        appliedAt: undefined,
        source: undefined,
        notes: undefined,
        contactName: undefined,
        contactEmail: undefined,
        followUpAt: undefined,
        interviewAt: undefined,
      },
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
    });
    expect(prismaServiceMock.applicationEvent.create).toHaveBeenCalledTimes(1);
    expect(prismaServiceMock.applicationEvent.create).toHaveBeenCalledWith({
      data: {
        applicationId: 1,
        type: 'CREATED',
        title: 'Candidature créée',
      },
    });
  });

  it('should propagate the application event error when creating an application', async () => {
    const createdApplication = {
      id: 1,
      status: 'APPLIED',
    };
    const transactionError = new Error('Application event creation failed');
    const dto = {
      userId: 1,
      jobOfferId: 1,
      status: 'APPLIED' as const,
      source: 'France Travail',
      appliedAt: '2026-08-09T10:00:00.000Z',
    };

    prismaServiceMock.application.create.mockResolvedValue(createdApplication);
    prismaServiceMock.applicationEvent.create.mockRejectedValueOnce(
      transactionError,
    );

    await expect(service.create(dto)).rejects.toBe(transactionError);

    expect(prismaServiceMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaServiceMock.application.create).toHaveBeenCalledWith({
      data: {
        userId: 1,
        jobOfferId: 1,
        status: 'APPLIED',
        appliedAt: new Date('2026-08-09T10:00:00.000Z'),
        source: 'France Travail',
        notes: undefined,
        contactName: undefined,
        contactEmail: undefined,
        followUpAt: undefined,
        interviewAt: undefined,
      },
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
    });
    expect(prismaServiceMock.applicationEvent.create).toHaveBeenCalledWith({
      data: {
        applicationId: 1,
        type: 'CREATED',
        title: 'Candidature créée',
      },
    });
  });

  it('should update an application', async () => {
    const existingApplication = {
      id: 1,
      status: 'APPLIED',
    };

    const updatedApplication = {
      id: 1,
      status: 'INTERVIEW',
    };

    prismaServiceMock.application.findUnique.mockResolvedValue(
      existingApplication,
    );
    prismaServiceMock.application.update.mockResolvedValue(updatedApplication);

    const dto = {
      status: 'INTERVIEW' as const,
      contactName: 'Marie Dupont',
      interviewAt: '2026-08-20T14:00:00.000Z',
    };

    await expect(service.update(1, dto)).resolves.toEqual(updatedApplication);

    expect(prismaServiceMock.$transaction).toHaveBeenCalledTimes(1);

    expect(prismaServiceMock.application.findUnique).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      select: {
        status: true,
        followUpAt: true,
        interviewAt: true,
      },
    });

    expect(prismaServiceMock.application.update).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      data: {
        userId: undefined,
        jobOfferId: undefined,
        status: 'INTERVIEW',
        appliedAt: undefined,
        source: undefined,
        notes: undefined,
        contactName: 'Marie Dupont',
        contactEmail: undefined,
        followUpAt: undefined,
        interviewAt: new Date('2026-08-20T14:00:00.000Z'),
      },
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
    });

    expect(prismaServiceMock.applicationEvent.create).toHaveBeenNthCalledWith(
      1,
      {
        data: {
          applicationId: 1,
          type: 'STATUS_CHANGED',
          title: 'Statut modifié',
          description: 'APPLIED → INTERVIEW',
        },
      },
    );

    expect(prismaServiceMock.applicationEvent.create).toHaveBeenNthCalledWith(
      2,
      {
        data: {
          applicationId: 1,
          type: 'INTERVIEW',
          title: 'Entretien planifié',
          occurredAt: new Date('2026-08-20T14:00:00.000Z'),
        },
      },
    );
  });

  it('should throw NotFoundException when updating an unknown application', async () => {
    prismaServiceMock.application.findUnique.mockResolvedValue(null);

    const dto = {
      status: 'INTERVIEW' as const,
    };

    await expect(service.update(9999, dto)).rejects.toThrow(
      'Application with id 9999 not found',
    );

    expect(prismaServiceMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaServiceMock.application.update).not.toHaveBeenCalled();
    expect(prismaServiceMock.applicationEvent.create).not.toHaveBeenCalled();
  });

  it('should propagate the application event error when updating an application', async () => {
    const transactionError = new Error('Application event creation failed');
    const updatedApplication = {
      id: 1,
      status: 'INTERVIEW',
    };
    const dto = {
      status: 'INTERVIEW' as const,
    };

    prismaServiceMock.application.findUnique.mockResolvedValue({
      status: 'APPLIED',
      followUpAt: null,
      interviewAt: null,
    });
    prismaServiceMock.application.update.mockResolvedValue(updatedApplication);
    prismaServiceMock.applicationEvent.create.mockRejectedValueOnce(
      transactionError,
    );

    await expect(service.update(1, dto)).rejects.toBe(transactionError);

    expect(prismaServiceMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaServiceMock.application.findUnique).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      select: {
        status: true,
        followUpAt: true,
        interviewAt: true,
      },
    });
    expect(prismaServiceMock.application.update).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      data: {
        userId: undefined,
        jobOfferId: undefined,
        status: 'INTERVIEW',
        appliedAt: undefined,
        source: undefined,
        notes: undefined,
        contactName: undefined,
        contactEmail: undefined,
        followUpAt: undefined,
        interviewAt: undefined,
      },
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
    });
    expect(prismaServiceMock.applicationEvent.create).toHaveBeenCalledWith({
      data: {
        applicationId: 1,
        type: 'STATUS_CHANGED',
        title: 'Statut modifié',
        description: 'APPLIED → INTERVIEW',
      },
    });
  });

  it('should create a follow-up event when followUpAt changes', async () => {
    const followUpAt = '2026-08-25T10:00:00.000Z';
    const updatedApplication = {
      id: 1,
      status: 'APPLIED',
      followUpAt: new Date(followUpAt),
    };

    prismaServiceMock.application.findUnique.mockResolvedValue({
      status: 'APPLIED',
      followUpAt: null,
      interviewAt: null,
    });
    prismaServiceMock.application.update.mockResolvedValue(updatedApplication);

    await expect(service.update(1, { followUpAt })).resolves.toEqual(
      updatedApplication,
    );

    expect(prismaServiceMock.applicationEvent.create).toHaveBeenCalledWith({
      data: {
        applicationId: 1,
        type: 'FOLLOW_UP',
        title: 'Relance planifiée',
        occurredAt: new Date(followUpAt),
      },
    });
  });

  it('should not create an event when followUpAt remains unchanged', async () => {
    const previousFollowUpAt = '2026-08-25T10:00:00.000Z';
    const followUpAt = '2026-08-25T12:00:00.000+02:00';
    const application = {
      id: 1,
      status: 'APPLIED',
      followUpAt: new Date(followUpAt),
    };

    prismaServiceMock.application.findUnique.mockResolvedValue({
      status: 'APPLIED',
      followUpAt: new Date(previousFollowUpAt),
      interviewAt: null,
    });
    prismaServiceMock.application.update.mockResolvedValue(application);

    await expect(service.update(1, { followUpAt })).resolves.toEqual(
      application,
    );

    expect(prismaServiceMock.applicationEvent.create).not.toHaveBeenCalled();
  });

  it('should not create an event when interviewAt remains unchanged', async () => {
    const previousInterviewAt = '2026-08-20T14:00:00.000Z';
    const interviewAt = '2026-08-20T16:00:00.000+02:00';
    const application = {
      id: 1,
      status: 'INTERVIEW',
      interviewAt: new Date(interviewAt),
    };

    prismaServiceMock.application.findUnique.mockResolvedValue({
      status: 'INTERVIEW',
      followUpAt: null,
      interviewAt: new Date(previousInterviewAt),
    });
    prismaServiceMock.application.update.mockResolvedValue(application);

    await expect(service.update(1, { interviewAt })).resolves.toEqual(
      application,
    );

    expect(prismaServiceMock.applicationEvent.create).not.toHaveBeenCalled();
  });

  it('should not create an event when updating a non-event field', async () => {
    const application = {
      id: 1,
      status: 'APPLIED',
      contactName: 'Marie Dupont',
    };

    prismaServiceMock.application.findUnique.mockResolvedValue({
      status: 'APPLIED',
      followUpAt: null,
      interviewAt: null,
    });
    prismaServiceMock.application.update.mockResolvedValue(application);

    await expect(
      service.update(1, { contactName: 'Marie Dupont' }),
    ).resolves.toEqual(application);

    expect(prismaServiceMock.applicationEvent.create).not.toHaveBeenCalled();
  });

  it('should remove an application', async () => {
    const application = {
      id: 1,
      status: 'INTERVIEW',
    };

    prismaServiceMock.application.findUnique.mockResolvedValue(application);
    prismaServiceMock.application.delete.mockResolvedValue(application);

    await expect(service.remove(1)).resolves.toEqual(application);

    expect(prismaServiceMock.application.delete).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
    });
  });

  it('should throw NotFoundException when removing an unknown application', async () => {
    prismaServiceMock.application.findUnique.mockResolvedValue(null);

    await expect(service.remove(9999)).rejects.toThrow(
      'Application with id 9999 not found',
    );

    expect(prismaServiceMock.application.delete).not.toHaveBeenCalled();
  });

  it('should return upcoming follow-ups ordered by date', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-10T10:00:00.000Z'));

    const applications = [
      {
        id: 1,
        followUpAt: new Date('2026-08-15T10:00:00.000Z'),
      },
    ];

    prismaServiceMock.application.findMany.mockResolvedValue(applications);

    await expect(service.findFollowUps()).resolves.toEqual(applications);

    expect(prismaServiceMock.application.findMany).toHaveBeenCalledWith({
      where: {
        followUpAt: {
          gte: new Date('2026-08-10T10:00:00.000Z'),
        },
      },
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
      orderBy: {
        followUpAt: 'asc',
      },
    });
  });

  it('should return upcoming interviews ordered by date', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-10T10:00:00.000Z'));

    const applications = [
      {
        id: 1,
        interviewAt: new Date('2026-08-20T14:00:00.000Z'),
      },
    ];

    prismaServiceMock.application.findMany.mockResolvedValue(applications);

    await expect(service.findInterviews()).resolves.toEqual(applications);

    expect(prismaServiceMock.application.findMany).toHaveBeenCalledWith({
      where: {
        interviewAt: {
          gte: new Date('2026-08-10T10:00:00.000Z'),
        },
      },
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
      orderBy: {
        interviewAt: 'asc',
      },
    });
  });
});
