import type {
  DocumentType,
  PaginatedResponse,
  SortOrder,
} from "@jobtracker/shared";
import { apiClient } from "./client";

export type { DocumentType, SortOrder };

export type DocumentSortField = "createdAt" | "updatedAt" | "name" | "type";

export interface DocumentApplication {
  id: number;
  jobOffer: {
    id: number;
    title: string;
    company: {
      id: number;
      name: string;
    };
  };
}

export interface Document {
  id: number;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  type: DocumentType;
  createdAt: string;
  updatedAt: string;
  applicationId: number | null;
  application: DocumentApplication | null;
}

export interface CreateDocumentInput {
  file: File;
  name: string;
  type: DocumentType;
  applicationId?: number;
}

export interface DocumentFilters {
  search?: string;
  type?: DocumentType;
  applicationId?: number;
  page?: number;
  pageSize?: number;
  sortBy?: DocumentSortField;
  sortOrder?: SortOrder;
}

export type PaginatedDocuments = PaginatedResponse<Document>;

export async function getDocuments(
  filters?: DocumentFilters,
): Promise<PaginatedDocuments> {
  const response = filters
    ? await apiClient.get<PaginatedDocuments>("/documents", {
        params: filters,
      })
    : await apiClient.get<PaginatedDocuments>("/documents");

  return response.data;
}

export async function getAllDocuments(
  filters: Omit<DocumentFilters, "page" | "pageSize"> = {},
): Promise<Document[]> {
  const firstPage = await getDocuments({
    ...filters,
    page: 1,
    pageSize: 50,
  });

  if (firstPage.totalPages <= 1) {
    return firstPage.items;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
      getDocuments({
        ...filters,
        page: index + 2,
        pageSize: 50,
      }),
    ),
  );

  return [...firstPage.items, ...remainingPages.flatMap((page) => page.items)];
}

export async function uploadDocument(
  input: CreateDocumentInput,
): Promise<Document> {
  const formData = new FormData();

  formData.append("file", input.file);
  formData.append("name", input.name);
  formData.append("type", input.type);

  if (input.applicationId !== undefined) {
    formData.append("applicationId", String(input.applicationId));
  }

  const response = await apiClient.post<Document>("/documents", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}

export async function deleteDocument(id: number): Promise<Document> {
  const response = await apiClient.delete<Document>(`/documents/${id}`);

  return response.data;
}

export function canPreviewDocument(mimeType: string): boolean {
  return mimeType === "application/pdf" || mimeType === "text/plain";
}

export async function getDocumentPreview(id: number): Promise<Blob> {
  const response = await apiClient.get<Blob>(`/documents/${id}/download`, {
    responseType: "blob",
  });

  return response.data;
}

export async function downloadDocument(
  id: number,
  originalName: string,
): Promise<void> {
  const response = await apiClient.get<Blob>(`/documents/${id}/download`, {
    responseType: "blob",
  });

  const objectUrl = URL.createObjectURL(response.data);
  const anchor = window.document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = originalName;
  anchor.style.display = "none";

  window.document.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }
}
