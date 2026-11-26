import { describe, expect, it } from "vitest";
import { dayAt } from "./clock";
import { formatDate, formatDayMonth, formatNumber, formatPhone, formatRelative, formatTime, formatWeekday, maskPassport } from "./format";

describe("formatPhone", () => {
  it("groups Israeli mobiles and landlines the way they're read out", () => {
    expect(formatPhone("0521784972")).toBe("052-178-4972");
    expect(formatPhone("052-1784972")).toBe("052-178-4972");
    expect(formatPhone("+972521784972")).toBe("052-178-4972");
    expect(formatPhone("972 52 178 4972")).toBe("052-178-4972");
    expect(formatPhone("0771234567")).toBe("077-123-4567");
    expect(formatPhone("021234567")).toBe("02-123-4567");
  });

  it("leaves anything else as it came", () => {
    expect(formatPhone("+1 212 555 0100")).toBe("+1 212 555 0100");
    expect(formatPhone("12345")).toBe("12345");
    expect(formatPhone("")).toBe("");
  });
});

const reference = dayAt("2026-10-28", "15:30");

describe("format", () => {
  it("formats numbers and dates the Israeli way", () => {
    expect(formatNumber(1284)).toBe("1,284");
    expect(formatDayMonth(dayAt("2026-10-28"))).toBe("28.10");
    expect(formatDate(dayAt("2026-10-28"))).toBe("28.10.2026");
    expect(formatTime(dayAt("2026-10-28", "09:05"))).toBe("09:05");
    expect(formatWeekday(dayAt("2026-10-28"))).toBe("רביעי");
  });

  it("masks passport numbers", () => {
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
