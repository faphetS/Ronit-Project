import { describe, expect, it } from "vitest";
import { holidayCountdown, holidayNames } from "../content/holidays.he";
import { dayAt, isoDay } from "./clock";
import { nextHoliday } from "./holidays";

describe("nextHoliday", () => {
  it("finds Hanukkah 37 days before its eve", () => {
    const next = nextHoliday(dayAt("2026-10-28"));
    expect(next.key).toBe("hanukkah");
    expect(isoDay(next.eve)).toBe("2026-12-04");
    expect(next.daysToEve).toBe(37);
  });

  it("counts the eve itself as day zero", () => {
    expect(nextHoliday(dayAt("2026-12-04"))).toMatchObject({ key: "hanukkah", daysToEve: 0 });
  });

  it("moves on once the eve has passed", () => {
    const next = nextHoliday(dayAt("2026-12-05"));
    expect(next.key).toBe("tuBishvat");
    expect(isoDay(next.day)).toBe("2027-01-23");
  });

  it("puts Purim in Adar II in a leap year", () => {
    expect(isoDay(nextHoliday(dayAt("2027-02-01")).day)).toBe("2027-03-23");
  });
});

describe("holiday copy", () => {
  it("counts down in natural Hebrew", () => {
    expect(holidayCountdown(holidayNames.hanukkah, 37)).toBe("חנוכה בעוד 37 ימים");
    expect(holidayCountdown(holidayNames.hanukkah, 1)).toBe("חנוכה מחר");
    expect(holidayCountdown(holidayNames.hanukkah, 0)).toBe("חנוכה הערב");
  });
});
