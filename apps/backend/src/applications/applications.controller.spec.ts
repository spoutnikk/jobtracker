import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';

describe('ApplicationsController', () => {
  let controller: ApplicationsController;

  const applicationsServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    findFollowUps: jest.fn(),
    findInterviews: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApplicationsController],
      providers: [
        {
          provide: ApplicationsService,
          useValue: applicationsServiceMock,
        },
      ],
    }).compile();

    controller = module.get<ApplicationsController>(ApplicationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create an application', async () => {
    const dto = {
      userId: 1,
      jobOfferId: 1,
    };

    const application = {
      id: 1,
      ...dto,
    };

    applicationsServiceMock.create.mockResolvedValue(application);

    await expect(controller.create(dto)).resolves.toEqual(application);

    expect(applicationsServiceMock.create).toHaveBeenCalledWith(dto);
  });

  it('should return all applications', async () => {
    const applications = [{ id: 1 }];

    applicationsServiceMock.findAll.mockResolvedValue(applications);

    await expect(controller.findAll()).resolves.toEqual(applications);

    expect(applicationsServiceMock.findAll).toHaveBeenCalledTimes(1);
  });

  it('should return one application', async () => {
    const application = { id: 1 };

    applicationsServiceMock.findOne.mockResolvedValue(application);

    await expect(controller.findOne(1)).resolves.toEqual(application);

    expect(applicationsServiceMock.findOne).toHaveBeenCalledWith(1);
  });

  it('should update an application', async () => {
    const dto = {
      status: 'INTERVIEW' as const,
    };

    const application = {
      id: 1,
      status: 'INTERVIEW',
    };

    applicationsServiceMock.update.mockResolvedValue(application);

    await expect(controller.update(1, dto)).resolves.toEqual(application);

    expect(applicationsServiceMock.update).toHaveBeenCalledWith(1, dto);
  });

  it('should remove an application', async () => {
    const application = {
      id: 1,
    };

    applicationsServiceMock.remove.mockResolvedValue(application);

    await expect(controller.remove(1)).resolves.toEqual(application);

    expect(applicationsServiceMock.remove).toHaveBeenCalledWith(1);
  });

  it('should return upcoming follow-ups', async () => {
    const applications = [
      {
        id: 1,
        followUpAt: '2026-08-15T10:00:00.000Z',
      },
    ];

    applicationsServiceMock.findFollowUps.mockResolvedValue(applications);

    await expect(controller.findFollowUps()).resolves.toEqual(applications);

    expect(applicationsServiceMock.findFollowUps).toHaveBeenCalledTimes(1);
  });

  it('should return upcoming interviews', async () => {
    const applications = [
      {
        id: 1,
        interviewAt: '2026-08-20T14:00:00.000Z',
      },
    ];

    applicationsServiceMock.findInterviews.mockResolvedValue(applications);

    await expect(controller.findInterviews()).resolves.toEqual(applications);

    expect(applicationsServiceMock.findInterviews).toHaveBeenCalledTimes(1);
  });
});
