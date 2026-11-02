import type { HolidayKey } from "../lib/holidays";

export const holidayNames: Record<HolidayKey, string> = {
  roshHashana: "ראש השנה",
  yomKippur: "יום כיפור",
  sukkot: "סוכות",
  hanukkah: "חנוכה",
  tuBishvat: "ט״ו בשבט",
  purim: "פורים",
  pesach: "פסח",
  shavuot: "שבועות",
  tuBav: "ט״ו באב",
};

export function holidayCountdown(name: string, days: number): string {
  if (days === 0) return `${name} הערב`;
  if (days === 1) return `${name} מחר`;
  return `${name} בעוד ${days} ימים`;
}
