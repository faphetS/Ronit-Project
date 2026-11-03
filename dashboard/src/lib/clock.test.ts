import { describe, expect, it } from "vitest";
import { addDays, dayAt, daysBetween, isoDay, now, today, weekStart } from "./clock";

describe("clock", () => {
  it("reads the real clock: today is the Israeli day, at noon", () => {
    // src/test/setup.ts fixes the clock at 2026-10-28 15:30 Israel time.
    expect(isoDay(today())).toBe("2026-10-28");
    expect(now().toISOString()).toBe("2026-10-28T13:30:00.000Z");
  });

  it("counts calendar days in Israel time", () => {
    expect(daysBetween(dayAt("2026-10-28"), dayAt("2026-12-04"))).toBe(37);
    expect(daysBetween(dayAt("2026-10-28", "23:30"), dayAt("2026-10-29", "00:30"))).toBe(1);
  });

  it("adds days and finds the Sunday that starts the week", () => {
    expect(isoDay(addDays(dayAt("2026-10-28"), -3))).toBe("2026-10-25");
    expect(isoDay(weekStart(dayAt("2026-10-28")))).toBe("2026-10-25");
    expect(isoDay(weekStart(dayAt("2026-10-25")))).toBe("2026-10-25");
  });

  it("rejects malformed days", () => {
    expect(() => dayAt("28.10.2026")).toThrow("Expected YYYY-MM-DD");
  });
});
