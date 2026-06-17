import { describe, it, expect } from "vitest";
import { extractPhoneFallback } from "./classify.js";

describe("extractPhoneFallback", () => {
  it("extracts Israeli 05X number with dashes", () => {
    expect(extractPhoneFallback("תתקשרי 050-123-4567")).toBe("0501234567");
  });

  it("extracts +972 prefix number with spaces", () => {
    const result = extractPhoneFallback("+972 50 123 4567");
    expect(result).not.toBeNull();
    expect(result!.replace(/\D/g, "")).toContain("972501234567".slice(0, 12));
  });

  it("returns null for a number that only looks like a phone (age mention)", () => {
    expect(extractPhoneFallback("אני בן 50")).toBeNull();
  });

  it("extracts Philippine 09XX number", () => {
    const result = extractPhoneFallback("09603913514");
    expect(result).not.toBeNull();
    expect(result!.replace(/\D/g, "")).toBe("09603913514");
  });

  it("returns null for plain text with no phone", () => {
    expect(extractPhoneFallback("שלום מה שלומך")).toBeNull();
  });

  it("prefers Israeli over Philippine when both appear", () => {
    const result = extractPhoneFallback("05012345678 and 09603913514");
    expect(result).not.toBeNull();
    expect(result!.replace(/\D/g, "")).toMatch(/^0?5/);
  });
});
