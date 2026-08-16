import { describe, expect, it } from "vitest";
import { formControlClassName } from "./form-control";

describe("formControlClassName", () => {
  it("provides the standard form control styling", () => {
    expect(formControlClassName).toBe(
      "rounded-md border border-gray-300 px-3 py-2",
    );
  });
});
