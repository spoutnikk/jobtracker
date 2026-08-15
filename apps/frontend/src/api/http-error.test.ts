import axios from "axios";
import { describe, expect, it } from "vitest";
import { hasHttpStatus } from "./http-error";

describe("hasHttpStatus", () => {
  it("returns true for an Axios error with the expected response status", () => {
    const error = new axios.AxiosError(
      "Unauthorized",
      undefined,
      undefined,
      undefined,
      {
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        config: { headers: new axios.AxiosHeaders() },
        data: null,
      },
    );

    expect(hasHttpStatus(error, 401)).toBe(true);
  });

  it("returns false for an Axios error with another response status", () => {
    const error = new axios.AxiosError(
      "Not found",
      undefined,
      undefined,
      undefined,
      {
        status: 404,
        statusText: "Not Found",
        headers: {},
        config: { headers: new axios.AxiosHeaders() },
        data: null,
      },
    );

    expect(hasHttpStatus(error, 409)).toBe(false);
  });

  it("returns false for an Axios error without a response", () => {
    const error = new axios.AxiosError("Network error");

    expect(hasHttpStatus(error, 401)).toBe(false);
  });

  it("returns false for a non-Axios error", () => {
    expect(hasHttpStatus(new Error("Failure"), 500)).toBe(false);
  });
});
