import type {
  ApplicationEventType,
  PaginatedResponse,
} from "@jobtracker/shared";
import { apiClient } from "./client";

export type { ApplicationEventType };

export interface ApplicationEvent {
  id: number;
  type: ApplicationEventType;
  title: string;
  description: string | null;
  occurredAt: string;
  createdAt: string;
  applicationId: number;
}

export interface CreateApplicationEventInput {
  applicationId: number;
  type: ApplicationEventType;
  title: string;
  description?: string;
  occurredAt?: string;
}

export interface ApplicationEventFilters {
  page?: number;
  pageSize?: number;
}

export type PaginatedApplicationEvents = PaginatedResponse<ApplicationEvent>;

export async function getApplicationEvents(
  applicationId: number,
  filters: ApplicationEventFilters = {},
): Promise<PaginatedApplicationEvents> {
  const response = await apiClient.get<PaginatedApplicationEvents>(
    `/application-events/application/${applicationId}`,
    {
      params: filters,
    },
  );

  return response.data;
}

export async function createApplicationEvent(
  input: CreateApplicationEventInput,
): Promise<ApplicationEvent> {
  const response = await apiClient.post<ApplicationEvent>(
    "/application-events",
    input,
  );

  return response.data;
}
