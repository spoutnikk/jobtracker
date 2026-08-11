import { apiClient } from "./client";

export type ContractType =
  "CDI" | "CDD" | "INTERNSHIP" | "FREELANCE" | "TEMPORARY" | "OTHER";

interface JobOfferCompany {
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
  company: JobOfferCompany;
}

export interface CreateJobOfferInput {
  title: string;
  companyId: number;
  url?: string;
  description?: string;
  location?: string;
  contractType?: ContractType;
  salary?: string;
  publishedAt?: string;
}

export type UpdateJobOfferInput = Partial<CreateJobOfferInput>;

export async function getJobOffers(): Promise<JobOffer[]> {
  const response = await apiClient.get<JobOffer[]>("/job-offers");

  return response.data;
}

export async function getJobOffer(id: number): Promise<JobOffer> {
  const response = await apiClient.get<JobOffer>(`/job-offers/${id}`);

  return response.data;
}

export async function createJobOffer(
  input: CreateJobOfferInput,
): Promise<JobOffer> {
  const response = await apiClient.post<JobOffer>("/job-offers", input);

  return response.data;
}

export async function updateJobOffer(
  id: number,
  input: UpdateJobOfferInput,
): Promise<JobOffer> {
  const response = await apiClient.patch<JobOffer>(`/job-offers/${id}`, input);

  return response.data;
}

export async function deleteJobOffer(id: number): Promise<JobOffer> {
  const response = await apiClient.delete<JobOffer>(`/job-offers/${id}`);

  return response.data;
}
