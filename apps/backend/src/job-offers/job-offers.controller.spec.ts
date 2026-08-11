import { Test, TestingModule } from '@nestjs/testing';
import { JobOffersController } from './job-offers.controller';
import { JobOffersService } from './job-offers.service';

describe('JobOffersController', () => {
  let controller: JobOffersController;

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

    await expect(controller.findAll()).resolves.toEqual(jobOffers);

    expect(jobOffersServiceMock.findAll).toHaveBeenCalledTimes(1);
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

    await expect(controller.findOne(1)).resolves.toEqual(jobOffer);

    expect(jobOffersServiceMock.findOne).toHaveBeenCalledWith(1);
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

    await expect(controller.create(dto)).resolves.toEqual(createdJobOffer);

    expect(jobOffersServiceMock.create).toHaveBeenCalledWith(dto);
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

    await expect(controller.update(1, dto)).resolves.toEqual(updatedJobOffer);

    expect(jobOffersServiceMock.update).toHaveBeenCalledWith(1, dto);
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

    await expect(controller.remove(1)).resolves.toEqual(removedJobOffer);

    expect(jobOffersServiceMock.remove).toHaveBeenCalledWith(1);
  });
});
