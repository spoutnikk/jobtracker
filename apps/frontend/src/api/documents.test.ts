import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import {
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
});
