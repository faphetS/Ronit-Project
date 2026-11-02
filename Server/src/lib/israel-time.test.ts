import { describe, expect, it } from "vitest";
import { addDays, birthdayIn, birthdaySlot, israelDay, israelMoment, weekdayOf } from "./israel-time.js";

describe("israelMoment", () => {
  it("is UTC+2 in winter and UTC+3 in summer", () => {
    expect(israelMoment("2026-12-04", "09:00").toISOString()).toBe("2026-12-04T07:00:00.000Z");
    expect(israelMoment("2026-07-15", "09:00").toISOString()).toBe("2026-07-15T06:00:00.000Z");
  });
});

describe("israelDay", () => {
  it("uses Israel's date, not UTC's", () => {
    expect(israelDay(new Date("2026-11-02T22:30:00Z"))).toBe("2026-11-03");
    expect(israelDay(new Date("2026-11-02T21:30:00Z"))).toBe("2026-11-02");
  });
});

describe("days", () => {
  it("adds days across a month end and knows Shabbat", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-11-07", -1)).toBe("2026-11-06");
    expect(weekdayOf("2026-11-07")).toBe(6);
  });

  it("moves 29 February to the 28th outside leap years", () => {
    expect(birthdayIn(2026, "2004-02-29")).toBe("2026-02-28");
    expect(birthdayIn(2028, "2004-02-29")).toBe("2028-02-29");
  });
});

describe("birthdaySlot", () => {
  const afterShabbat = { sendTime: "09:00", shabbatRule: "after-shabbat" as const };

  it("sends a weekday birthday at the send time", () => {
    expect(birthdaySlot("2026-11-02", afterShabbat).toISOString()).toBe("2026-11-02T07:00:00.000Z");
  });

  it("waits until Shabbat is out", () => {
    expect(birthdaySlot("2026-11-07", afterShabbat).toISOString()).toBe("2026-11-07T19:00:00.000Z");
  });

  it("sends on Friday under the before-Shabbat rule", () => {
    const beforeShabbat = { ...afterShabbat, shabbatRule: "before-shabbat" as const };
    expect(birthdaySlot("2026-11-07", beforeShabbat).toISOString()).toBe("2026-11-06T07:00:00.000Z");
  });
});
