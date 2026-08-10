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

export async function getCompanies(): Promise<Company[]> {
  const response = await apiClient.get<Company[]>("/companies");

  return response.data;
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
