import { apiClient } from "./client";
import type { JobOffer } from "./job-offers";

export interface Company {
  id: number;
  name: string;
  website: string | null;
  city: string | null;
  createdAt: string;
  updatedAt: string;
  jobOffers: JobOffer[];
}

export interface CreateCompanyInput {
  name: string;
  website?: string;
  city?: string;
}

export type UpdateCompanyInput = Partial<CreateCompanyInput>;

export type CompanySortBy = "name" | "createdAt" | "updatedAt";
export type CompanySortOrder = "asc" | "desc";

export interface CompanyFilters {
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: CompanySortBy;
  sortOrder?: CompanySortOrder;
}

export interface PaginatedCompanies {
  items: Company[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function getCompanies(
  filters?: CompanyFilters,
): Promise<PaginatedCompanies> {
  const response = await apiClient.get<PaginatedCompanies>("/companies", {
    params: filters,
  });

  return response.data;
}

export async function getAllCompanies(): Promise<Company[]> {
  const firstPage = await getCompanies({ page: 1, pageSize: 50 });

  if (firstPage.totalPages <= 1) {
    return firstPage.items;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
      getCompanies({ page: index + 2, pageSize: 50 }),
    ),
  );

  return [...firstPage.items, ...remainingPages.flatMap((page) => page.items)];
}

export async function createCompany(
  input: CreateCompanyInput,
): Promise<Company> {
  const response = await apiClient.post<Company>("/companies", input);

  return response.data;
}

export async function updateCompany(
  id: number,
  input: UpdateCompanyInput,
): Promise<Company> {
  const response = await apiClient.patch<Company>(`/companies/${id}`, input);

  return response.data;
}

export async function deleteCompany(id: number): Promise<Company> {
  const response = await apiClient.delete<Company>(`/companies/${id}`);

  return response.data;
}
