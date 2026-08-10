import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
  let controller: DashboardController;

  const dashboardServiceMock = {
    getStats: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: DashboardService,
          useValue: dashboardServiceMock,
        },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return dashboard statistics', async () => {
    const stats = {
      totalApplications: 2,
      totalCompanies: 3,
      totalJobOffers: 1,
      upcomingFollowUps: 1,
      upcomingInterviews: 1,
      applicationsByStatus: [
        {
          status: 'DRAFT',
          count: 1,
        },
        {
          status: 'APPLIED',
          count: 1,
        },
      ],
    };

    dashboardServiceMock.getStats.mockResolvedValue(stats);

    await expect(controller.getStats()).resolves.toEqual(stats);

    expect(dashboardServiceMock.getStats).toHaveBeenCalledTimes(1);
  });
});
