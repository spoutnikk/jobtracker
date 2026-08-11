import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import {
  getAllCompanies,
  type Company,
  type PaginatedCompanies,
} from "./companies";

vi.mock("./client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const company: Company = {
  id: 1,
  name: "Acme",
  website: null,
  city: "Paris",
  createdAt: "2026-08-11T08:00:00.000Z",
  updatedAt: "2026-08-11T08:00:00.000Z",
  jobOffers: [],
};
const secondCompany: Company = { ...company, id: 51, name: "Beta" };

function response(data: PaginatedCompanies): AxiosResponse<PaginatedCompanies> {
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

describe("getAllCompanies", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a single page without another request", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      response({
        items: [company],
        page: 1,
        pageSize: 50,
        total: 1,
        totalPages: 1,
      }),
    );

    await expect(getAllCompanies()).resolves.toEqual([company]);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledWith("/companies", {
      params: { page: 1, pageSize: 50 },
    });
  });

  it("loads and concatenates all pages in order", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(
        response({
          items: [company],
          page: 1,
          pageSize: 50,
          total: 51,
          totalPages: 2,
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: [secondCompany],
          page: 2,
          pageSize: 50,
          total: 51,
          totalPages: 2,
        }),
      );

    await expect(getAllCompanies()).resolves.toEqual([company, secondCompany]);
    expect(apiClient.get).toHaveBeenNthCalledWith(1, "/companies", {
      params: { page: 1, pageSize: 50 },
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, "/companies", {
      params: { page: 2, pageSize: 50 },
    });
  });
});
