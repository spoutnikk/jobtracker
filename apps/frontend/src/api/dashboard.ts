import { apiClient } from "./client";
import type { ApplicationStatus } from "./applications";

export interface ApplicationsByStatus {
  status: ApplicationStatus;
  count: number;
}

export interface WeeklyApplications {
  weekStart: string;
  count: number;
}

export interface UpcomingFollowUp {
  applicationId: number;
  companyName: string;
  jobTitle: string;
  followUpAt: string;
}

export interface UpcomingInterview {
  applicationId: number;
  companyName: string;
  jobTitle: string;
  interviewAt: string;
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
  weeklyApplications: WeeklyApplications[];
  nextFollowUps: UpcomingFollowUp[];
  nextInterviews: UpcomingInterview[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const response = await apiClient.get<DashboardStats>("/dashboard/stats");

  return response.data;
}
