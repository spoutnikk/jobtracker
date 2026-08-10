import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const now = new Date();

    const [
      totalApplications,
      totalCompanies,
      totalJobOffers,
      upcomingFollowUps,
      upcomingInterviews,
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
      this.prisma.application.groupBy({
        by: ['status'],
        _count: {
          status: true,
        },
      }),
    ]);

    return {
      totalApplications,
      totalCompanies,
      totalJobOffers,
      upcomingFollowUps,
      upcomingInterviews,
      applicationsByStatus: applicationsByStatus.map((item) => ({
        status: item.status,
        count: item._count.status,
      })),
    };
  }
}
