import type { overview as he } from "./overview.he";
import type { Widen } from "./types";

export const overview: Widen<typeof he> = {
  title: "Hi, Ronit",
  soft: "Let’s see what’s happening today",
  softPhone: "What’s on today?",
  numbersLabel: "Today’s numbers",
  numbers: { openLeads: "Open leads", customers: "Customers", activeGroups: "Active groups" },
  pending: "…",
  weekTitle: "Leads this week",
  breakdown: (counts) => `${counts.new} new · ${counts.talking} in talks · ${counts.registered} registered`,
  allLeads: "All leads",
  today: "Today",
  sideNote: "Your business today",
  restTitle: "More in the overview",
  rest: "The rest of the overview comes in the next phase: recent leads, groups, passports and activity.",
};
