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

export interface ApplicationFilters {
  status?: ApplicationStatus;
  companyId?: number;
  jobOfferId?: number;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: ApplicationSortBy;
  sortOrder?: SortOrder;
}

export type ApplicationSortBy =
  | "createdAt"
  | "updatedAt"
  | "appliedAt"
  | "followUpAt"
  | "interviewAt"
  | "status";

export type SortOrder = "asc" | "desc";

export interface PaginatedApplications {
  items: Application[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function getApplications(
  filters?: ApplicationFilters,
): Promise<PaginatedApplications> {
  const response = await apiClient.get<PaginatedApplications>("/applications", {
    params: filters,
  });

  return response.data;
}

export async function getAllApplications(): Promise<Application[]> {
  const firstPage = await getApplications({ page: 1, pageSize: 50 });

  if (firstPage.totalPages <= 1) {
    return firstPage.items;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
      getApplications({ page: index + 2, pageSize: 50 }),
    ),
  );

  return [...firstPage.items, ...remainingPages.flatMap((page) => page.items)];
}

export interface CreateApplicationInput {
  jobOfferId: number;
  status?: ApplicationStatus;
  appliedAt?: string;
  source?: string;
  notes?: string;
  contactName?: string;
  contactEmail?: string;
  followUpAt?: string;
  interviewAt?: string;
}

export async function createApplication(
  input: CreateApplicationInput,
): Promise<Application> {
  const response = await apiClient.post<Application>("/applications", input);

  return response.data;
}

export type UpdateApplicationInput = Partial<
  Omit<CreateApplicationInput, "jobOfferId">
>;

export async function updateApplication(
  id: number,
  input: UpdateApplicationInput,
): Promise<Application> {
  const response = await apiClient.patch<Application>(
    `/applications/${id}`,
    input,
  );

  return response.data;
}

export async function deleteApplication(id: number): Promise<Application> {
  const response = await apiClient.delete<Application>(`/applications/${id}`);

  return response.data;
}

export async function getFollowUps(): Promise<Application[]> {
  const response = await apiClient.get<Application[]>(
    "/applications/follow-ups",
  );

  return response.data;
}

export async function getInterviews(): Promise<Application[]> {
  const response = await apiClient.get<Application[]>(
    "/applications/interviews",
  );

  return response.data;
}
