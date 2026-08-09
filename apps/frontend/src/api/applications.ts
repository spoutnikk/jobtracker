import { apiClient } from "./client";

export type ApplicationStatus =
  "DRAFT" | "APPLIED" | "FOLLOW_UP" | "INTERVIEW" | "ACCEPTED" | "REJECTED";

export type ContractType =
  "CDI" | "CDD" | "INTERNSHIP" | "FREELANCE" | "TEMPORARY" | "OTHER";

export interface Company {
  id: number;
  name: string;
  website: string | null;
  city: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobOffer {
  id: number;
  title: string;
  url: string | null;
  description: string | null;
  location: string | null;
  contractType: ContractType | null;
  salary: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  companyId: number;
  company: Company;
}

export interface Application {
  id: number;
  status: ApplicationStatus;
  appliedAt: string | null;
  source: string | null;
  notes: string | null;
  contactName: string | null;
  contactEmail: string | null;
  followUpAt: string | null;
  interviewAt: string | null;
  createdAt: string;
  updatedAt: string;
  userId: number;
  jobOfferId: number;
  jobOffer: JobOffer;
}

export async function getApplications(): Promise<Application[]> {
  const response = await apiClient.get<Application[]>("/applications");

  return response.data;
}
