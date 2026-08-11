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
} from "./application-events";

vi.mock("./client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

function response(data: ApplicationEvent[]): AxiosResponse<ApplicationEvent[]> {
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
    vi.mocked(apiClient.get).mockResolvedValue(response(events));

    await expect(getApplicationEvents(42)).resolves.toBe(events);
    expect(apiClient.get).toHaveBeenCalledWith(
      "/application-events/application/42",
    );
  });
});
