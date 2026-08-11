import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import {
  getAllJobOffers,
  type JobOffer,
  type PaginatedJobOffers,
} from "./job-offers";

vi.mock("./client", () => ({ apiClient: { get: vi.fn() } }));

const company = {
  id: 1,
  name: "Acme",
  website: null,
  city: null,
  createdAt: "2026-08-11T08:00:00.000Z",
  updatedAt: "2026-08-11T08:00:00.000Z",
};
const jobOffer: JobOffer = {
  id: 1,
  title: "React",
  companyId: 1,
  url: null,
  description: null,
  location: null,
  contractType: "CDI",
  salary: null,
  publishedAt: null,
  createdAt: "2026-08-11T08:00:00.000Z",
  updatedAt: "2026-08-11T08:00:00.000Z",
  company,
};
const secondJobOffer = { ...jobOffer, id: 51, title: "TypeScript" };

function response(data: PaginatedJobOffers): AxiosResponse<PaginatedJobOffers> {
  const config: InternalAxiosRequestConfig = {
    headers: new AxiosHeaders(),
  };

  return { data, status: 200, statusText: "OK", headers: {}, config };
}

describe("getAllJobOffers", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns one page without another request", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      response({
        items: [jobOffer],
        page: 1,
        pageSize: 50,
        total: 1,
        totalPages: 1,
      }),
    );

    await expect(getAllJobOffers()).resolves.toEqual([jobOffer]);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it("loads and concatenates multiple pages in order", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(
        response({
          items: [jobOffer],
          page: 1,
          pageSize: 50,
          total: 51,
          totalPages: 2,
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: [secondJobOffer],
          page: 2,
          pageSize: 50,
          total: 51,
          totalPages: 2,
        }),
      );

    await expect(getAllJobOffers()).resolves.toEqual([
      jobOffer,
      secondJobOffer,
    ]);
    expect(apiClient.get).toHaveBeenNthCalledWith(1, "/job-offers", {
      params: { page: 1, pageSize: 50 },
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, "/job-offers", {
      params: { page: 2, pageSize: 50 },
    });
  });
});
