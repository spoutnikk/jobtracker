import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import {
  getAllApplications,
  type Application,
  type PaginatedApplications,
} from "./applications";

vi.mock("./client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const application = { id: 1 } as Application;
const secondApplication = { id: 51 } as Application;
const thirdApplication = { id: 101 } as Application;

function response(
  data: PaginatedApplications,
): AxiosResponse<PaginatedApplications> {
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

describe("getAllApplications", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the first page without an additional request", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      response({
        items: [application],
        page: 1,
        pageSize: 50,
        total: 1,
        totalPages: 1,
      }),
    );

    await expect(getAllApplications()).resolves.toEqual([application]);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledWith("/applications", {
      params: { page: 1, pageSize: 50 },
    });
  });

  it("loads and concatenates every page in order", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(
        response({
          items: [application],
          page: 1,
          pageSize: 50,
          total: 101,
          totalPages: 3,
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: [secondApplication],
          page: 2,
          pageSize: 50,
          total: 101,
          totalPages: 3,
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: [thirdApplication],
          page: 3,
          pageSize: 50,
          total: 101,
          totalPages: 3,
        }),
      );

    await expect(getAllApplications()).resolves.toEqual([
      application,
      secondApplication,
      thirdApplication,
    ]);
    expect(apiClient.get).toHaveBeenNthCalledWith(1, "/applications", {
      params: { page: 1, pageSize: 50 },
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, "/applications", {
      params: { page: 2, pageSize: 50 },
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(3, "/applications", {
      params: { page: 3, pageSize: 50 },
    });
  });
});
