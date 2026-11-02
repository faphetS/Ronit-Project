import { describe, expect, it } from "vitest";
import { dayAt } from "./clock";
import { formatDate, formatDayMonth, formatNumber, formatRelative, formatTime, formatWeekday, maskPassport, maskPhone } from "./format";

const reference = dayAt("2026-10-28", "15:30");

describe("format", () => {
  it("formats numbers and dates the Israeli way", () => {
    expect(formatNumber(1284)).toBe("1,284");
    expect(formatDayMonth(dayAt("2026-10-28"))).toBe("28.10");
    expect(formatDate(dayAt("2026-10-28"))).toBe("28.10.2026");
    expect(formatTime(dayAt("2026-10-28", "09:05"))).toBe("09:05");
    expect(formatWeekday(dayAt("2026-10-28"))).toBe("רביעי");
  });

  it("masks phone and passport numbers", () => {
    expect(maskPhone("0542212219")).toBe("054-•••-2219");
    expect(maskPhone("054-221-2219")).toBe("054-•••-2219");
    expect(maskPassport("38412921")).toBe("38•••921");
  });

  it("writes relative times like the canvas", () => {
    expect(formatRelative(dayAt("2026-10-28", "15:10"), reference)).toBe("לפני 20 דקות");
    expect(formatRelative(dayAt("2026-10-28", "14:30"), reference)).toBe("לפני שעה");
    expect(formatRelative(dayAt("2026-10-28", "12:30"), reference)).toBe("לפני 3 שעות");
    expect(formatRelative(dayAt("2026-10-28", "09:12"), reference)).toBe("היום 09:12");
    expect(formatRelative(dayAt("2026-10-27", "17:00"), reference)).toBe("אתמול");
    expect(formatRelative(dayAt("2026-10-24", "12:00"), reference)).toBe("24.10");
  });
});
