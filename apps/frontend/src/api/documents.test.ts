import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import { getDocuments, type Document } from "./documents";

vi.mock("./client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const documents: Document[] = [];

function response(data: Document[]): AxiosResponse<Document[]> {
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

describe("getDocuments", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue(response(documents));
  });

  it("loads all documents without filters", async () => {
    await expect(getDocuments()).resolves.toBe(documents);

    expect(apiClient.get).toHaveBeenCalledWith("/documents");
  });

  it("loads documents for one application", async () => {
    await expect(getDocuments({ applicationId: 42 })).resolves.toBe(documents);

    expect(apiClient.get).toHaveBeenCalledWith("/documents", {
      params: { applicationId: 42 },
    });
  });
});
