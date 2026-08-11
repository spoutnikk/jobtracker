import { Test, TestingModule } from '@nestjs/testing';
import { JobOffersController } from './job-offers.controller';
import { JobOffersService } from './job-offers.service';

describe('JobOffersController', () => {
  let controller: JobOffersController;
  const user = {
    id: 7,
    email: 'user@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
  };

  const jobOffersServiceMock = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobOffersController],
      providers: [
        {
          provide: JobOffersService,
          useValue: jobOffersServiceMock,
        },
      ],
    }).compile();

    controller = module.get<JobOffersController>(JobOffersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return all job offers', async () => {
    const jobOffers = [
      {
        id: 1,
        title: 'Développeur TypeScript',
      },
    ];

    jobOffersServiceMock.findAll.mockResolvedValue(jobOffers);

    const filters = {
      search: 'React',
      page: 2,
      pageSize: 5,
      sortBy: 'title' as const,
      sortOrder: 'asc' as const,
    };

    await expect(controller.findAll(user, filters)).resolves.toEqual(jobOffers);

    expect(jobOffersServiceMock.findAll).toHaveBeenCalledWith(user.id, filters);
  });

  it('should return one job offer', async () => {
    const jobOffer = {
      id: 1,
      title: 'Développeur TypeScript',
      companyId: 2,
      company: {
        id: 2,
        name: 'TechNova',
      },
    };

    jobOffersServiceMock.findOne.mockResolvedValue(jobOffer);

    await expect(controller.findOne(user, 1)).resolves.toEqual(jobOffer);

    expect(jobOffersServiceMock.findOne).toHaveBeenCalledWith(user.id, 1);
  });

  it('should create a job offer', async () => {
    const dto = {
      title: 'Développeur TypeScript',
      companyId: 2,
    };
    const createdJobOffer = {
      id: 1,
      ...dto,
      company: {
        id: 2,
        name: 'TechNova',
      },
    };

    jobOffersServiceMock.create.mockResolvedValue(createdJobOffer);

    await expect(controller.create(user, dto)).resolves.toEqual(
      createdJobOffer,
    );

    expect(jobOffersServiceMock.create).toHaveBeenCalledWith(user.id, dto);
  });

  it('should update a job offer', async () => {
    const dto = {
      title: 'Lead TypeScript',
    };
    const updatedJobOffer = {
      id: 1,
      title: 'Lead TypeScript',
      companyId: 2,
      company: {
        id: 2,
        name: 'TechNova',
      },
    };

    jobOffersServiceMock.update.mockResolvedValue(updatedJobOffer);

    await expect(controller.update(user, 1, dto)).resolves.toEqual(
      updatedJobOffer,
    );

    expect(jobOffersServiceMock.update).toHaveBeenCalledWith(user.id, 1, dto);
  });

  it('should remove a job offer', async () => {
    const removedJobOffer = {
      id: 1,
      title: 'Développeur TypeScript',
      companyId: 2,
      company: {
        id: 2,
        name: 'TechNova',
      },
    };

    jobOffersServiceMock.remove.mockResolvedValue(removedJobOffer);

    await expect(controller.remove(user, 1)).resolves.toEqual(removedJobOffer);

    expect(jobOffersServiceMock.remove).toHaveBeenCalledWith(user.id, 1);
  });
});
