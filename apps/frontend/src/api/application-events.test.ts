import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import {
  getApplicationEvents,
  type ApplicationEvent,
  type PaginatedApplicationEvents,
} from "./application-events";

vi.mock("./client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

function response(
  data: PaginatedApplicationEvents,
): AxiosResponse<PaginatedApplicationEvents> {
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

describe("getApplicationEvents", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the events for the requested application", async () => {
    const events: ApplicationEvent[] = [
      {
        id: 1,
        type: "CREATED",
        title: "Candidature créée",
        description: null,
        occurredAt: "2026-08-12T08:00:00.000Z",
        createdAt: "2026-08-12T08:00:00.000Z",
        applicationId: 42,
      },
    ];
    const page: PaginatedApplicationEvents = {
      items: events,
      page: 2,
      pageSize: 5,
      total: 6,
      totalPages: 2,
    };

    vi.mocked(apiClient.get).mockResolvedValue(response(page));

    await expect(
      getApplicationEvents(42, { page: 2, pageSize: 5 }),
    ).resolves.toBe(page);

    expect(apiClient.get).toHaveBeenCalledWith(
      "/application-events/application/42",
      {
        params: {
          page: 2,
          pageSize: 5,
        },
      },
    );
  });
});
