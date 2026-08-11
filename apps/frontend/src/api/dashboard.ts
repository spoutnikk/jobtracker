import { apiClient } from "./client";
import type { ApplicationStatus } from "./applications";

export interface ApplicationsByStatus {
  status: ApplicationStatus;
  count: number;
}

export interface DashboardStats {
  totalApplications: number;
  totalCompanies: number;
  totalJobOffers: number;
  upcomingFollowUps: number;
  upcomingInterviews: number;
  recentApplications: number;
  applicationsLast7Days: number;
  applicationsLast30Days: number;
  upcomingFollowUps7Days: number;
  upcomingInterviews7Days: number;
  interviewRate: number;
  applicationsByStatus: ApplicationsByStatus[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const response = await apiClient.get<DashboardStats>("/dashboard/stats");

  return response.data;
}
