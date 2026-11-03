import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

import { TEMPLATE_BODY_LIMIT, templateParams, templateProblem, templateValue, toTemplate } from "./whatsapp-templates.js";
import { validSignature } from "./zernio.webhook.js";

describe("toTemplate", () => {
  it("numbers every placeholder in order, a name used twice as two values", () => {
    expect(toTemplate("  שלום {שם פרטי}, חג שמח מכל {שם הקבוצה}! להתראות {שם פרטי}.  ")).toEqual({
      body: "שלום {{1}}, חג שמח מכל {{2}}! להתראות {{3}}.",
      tokens: ["firstName", "groupName", "firstName"],
    });
    expect(toTemplate("חג שמח")).toEqual({ body: "חג שמח", tokens: [] });
  });
});

describe("templateProblem", () => {
  const holiday = ["firstName", "groupName"] as const;
  it("finds what Meta refuses", () => {
    expect(templateProblem("   ", holiday)).toBe("empty-message");
    expect(templateProblem("א".repeat(TEMPLATE_BODY_LIMIT + 1), holiday)).toBe("too-long");
    expect(templateProblem("{שם פרטי}, חג שמח", holiday)).toBe("starts-with-placeholder");
    expect(templateProblem("חג שמח {שם פרטי}", holiday)).toBe("ends-with-placeholder");
    expect(templateProblem("בת {גיל} היום!", holiday)).toBe("placeholder-not-allowed");
    expect(templateProblem("חג שמח {שם פרטי}!", holiday)).toBeNull();
  });
});

describe("templateParams", () => {
  it("fills the values in order, cleaned the way Meta takes them", () => {
    expect(templateParams(["firstName", "age"], { firstName: " שרה\nכהן ", age: 30 })).toEqual(["שרה כהן", "30"]);
    expect(templateValue("a     b")).toBe("a   b");
  });

  it("gives nothing when a value is missing", () => {
    expect(templateParams(["firstName", "groupName"], { firstName: "שרה", groupName: "" })).toBeNull();
  });
});

describe("validSignature", () => {
  it("accepts the hex HMAC-SHA256 of the raw body, and nothing else", () => {
    const body = Buffer.from('{"event":"message.read"}');
    const signature = createHmac("sha256", "secret").update(body).digest("hex");
    expect(validSignature(body, signature, "secret")).toBe(true);
    expect(validSignature(body, signature.toUpperCase(), "secret")).toBe(true);
    expect(validSignature(body, signature, "other")).toBe(false);
    expect(validSignature(body, undefined, "secret")).toBe(false);
    expect(validSignature(Buffer.from("{}"), signature, "secret")).toBe(false);
  });
});
