import { Injectable } from '@nestjs/common';
import { ApplicationStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
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
      this.prisma.application.count(),

      this.prisma.company.count(),

      this.prisma.jobOffer.count(),

      this.prisma.application.count({
        where: {
          followUpAt: {
            gte: now,
          },
        },
      }),

      this.prisma.application.count({
        where: {
          interviewAt: {
            gte: now,
          },
        },
      }),

      this.prisma.application.count({
        where: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
        },
      }),

      this.prisma.application.count({
        where: {
          interviewAt: {
            not: null,
          },
        },
      }),

      this.prisma.application.groupBy({
        by: ['status'],
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
