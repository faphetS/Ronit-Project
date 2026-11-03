import { describe, expect, it } from "vitest";
import { holidaySendAt, upcomingHolidays } from "./hebrew-holidays.js";

describe("upcomingHolidays", () => {
  it("finds the next holidays and their eves on the Hebrew calendar", () => {
    const next = upcomingHolidays("2026-11-03").slice(0, 4);
    expect(next).toEqual([
      { key: "hanukkah", hebrewYear: 5787, day: "2026-12-05", eve: "2026-12-04" },
      { key: "tuBishvat", hebrewYear: 5787, day: "2027-01-23", eve: "2027-01-22" },
      { key: "purim", hebrewYear: 5787, day: "2027-03-23", eve: "2027-03-22" },
      { key: "pesach", hebrewYear: 5787, day: "2027-04-22", eve: "2027-04-21" },
    ]);
  });

  it("counts a holiday whose eve is today", () => {
    expect(upcomingHolidays("2026-12-04")[0]).toMatchObject({ key: "hanukkah", eve: "2026-12-04" });
    expect(upcomingHolidays("2026-12-05")[0].key).not.toBe("hanukkah");
  });

  it("takes Purim in Adar II in a leap year", () => {
    const purim = upcomingHolidays("2027-01-01").find((holiday) => holiday.key === "purim");
    // 5787 is a leap year: Adar I begins in February 2027, Purim falls in Adar II.
    expect(purim?.day).toBe("2027-03-23");
  });
});

describe("holidaySendAt", () => {
  it("sends at noon on the eve, Israel time", () => {
    // Friday 2026-12-04, winter (UTC+2).
    expect(holidaySendAt("2026-12-04").toISOString()).toBe("2026-12-04T10:00:00.000Z");
    // Thursday 2027-06-10, summer (UTC+3).
    expect(holidaySendAt("2027-06-10").toISOString()).toBe("2027-06-10T09:00:00.000Z");
  });

  it("sends on Friday when the eve is Shabbat", () => {
    // Saturday 2027-10-16.
    expect(holidaySendAt("2027-10-16").toISOString()).toBe("2027-10-15T09:00:00.000Z");
  });
});
