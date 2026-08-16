import { describe, expect, it } from "vitest";
import {
  cardClassName,
  compactCardClassName,
  interactiveCardClassName,
  sectionCardClassName,
} from "./card-styles";

describe("card styles", () => {
  it("provides the standard card styling", () => {
    expect(cardClassName).toBe(
      "rounded-lg border border-gray-200 bg-white p-5 shadow-sm",
    );
  });

  it("provides the section card styling", () => {
    expect(sectionCardClassName).toBe(
      "rounded-lg border border-gray-200 bg-white p-6 shadow-sm",
    );
  });

  it("provides the interactive card styling", () => {
    expect(interactiveCardClassName).toBe(
      "rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow",
    );
  });

  it("provides the compact card styling", () => {
    expect(compactCardClassName).toBe(
      "rounded-lg border border-gray-200 bg-white p-4 shadow-sm",
    );
  });
});
