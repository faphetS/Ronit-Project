import { describe, it, expect } from "vitest";
import { N8nLeadFallbackSchema } from "./monday.validator.js";

describe("N8nLeadFallbackSchema", () => {
  it("parses with phone972 only", () => {
    const result = N8nLeadFallbackSchema.parse({
      full_name: "דנה כהן",
      phone972: "972501234567",
    });
    expect(result.full_name).toBe("דנה כהן");
    expect(result.phone972).toBe("972501234567");
    expect(result.email).toBeUndefined();
  });

  it("parses with email only (no phone972)", () => {
    const result = N8nLeadFallbackSchema.parse({
      full_name: "דנה כהן",
      email: "dana@example.com",
    });
    expect(result.email).toBe("dana@example.com");
    expect(result.phone972).toBeUndefined();
  });

  it("rejects when both phone972 and email are missing", () => {
    expect(() => N8nLeadFallbackSchema.parse({ full_name: "דנה כהן" })).toThrow();
    const result = N8nLeadFallbackSchema.safeParse({ full_name: "דנה כהן" });
    expect(result.success).toBe(false);
  });

  it("rejects when phone972 is an empty string and email is absent", () => {
    const result = N8nLeadFallbackSchema.safeParse({
      full_name: "דנה כהן",
      phone972: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when phone972 is null and email is null", () => {
    const result = N8nLeadFallbackSchema.safeParse({
      full_name: "דנה כהן",
      phone972: null,
      email: null,
    });
    expect(result.success).toBe(false);
  });

  it("treats email: '' as absent (does not fail email validation) when phone972 is present", () => {
    const result = N8nLeadFallbackSchema.parse({
      full_name: "דנה כהן",
      phone972: "972501234567",
      email: "",
    });
    expect(result.email).toBeNull();
  });

  it("defaults full_name to 'ליד חדש' when omitted", () => {
    const result = N8nLeadFallbackSchema.parse({ phone972: "972501234567" });
    expect(result.full_name).toBe("ליד חדש");
  });

  it("passes through extra n8n fields unvalidated", () => {
    const result = N8nLeadFallbackSchema.parse({
      full_name: "דנה כהן",
      phone972: "972501234567",
      mondayValues: { some: "thing" },
      raw_row_id: 42,
    });
    expect(result).toMatchObject({
      mondayValues: { some: "thing" },
      raw_row_id: 42,
    });
  });

  it("accepts a well-formed inquiryDate", () => {
    const result = N8nLeadFallbackSchema.parse({
      full_name: "דנה כהן",
      phone972: "972501234567",
      inquiryDate: "2026-07-01",
    });
    expect(result.inquiryDate).toBe("2026-07-01");
  });

  it("rejects a malformed inquiryDate", () => {
    const result = N8nLeadFallbackSchema.safeParse({
      full_name: "דנה כהן",
      phone972: "972501234567",
      inquiryDate: "07/01/2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email format when present", () => {
    const result = N8nLeadFallbackSchema.safeParse({
      full_name: "דנה כהן",
      phone972: "972501234567",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  // n8n's Normalize-phone node NEVER omits keys — missing source data arrives
  // as "". These three guard the real wire shape against 400-and-lose.
  it("phone972: '' with a valid email → parses as email-only (phone972 null)", () => {
    const result = N8nLeadFallbackSchema.parse({
      full_name: "דנה כהן",
      phone972: "",
      email: "dana@example.com",
    });
    expect(result.phone972).toBeNull();
    expect(result.email).toBe("dana@example.com");
  });

  it("inquiryDate: '' with a valid phone → parses, inquiryDate absent (drain falls back to today)", () => {
    const result = N8nLeadFallbackSchema.parse({
      full_name: "דנה כהן",
      phone972: "972501234567",
      inquiryDate: "",
    });
    expect(result.inquiryDate).toBeUndefined();
    expect(result.phone972).toBe("972501234567");
  });

  it("full_name: '' or whitespace → falls back to the 'ליד חדש' default", () => {
    for (const blank of ["", "   "]) {
      const result = N8nLeadFallbackSchema.parse({
        full_name: blank,
        phone972: "972501234567",
      });
      expect(result.full_name).toBe("ליד חדש");
    }
  });
});
