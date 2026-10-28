import type { holidayNames as he } from "./holidays.he";

export const holidayNames: typeof he = {
  roshHashana: "Rosh Hashanah",
  yomKippur: "Yom Kippur",
  sukkot: "Sukkot",
  hanukkah: "Hanukkah",
  tuBishvat: "Tu BiShvat",
  purim: "Purim",
  pesach: "Passover",
  shavuot: "Shavuot",
  tuBav: "Tu B’Av",
};

export function holidayCountdown(name: string, days: number): string {
  if (days === 0) return `${name} starts tonight`;
  if (days === 1) return `${name} starts tomorrow`;
  return `${name} in ${days} days`;
}
