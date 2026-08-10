import { apiClient } from "./client";

export type DocumentType = "CV" | "COVER_LETTER" | "JOB_OFFER" | "OTHER";

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

export async function getDocuments(): Promise<Document[]> {
  const response = await apiClient.get<Document[]>("/documents");

  return response.data;
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

export function getDocumentDownloadUrl(id: number) {
  return `http://localhost:3000/documents/${id}/download`;
}
