import { describe, expect, it } from "vitest";
import {
  compactPrimaryButtonClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "./button-styles";

describe("button styles", () => {
  it("provides the shared primary button styling", () => {
    expect(primaryButtonClassName).toBe(
      "rounded-md bg-blue-600 px-4 py-2 font-medium text-white",
    );
  });

  it("provides the compact primary button styling", () => {
    expect(compactPrimaryButtonClassName).toBe(
      "rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50",
    );
  });

  it("provides the shared secondary button styling", () => {
    expect(secondaryButtonClassName).toBe(
      "rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50",
    );
  });
});
