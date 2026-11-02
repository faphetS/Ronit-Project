import { describe, expect, it } from "vitest";
import { buildTd3 } from "./passport-mrz.fixture.js";
import { mrzCheckDigit, parseTd3 } from "./passport-mrz.js";

// The specimen passport in ICAO Doc 9303 part 4 (Anna Maria Eriksson, Utopia).
const ICAO_LINE_1 = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<";
const ICAO_LINE_2 = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";
const TODAY = new Date("2026-11-02T10:00:00Z");

describe("mrzCheckDigit", () => {
  it("gives the specimen's check digits", () => {
    expect(mrzCheckDigit("L898902C3")).toBe(6);
    expect(mrzCheckDigit("740812")).toBe(2);
    expect(mrzCheckDigit("120415")).toBe(9);
    expect(mrzCheckDigit("<<<<<<<<<<<<<<")).toBe(0);
  });

  it("rejects a character an MRZ can't hold", () => {
    expect(mrzCheckDigit("12a4")).toBeNull();
  });
});

describe("parseTd3", () => {
  it("reads the specimen", () => {
    expect(parseTd3(ICAO_LINE_1, ICAO_LINE_2, TODAY)).toEqual({
      documentNumber: "L898902C3",
      nationality: "UTO",
      birthDate: "1974-08-12",
      sex: "F",
      expiryDate: "2012-04-15",
      surname: "ERIKSSON",
      givenNames: "ANNA MARIA",
    });
  });

  it("returns null when a digit was misread", () => {
    expect(parseTd3(ICAO_LINE_1, ICAO_LINE_2.replace("7408122", "7408132"), TODAY)).toBeNull();
    expect(parseTd3(ICAO_LINE_1, ICAO_LINE_2.replace("L898902C3", "L898902C8"), TODAY)).toBeNull();
  });

  it("repairs a letter read in place of a digit in a date", () => {
    expect(parseTd3(null, ICAO_LINE_2.replace("7408122", "74O8122"), TODAY)?.birthDate).toBe("1974-08-12");
  });

  it("accepts spaces and lower case from the reader, and needs all 44 characters", () => {
    const spaced = `${ICAO_LINE_2.slice(0, 20).toLowerCase()} ${ICAO_LINE_2.slice(20)}`;
    expect(parseTd3(null, spaced, TODAY)?.documentNumber).toBe("L898902C3");
    expect(parseTd3(null, ICAO_LINE_2.slice(0, 43), TODAY)).toBeNull();
  });

  it("puts a two-digit birth year in the right century", () => {
    const child = buildTd3({ surname: "LEVI", givenNames: "NOA", number: "30000001", nationality: "ISR", birth: "150301", sex: "F", expiry: "300301" });
    const grandmother = buildTd3({ surname: "LEVI", givenNames: "RUTH", number: "30000002", nationality: "ISR", birth: "380301", sex: "F", expiry: "300301" });
    expect(parseTd3(child.line1, child.line2, TODAY)?.birthDate).toBe("2015-03-01");
    expect(parseTd3(grandmother.line1, grandmother.line2, TODAY)?.birthDate).toBe("1938-03-01");
  });

  it("strips the filler from an 8-digit Israeli passport number", () => {
    const israeli = buildTd3({ surname: "COHEN", givenNames: "SARAH", number: "31195855", nationality: "ISR", birth: "900514", sex: "F", expiry: "310309" });
    expect(parseTd3(israeli.line1, israeli.line2, TODAY)).toMatchObject({ documentNumber: "31195855", surname: "COHEN", givenNames: "SARAH" });
  });
});
