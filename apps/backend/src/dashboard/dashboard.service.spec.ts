import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;

  const prismaServiceMock = {
    application: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
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
      .mockResolvedValueOnce(1) // applicationsLast7Days
      .mockResolvedValueOnce(2) // applicationsLast30Days
      .mockResolvedValueOnce(1) // upcomingFollowUps7Days
      .mockResolvedValueOnce(1) // upcomingInterviews7Days
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
    prismaServiceMock.application.findMany.mockResolvedValue([
      { createdAt: new Date('2026-06-22T00:00:00.000Z') },
      { createdAt: new Date('2026-08-10T12:00:00.000Z') },
      { createdAt: new Date('2026-08-11T10:00:00.000Z') },
    ]);

    await expect(service.getStats(7)).resolves.toEqual({
      totalApplications: 2,
      totalCompanies: 3,
      totalJobOffers: 1,
      upcomingFollowUps: 1,
      upcomingInterviews: 1,
      recentApplications: 2,
      applicationsLast7Days: 1,
      applicationsLast30Days: 2,
      upcomingFollowUps7Days: 1,
      upcomingInterviews7Days: 1,
      interviewRate: 50,
      applicationsByStatus: [
        { status: 'DRAFT', count: 1 },
        { status: 'APPLIED', count: 1 },
        { status: 'FOLLOW_UP', count: 0 },
        { status: 'INTERVIEW', count: 0 },
        { status: 'ACCEPTED', count: 0 },
        { status: 'REJECTED', count: 0 },
      ],
      weeklyApplications: [
        { weekStart: '2026-06-22T00:00:00.000Z', count: 1 },
        { weekStart: '2026-06-29T00:00:00.000Z', count: 0 },
        { weekStart: '2026-07-06T00:00:00.000Z', count: 0 },
        { weekStart: '2026-07-13T00:00:00.000Z', count: 0 },
        { weekStart: '2026-07-20T00:00:00.000Z', count: 0 },
        { weekStart: '2026-07-27T00:00:00.000Z', count: 0 },
        { weekStart: '2026-08-03T00:00:00.000Z', count: 0 },
        { weekStart: '2026-08-10T00:00:00.000Z', count: 2 },
      ],
    });

    expect(prismaServiceMock.application.count).toHaveBeenCalledTimes(8);
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
          gte: new Date('2026-08-04T10:00:00.000Z'),
          lte: new Date('2026-08-11T10:00:00.000Z'),
        },
      },
    });
    expect(prismaServiceMock.application.count).toHaveBeenNthCalledWith(5, {
      where: {
        userId: 7,
        createdAt: {
          gte: new Date('2026-07-12T10:00:00.000Z'),
          lte: new Date('2026-08-11T10:00:00.000Z'),
        },
      },
    });
    expect(prismaServiceMock.application.count).toHaveBeenNthCalledWith(6, {
      where: {
        userId: 7,
        followUpAt: {
          gte: new Date('2026-08-11T10:00:00.000Z'),
          lte: new Date('2026-08-18T10:00:00.000Z'),
        },
      },
    });
    expect(prismaServiceMock.application.count).toHaveBeenNthCalledWith(7, {
      where: {
        userId: 7,
        interviewAt: {
          gte: new Date('2026-08-11T10:00:00.000Z'),
          lte: new Date('2026-08-18T10:00:00.000Z'),
        },
      },
    });
    expect(prismaServiceMock.application.count).toHaveBeenNthCalledWith(8, {
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
    expect(prismaServiceMock.application.findMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
        createdAt: {
          gte: new Date('2026-06-22T00:00:00.000Z'),
          lt: new Date('2026-08-17T00:00:00.000Z'),
        },
      },
      select: {
        createdAt: true,
      },
    });
  });

  it('builds UTC weekly buckets across a month and year boundary', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-02T18:00:00.000Z'));

    prismaServiceMock.application.count.mockResolvedValue(0);
    prismaServiceMock.company.count.mockResolvedValue(0);
    prismaServiceMock.jobOffer.count.mockResolvedValue(0);
    prismaServiceMock.application.groupBy.mockResolvedValue([]);
    prismaServiceMock.application.findMany.mockResolvedValue([
      { createdAt: new Date('2025-11-10T00:00:00.000Z') },
      { createdAt: new Date('2025-12-24T12:00:00.000Z') },
      { createdAt: new Date('2025-12-29T00:00:00.000Z') },
      { createdAt: new Date('2026-01-02T18:00:00.000Z') },
    ]);

    const result = await service.getStats(19);

    expect(result.weeklyApplications).toEqual([
      { weekStart: '2025-11-10T00:00:00.000Z', count: 1 },
      { weekStart: '2025-11-17T00:00:00.000Z', count: 0 },
      { weekStart: '2025-11-24T00:00:00.000Z', count: 0 },
      { weekStart: '2025-12-01T00:00:00.000Z', count: 0 },
      { weekStart: '2025-12-08T00:00:00.000Z', count: 0 },
      { weekStart: '2025-12-15T00:00:00.000Z', count: 0 },
      { weekStart: '2025-12-22T00:00:00.000Z', count: 1 },
      { weekStart: '2025-12-29T00:00:00.000Z', count: 2 },
    ]);
    expect(prismaServiceMock.application.findMany).toHaveBeenCalledWith({
      where: {
        userId: 19,
        createdAt: {
          gte: new Date('2025-11-10T00:00:00.000Z'),
          lt: new Date('2026-01-05T00:00:00.000Z'),
        },
      },
      select: { createdAt: true },
    });
  });

  it('returns a zero interview rate when there are no applications', async () => {
    prismaServiceMock.application.count.mockResolvedValue(0);
    prismaServiceMock.company.count.mockResolvedValue(0);
    prismaServiceMock.jobOffer.count.mockResolvedValue(0);
    prismaServiceMock.application.groupBy.mockResolvedValue([]);
    prismaServiceMock.application.findMany.mockResolvedValue([]);

    await expect(service.getStats(7)).resolves.toMatchObject({
      totalApplications: 0,
      interviewRate: 0,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });
});
