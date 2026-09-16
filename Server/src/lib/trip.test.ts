import { describe, it, expect } from "vitest";
import { detectTrip } from "./trip.js";

describe("detectTrip — hanukkah", () => {
  it("matches the word חנוכה", () => {
    expect(detectTrip("מעוניינת בנסיעת חנוכה")).toBe("hanukkah");
  });
  it("matches דצמבר", () => {
    expect(detectTrip("אני פנויה בדצמבר")).toBe("hanukkah");
  });
  it("matches the bare date range 6-10", () => {
    expect(detectTrip("6-10 מתאים לי")).toBe("hanukkah");
  });
  it("matches the date range with month 6-10/12", () => {
    expect(detectTrip("הנסיעה של 6-10/12")).toBe("hanukkah");
  });
  it("matches the single date form 06.12", () => {
    expect(detectTrip("יוצאים ב-06.12")).toBe("hanukkah");
  });
  it("matches the single date form with slash 06/12", () => {
    expect(detectTrip("יוצאים ב-06/12")).toBe("hanukkah");
  });
});

describe("detectTrip — kislev (Rosh Chodesh)", () => {
  it("matches bare כסלו — client ruled this means the Rosh Chodesh trip", () => {
    expect(detectTrip("מעוניינת בכסלו")).toBe("kislev");
  });
  it('matches ר"ח כסלו', () => {
    expect(detectTrip('הנסיעה של ר"ח כסלו מתאימה לי')).toBe("kislev");
  });
  it("matches נובמבר", () => {
    expect(detectTrip("אני פנויה בנובמבר")).toBe("kislev");
  });
  it("matches the bare date range 11-15", () => {
    expect(detectTrip("11-15 מתאים לי")).toBe("kislev");
  });
  it("matches the date range with month 11-15/11", () => {
    expect(detectTrip("הנסיעה של 11-15/11")).toBe("kislev");
  });
  it("matches the single date form 11.11", () => {
    expect(detectTrip("יוצאים ב-11.11")).toBe("kislev");
  });
});

describe("detectTrip — hanukkah wins over כסלו", () => {
  it("a message with BOTH the hanukkah date form and the word כסלו resolves to hanukkah", () => {
    expect(detectTrip("הנסיעה של 6-10/12, זה גם בכסלו נכון?")).toBe("hanukkah");
  });
  it("a message with the word חנוכה AND the word כסלו resolves to hanukkah", () => {
    expect(detectTrip("נסיעת חנוכה שיוצאת בכסלו")).toBe("hanukkah");
  });
});

describe("detectTrip — no guessing", () => {
  it('returns null for an ordinal "הראשון" (the first)', () => {
    expect(detectTrip("אני רוצה את הנסיעה הראשונה")).toBeNull();
  });
  it('returns null for an ordinal "השני" (the second)', () => {
    expect(detectTrip("מעוניינת בתאריך השני")).toBeNull();
  });
  it("returns null for plain interested text with no date/month signal", () => {
    expect(detectTrip("אני מעוניינת מאוד")).toBeNull();
  });
  it("returns null for an unrelated phone-number-like digit string", () => {
    expect(detectTrip("תתקשרי אליי ל-0501234567")).toBeNull();
  });
  it("returns null for empty text", () => {
    expect(detectTrip("")).toBeNull();
  });
});
