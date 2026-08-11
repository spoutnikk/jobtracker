import { Injectable } from '@nestjs/common';
import { ApplicationStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const weekInMilliseconds = 7 * 24 * 60 * 60 * 1000;

function startOfUtcWeek(date: Date): Date {
  const weekStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;

  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);

  return weekStart;
}

function addUtcWeeks(date: Date, delta: number): Date {
  return new Date(date.getTime() + delta * weekInMilliseconds);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: number) {
    const now = new Date();
    const dayInMilliseconds = 24 * 60 * 60 * 1000;
    const sevenDaysAgo = new Date(now.getTime() - 7 * dayInMilliseconds);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * dayInMilliseconds);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * dayInMilliseconds);
    const currentWeekStart = startOfUtcWeek(now);
    const oldestWeekStart = addUtcWeeks(currentWeekStart, -7);
    const nextWeekStart = addUtcWeeks(currentWeekStart, 1);

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
      weeklyApplicationDates,
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

      this.prisma.application.findMany({
        where: {
          userId,
          createdAt: {
            gte: oldestWeekStart,
            lt: nextWeekStart,
          },
        },
        select: {
          createdAt: true,
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

    const weeklyApplications = Array.from({ length: 8 }, (_, index) => ({
      weekStart: addUtcWeeks(oldestWeekStart, index).toISOString(),
      count: 0,
    }));

    for (const application of weeklyApplicationDates) {
      const bucketIndex = Math.floor(
        (application.createdAt.getTime() - oldestWeekStart.getTime()) /
          weekInMilliseconds,
      );
      const bucket = weeklyApplications[bucketIndex];

      if (bucket) {
        bucket.count += 1;
      }
    }

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
      weeklyApplications,
    };
  }
}
