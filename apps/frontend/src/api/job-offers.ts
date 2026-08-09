import { apiClient } from "./client";
import type { Company, ContractType } from "./applications";

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

export async function getJobOffers(): Promise<JobOffer[]> {
  const response = await apiClient.get<JobOffer[]>("/job-offers");

  return response.data;
}
