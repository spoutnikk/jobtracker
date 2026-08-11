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
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-11T10:00:00.000Z'));

    prismaServiceMock.application.count
      .mockResolvedValueOnce(2) // totalApplications
      .mockResolvedValueOnce(1) // upcomingFollowUps
      .mockResolvedValueOnce(1) // upcomingInterviews
      .mockResolvedValueOnce(2) // recentApplications
      .mockResolvedValueOnce(1); // applicationsWithInterview

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

    await expect(service.getStats(7)).resolves.toEqual({
      totalApplications: 2,
      totalCompanies: 3,
      totalJobOffers: 1,
      upcomingFollowUps: 1,
      upcomingInterviews: 1,
      recentApplications: 2,
      interviewRate: 50,
      applicationsByStatus: [
        { status: 'DRAFT', count: 1 },
        { status: 'APPLIED', count: 1 },
        { status: 'FOLLOW_UP', count: 0 },
        { status: 'INTERVIEW', count: 0 },
        { status: 'ACCEPTED', count: 0 },
        { status: 'REJECTED', count: 0 },
      ],
    });

    expect(prismaServiceMock.application.count).toHaveBeenCalledTimes(5);
    expect(prismaServiceMock.application.count).toHaveBeenNthCalledWith(1, {
      where: {
        userId: 7,
      },
    });
    expect(prismaServiceMock.application.count).toHaveBeenNthCalledWith(2, {
      where: {
        userId: 7,
        followUpAt: {
          gte: new Date('2026-08-11T10:00:00.000Z'),
        },
      },
    });
    expect(prismaServiceMock.application.count).toHaveBeenNthCalledWith(3, {
      where: {
        userId: 7,
        interviewAt: {
          gte: new Date('2026-08-11T10:00:00.000Z'),
        },
      },
    });
    expect(prismaServiceMock.application.count).toHaveBeenNthCalledWith(4, {
      where: {
        userId: 7,
        createdAt: {
          gte: new Date('2026-07-12T10:00:00.000Z'),
        },
      },
    });
    expect(prismaServiceMock.application.count).toHaveBeenNthCalledWith(5, {
      where: {
        userId: 7,
        interviewAt: {
          not: null,
        },
      },
    });
    expect(prismaServiceMock.company.count).toHaveBeenCalledWith({
      where: {
        userId: 7,
      },
    });
    expect(prismaServiceMock.jobOffer.count).toHaveBeenCalledWith({
      where: {
        company: {
          userId: 7,
        },
      },
    });

    expect(prismaServiceMock.application.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: {
        userId: 7,
      },
      _count: {
        status: true,
      },
    });
  });
});
