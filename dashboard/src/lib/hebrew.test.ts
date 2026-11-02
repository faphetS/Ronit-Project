import { describe, expect, it } from "vitest";
import { dayAt } from "./clock";
import { formatHebrewDate, hebrewDateParts, sameHebrewMonth, toHebrewNumeral } from "./hebrew";

describe("Hebrew numerals", () => {
  it.each([
    [1, "א׳"],
    [5, "ה׳"],
    [15, "ט״ו"],
    [16, "ט״ז"],
    [17, "י״ז"],
    [25, "כ״ה"],
    [30, "ל׳"],
    [115, "קט״ו"],
    [400, "ת׳"],
    [787, "תשפ״ז"],
    [999, "תתקצ״ט"],
  ])("writes %i as %s", (value, text) => {
    expect(toHebrewNumeral(value)).toBe(text);
  });

  it("rejects numbers it cannot write", () => {
    expect(() => toHebrewNumeral(0)).toThrow(RangeError);
    expect(() => toHebrewNumeral(1000)).toThrow(RangeError);
  });
});

describe("Hebrew dates", () => {
  it("reads the Hebrew calendar day", () => {
    expect(hebrewDateParts(dayAt("2026-10-28"))).toEqual({ day: 17, month: "חשוון", year: 5787 });
  });

  it("writes the date the way the dashboard shows it", () => {
    expect(formatHebrewDate(dayAt("2026-10-28"))).toBe("י״ז בחשוון תשפ״ז");
  });

  it("matches month names across spellings", () => {
    expect(sameHebrewMonth("חשון", "חשוון")).toBe(true);
    expect(sameHebrewMonth("אדר ב׳", "אדר ב'")).toBe(true);
    expect(sameHebrewMonth("אדר א׳", "אדר ב׳")).toBe(false);
  });
});
