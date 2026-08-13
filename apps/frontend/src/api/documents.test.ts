import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import {
  canPreviewDocument,
  downloadDocument,
  getDocumentPreview,
  getAllDocuments,
  getDocuments,
  type Document,
  type PaginatedDocuments,
} from "./documents";

vi.mock("./client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const documentA: Document = {
  id: 1,
  name: "CV principal",
  originalName: "cv-principal.pdf",
  mimeType: "application/pdf",
  size: 1024,
  path: "uploads/cv-principal.pdf",
  type: "CV",
  createdAt: "2026-08-12T08:00:00.000Z",
  updatedAt: "2026-08-12T08:00:00.000Z",
  applicationId: 42,
  application: null,
};

const documentB: Document = {
  ...documentA,
  id: 2,
  name: "Lettre de motivation",
  originalName: "lettre.pdf",
  type: "COVER_LETTER",
};

function response(data: PaginatedDocuments): AxiosResponse<PaginatedDocuments> {
  const config: InternalAxiosRequestConfig = {
    headers: new AxiosHeaders(),
  };

  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  };
}

describe("documents API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the default documents page without filters", async () => {
    const page: PaginatedDocuments = {
      items: [documentA],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    };

    vi.mocked(apiClient.get).mockResolvedValue(response(page));

    await expect(getDocuments()).resolves.toBe(page);

    expect(apiClient.get).toHaveBeenCalledWith("/documents");
  });

  it("sends all supported document filters", async () => {
    const page: PaginatedDocuments = {
      items: [documentA],
      page: 2,
      pageSize: 25,
      total: 26,
      totalPages: 2,
    };

    vi.mocked(apiClient.get).mockResolvedValue(response(page));

    await expect(
      getDocuments({
        search: "react",
        type: "CV",
        applicationId: 42,
        page: 2,
        pageSize: 25,
        sortBy: "name",
        sortOrder: "asc",
      }),
    ).resolves.toBe(page);

    expect(apiClient.get).toHaveBeenCalledWith("/documents", {
      params: {
        search: "react",
        type: "CV",
        applicationId: 42,
        page: 2,
        pageSize: 25,
        sortBy: "name",
        sortOrder: "asc",
      },
    });
  });

  it("returns the first page directly when every document fits in one page", async () => {
    const page: PaginatedDocuments = {
      items: [documentA, documentB],
      page: 1,
      pageSize: 50,
      total: 2,
      totalPages: 1,
    };

    vi.mocked(apiClient.get).mockResolvedValue(response(page));

    await expect(getAllDocuments({ applicationId: 42 })).resolves.toEqual([
      documentA,
      documentB,
    ]);

    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledWith("/documents", {
      params: {
        applicationId: 42,
        page: 1,
        pageSize: 50,
      },
    });
  });

  it("loads and concatenates every document page in order", async () => {
    const firstPage: PaginatedDocuments = {
      items: [documentA],
      page: 1,
      pageSize: 50,
      total: 51,
      totalPages: 2,
    };

    const secondPage: PaginatedDocuments = {
      items: [documentB],
      page: 2,
      pageSize: 50,
      total: 51,
      totalPages: 2,
    };

    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(response(firstPage))
      .mockResolvedValueOnce(response(secondPage));

    await expect(
      getAllDocuments({
        applicationId: 42,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    ).resolves.toEqual([documentA, documentB]);

    expect(apiClient.get).toHaveBeenNthCalledWith(1, "/documents", {
      params: {
        applicationId: 42,
        sortBy: "createdAt",
        sortOrder: "desc",
        page: 1,
        pageSize: 50,
      },
    });

    expect(apiClient.get).toHaveBeenNthCalledWith(2, "/documents", {
      params: {
        applicationId: 42,
        sortBy: "createdAt",
        sortOrder: "desc",
        page: 2,
        pageSize: 50,
      },
    });
  });
  it("recognizes only PDF and plain text documents as previewable", () => {
    expect(canPreviewDocument("application/pdf")).toBe(true);
    expect(canPreviewDocument("text/plain")).toBe(true);
    expect(
      canPreviewDocument(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(false);
  });

  it("loads a document preview through the authenticated API client", async () => {
    const blob = new Blob(["PDF content"], { type: "application/pdf" });

    vi.mocked(apiClient.get).mockResolvedValue({
      data: blob,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {
        headers: new AxiosHeaders(),
      },
    });

    await expect(getDocumentPreview(documentA.id)).resolves.toBe(blob);

    expect(apiClient.get).toHaveBeenCalledWith(
      `/documents/${documentA.id}/download`,
      {
        responseType: "blob",
      },
    );
  });

  it("downloads a document through the authenticated API client", async () => {
    const blob = new Blob(["PDF content"], { type: "application/pdf" });
    const createObjectUrlSpy = vi.fn(() => "blob:jobtracker-document");
    const revokeObjectUrlSpy = vi.fn();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrlSpy,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrlSpy,
    });

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    vi.mocked(apiClient.get).mockResolvedValue({
      data: blob,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {
        headers: new AxiosHeaders(),
      },
    });

    await downloadDocument(documentA.id, documentA.originalName);

    expect(apiClient.get).toHaveBeenCalledWith(
      `/documents/${documentA.id}/download`,
      {
        responseType: "blob",
      },
    );
    expect(createObjectUrlSpy).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:jobtracker-document");
    expect(
      document.body.querySelector('a[download="cv-principal.pdf"]'),
    ).not.toBeInTheDocument();
  });
});
