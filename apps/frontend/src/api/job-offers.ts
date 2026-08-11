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

export type JobOfferSortBy =
  "createdAt" | "updatedAt" | "publishedAt" | "title";
export type JobOfferSortOrder = "asc" | "desc";

export interface FindJobOffersParams {
  search?: string;
  companyId?: number;
  contractType?: ContractType;
  page?: number;
  pageSize?: number;
  sortBy?: JobOfferSortBy;
  sortOrder?: JobOfferSortOrder;
}

export interface PaginatedJobOffers {
  items: JobOffer[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function getJobOffers(
  params?: FindJobOffersParams,
): Promise<PaginatedJobOffers> {
  const response = await apiClient.get<PaginatedJobOffers>("/job-offers", {
    params,
  });

  return response.data;
}

export async function getAllJobOffers(): Promise<JobOffer[]> {
  const firstPage = await getJobOffers({ page: 1, pageSize: 50 });

  if (firstPage.totalPages <= 1) {
    return firstPage.items;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
      getJobOffers({ page: index + 2, pageSize: 50 }),
    ),
  );

  return [...firstPage.items, ...remainingPages.flatMap((page) => page.items)];
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
