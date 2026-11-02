export const time = {
  minutesAgo: (minutes: number) => (minutes === 1 ? "לפני דקה" : `לפני ${minutes} דקות`),
  hoursAgo: (hours: number) => (hours === 1 ? "לפני שעה" : `לפני ${hours} שעות`),
  today: (clock: string) => `היום ${clock}`,
  yesterday: "אתמול",
} as const;
