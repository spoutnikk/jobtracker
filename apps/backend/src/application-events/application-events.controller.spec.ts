import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationEventsController } from './application-events.controller';
import { ApplicationEventsService } from './application-events.service';

describe('ApplicationEventsController', () => {
  let controller: ApplicationEventsController;
  const user = {
    id: 7,
    email: 'user@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
  };

  const applicationEventsServiceMock = {
    create: jest.fn(),
    findByApplication: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApplicationEventsController],
      providers: [
        {
          provide: ApplicationEventsService,
          useValue: applicationEventsServiceMock,
        },
      ],
    }).compile();

    controller = module.get<ApplicationEventsController>(
      ApplicationEventsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create an application event', async () => {
    const dto = {
      applicationId: 4,
      type: 'NOTE' as const,
      title: 'Premier événement manuel',
      description: 'Test du journal de candidature',
    };

    const event = {
      id: 1,
      ...dto,
      occurredAt: '2026-08-10T23:33:44.237Z',
      createdAt: '2026-08-10T23:33:44.237Z',
    };

    applicationEventsServiceMock.create.mockResolvedValue(event);

    await expect(controller.create(user, dto)).resolves.toEqual(event);

    expect(applicationEventsServiceMock.create).toHaveBeenCalledWith(
      user.id,
      dto,
    );
  });

  it('should return events for one application', async () => {
    const events = [
      {
        id: 1,
        applicationId: 4,
        type: 'NOTE',
        title: 'Premier événement manuel',
      },
    ];

    applicationEventsServiceMock.findByApplication.mockResolvedValue(events);

    await expect(controller.findByApplication(user, 4)).resolves.toEqual(
      events,
    );

    expect(applicationEventsServiceMock.findByApplication).toHaveBeenCalledWith(
      user.id,
      4,
    );
  });
});
