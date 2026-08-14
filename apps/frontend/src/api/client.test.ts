import { describe, expect, it } from "vitest";
import { DEFAULT_API_BASE_URL, resolveApiBaseUrl } from "./client";

describe("API client configuration", () => {
  it("uses localhost as the development fallback", () => {
    expect(resolveApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
    expect(resolveApiBaseUrl("   ")).toBe(DEFAULT_API_BASE_URL);
  });

  it("uses the configured API URL", () => {
    expect(resolveApiBaseUrl("https://api.jobtracker.example")).toBe(
      "https://api.jobtracker.example",
    );
  });

  it("trims whitespace and trailing slashes", () => {
    expect(resolveApiBaseUrl("  https://api.jobtracker.example///  ")).toBe(
      "https://api.jobtracker.example",
    );
  });
});
