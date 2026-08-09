import { Test, TestingModule } from '@nestjs/testing';
import { JobOffersController } from './job-offers.controller';
import { JobOffersService } from './job-offers.service';

describe('JobOffersController', () => {
  let controller: JobOffersController;

  const jobOffersServiceMock = {
    findAll: jest.fn(),
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
});
