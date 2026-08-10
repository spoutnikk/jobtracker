import { apiClient } from "./client";

export type ApplicationEventType =
  | "CREATED"
  | "STATUS_CHANGED"
  | "APPLICATION_SENT"
  | "FOLLOW_UP"
  | "INTERVIEW"
  | "DOCUMENT_ADDED"
  | "NOTE"
  | "OTHER";

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

export async function getApplicationEvents(
  applicationId: number,
): Promise<ApplicationEvent[]> {
  const response = await apiClient.get<ApplicationEvent[]>(
    `/application-events/application/${applicationId}`,
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
