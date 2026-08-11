import { Injectable } from '@nestjs/common';
import { ApplicationStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: number) {
    const now = new Date();

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalApplications,
      totalCompanies,
      totalJobOffers,
      upcomingFollowUps,
      upcomingInterviews,
      recentApplications,
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
            gte: thirtyDaysAgo,
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
        : Math.round((applicationsWithInterview / totalApplications) * 100);

    return {
      totalApplications,
      totalCompanies,
      totalJobOffers,
      upcomingFollowUps,
      upcomingInterviews,
      recentApplications,
      interviewRate,
      applicationsByStatus: completeApplicationsByStatus,
    };
  }
}
