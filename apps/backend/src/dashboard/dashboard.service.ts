import { Injectable } from '@nestjs/common';
import { ApplicationStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: number) {
    const now = new Date();
    const dayInMilliseconds = 24 * 60 * 60 * 1000;
    const sevenDaysAgo = new Date(now.getTime() - 7 * dayInMilliseconds);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * dayInMilliseconds);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * dayInMilliseconds);

    const [
      totalApplications,
      totalCompanies,
      totalJobOffers,
      upcomingFollowUps,
      upcomingInterviews,
      applicationsLast7Days,
      applicationsLast30Days,
      upcomingFollowUps7Days,
      upcomingInterviews7Days,
      applicationsWithInterview,
      applicationsByStatus,
    ] = await Promise.all([
      this.prisma.application.count({
        where: {
          userId,
        },
      }),

      this.prisma.company.count({
        where: {
          userId,
        },
      }),

      this.prisma.jobOffer.count({
        where: {
          company: {
            userId,
          },
        },
      }),

      this.prisma.application.count({
        where: {
          userId,
          followUpAt: {
            gte: now,
          },
        },
      }),

      this.prisma.application.count({
        where: {
          userId,
          interviewAt: {
            gte: now,
          },
        },
      }),

      this.prisma.application.count({
        where: {
          userId,
          createdAt: {
            gte: sevenDaysAgo,
            lte: now,
          },
        },
      }),

      this.prisma.application.count({
        where: {
          userId,
          createdAt: {
            gte: thirtyDaysAgo,
            lte: now,
          },
        },
      }),

      this.prisma.application.count({
        where: {
          userId,
          followUpAt: {
            gte: now,
            lte: sevenDaysFromNow,
          },
        },
      }),

      this.prisma.application.count({
        where: {
          userId,
          interviewAt: {
            gte: now,
            lte: sevenDaysFromNow,
          },
        },
      }),

      this.prisma.application.count({
        where: {
          userId,
          interviewAt: {
            not: null,
          },
        },
      }),

      this.prisma.application.groupBy({
        by: ['status'],
        where: {
          userId,
        },
        _count: {
          status: true,
        },
      }),
    ]);

    const applicationStatuses = Object.values(ApplicationStatus);

    const completeApplicationsByStatus = applicationStatuses.map((status) => {
      const item = applicationsByStatus.find(
        (application) => application.status === status,
      );

      return {
        status,
        count: item?._count.status ?? 0,
      };
    });

    const interviewRate =
      totalApplications === 0
        ? 0
        : (applicationsWithInterview / totalApplications) * 100;

    return {
      totalApplications,
      totalCompanies,
      totalJobOffers,
      upcomingFollowUps,
      upcomingInterviews,
      recentApplications: applicationsLast30Days,
      applicationsLast7Days,
      applicationsLast30Days,
      upcomingFollowUps7Days,
      upcomingInterviews7Days,
      interviewRate,
      applicationsByStatus: completeApplicationsByStatus,
    };
  }
}
