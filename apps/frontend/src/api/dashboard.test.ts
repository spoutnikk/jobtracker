import { describe, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import { getDashboardStats, type DashboardStats } from "./dashboard";

vi.mock("./client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const dashboardStats: DashboardStats = {
  totalApplications: 12,
  totalCompanies: 5,
  totalJobOffers: 8,
  overdueFollowUps: 1,
  upcomingFollowUps: 2,
  upcomingInterviews: 1,
  recentApplications: 3,
  applicationsLast7Days: 4,
  applicationsLast30Days: 9,
  upcomingFollowUps7Days: 2,
  upcomingInterviews7Days: 1,
  interviewRate: 25,
  applicationsByStatus: [],
  weeklyApplications: [],
  nextFollowUps: [],
  nextInterviews: [],
};

describe("dashboard API", () => {
  it("loads dashboard statistics", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: dashboardStats,
    });

    await expect(getDashboardStats()).resolves.toEqual(dashboardStats);

    expect(apiClient.get).toHaveBeenCalledWith("/dashboard/stats");
  });
});
