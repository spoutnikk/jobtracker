import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;

  const prismaServiceMock = {
    application: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    company: {
      count: jest.fn(),
    },
    jobOffer: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return dashboard statistics', async () => {
    prismaServiceMock.application.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    prismaServiceMock.company.count.mockResolvedValue(3);
    prismaServiceMock.jobOffer.count.mockResolvedValue(1);

    prismaServiceMock.application.groupBy.mockResolvedValue([
      {
        status: 'DRAFT',
        _count: {
          status: 1,
        },
      },
      {
        status: 'APPLIED',
        _count: {
          status: 1,
        },
      },
    ]);

    await expect(service.getStats()).resolves.toEqual({
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
    });

    expect(prismaServiceMock.application.count).toHaveBeenCalledTimes(3);
    expect(prismaServiceMock.company.count).toHaveBeenCalledTimes(1);
    expect(prismaServiceMock.jobOffer.count).toHaveBeenCalledTimes(1);

    expect(prismaServiceMock.application.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      _count: {
        status: true,
      },
    });
  });
});
