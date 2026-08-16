export type ApplicationStatus =
  "DRAFT" | "APPLIED" | "FOLLOW_UP" | "INTERVIEW" | "ACCEPTED" | "REJECTED";

export type ApplicationEventType =
  | "CREATED"
  | "STATUS_CHANGED"
  | "APPLICATION_SENT"
  | "FOLLOW_UP"
  | "INTERVIEW"
  | "DOCUMENT_ADDED"
  | "NOTE"
  | "OTHER";

export type ContractType =
  "CDI" | "CDD" | "INTERNSHIP" | "FREELANCE" | "TEMPORARY" | "OTHER";

export type DocumentType = "CV" | "COVER_LETTER" | "JOB_OFFER" | "OTHER";

export type SortOrder = "asc" | "desc";

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
