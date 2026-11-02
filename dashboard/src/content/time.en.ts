import type { time as he } from "./time.he";
import type { Widen } from "./types";

export const time: Widen<typeof he> = {
  minutesAgo: (minutes) => (minutes === 1 ? "A minute ago" : `${minutes} minutes ago`),
  hoursAgo: (hours) => (hours === 1 ? "An hour ago" : `${hours} hours ago`),
  today: (clock) => `Today ${clock}`,
  yesterday: "Yesterday",
};
