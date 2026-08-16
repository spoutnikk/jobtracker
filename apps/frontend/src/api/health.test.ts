import { describe, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import { getHealth, type HealthResponse } from "./health";

vi.mock("./client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const healthResponse: HealthResponse = {
  status: "ok",
  service: "jobtracker-api",
  version: "1.0.0",
};

describe("health API", () => {
  it("loads API health information", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: healthResponse,
    });

    await expect(getHealth()).resolves.toEqual(healthResponse);

    expect(apiClient.get).toHaveBeenCalledWith("/health");
  });
});
