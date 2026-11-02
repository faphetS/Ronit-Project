import { describe, expect, it, vi } from "vitest";

vi.mock("../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { parsePassportReading } from "./passport-reader.js";

const READING = {
  isPassport: true,
  confidence: 0.9,
  documentNumber: "31195855",
  surnameLatin: "COHEN",
  givenNamesLatin: "SARAH",
  surnameHebrew: "כהן",
  givenNamesHebrew: "שרה",
  nationality: "ISR",
  sex: "F",
  birthDate: "1990-05-14",
  issueDate: "2021-03-10",
  expiryDate: "2031-03-09",
  mrzLine1: null,
  mrzLine2: null,
};

describe("parsePassportReading", () => {
  it("reads plain JSON and JSON wrapped in a code fence", () => {
    expect(parsePassportReading(JSON.stringify(READING))).toEqual(READING);
    expect(parsePassportReading("```json\n" + JSON.stringify(READING) + "\n```")).toEqual(READING);
  });

  it("rejects an answer that isn't JSON", () => {
    expect(() => parsePassportReading("I can't read this photo")).toThrow(
      expect.objectContaining({ code: "PASSPORT_READER_INVALID_JSON" }),
    );
  });

  it("rejects an answer missing a field", () => {
    const { mrzLine2: _dropped, ...partial } = READING;
    expect(() => parsePassportReading(JSON.stringify(partial))).toThrow(
      expect.objectContaining({ code: "PASSPORT_READER_SCHEMA_MISMATCH" }),
    );
  });
});
