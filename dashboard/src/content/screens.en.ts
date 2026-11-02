import type { comingSoon as heComingSoon, screens as he } from "./screens.he";
import type { Widen } from "./types";

export const screens: typeof he = {
  overview: { title: "Hi, Ronit", soft: "Let’s see what’s happening today" },
  leads: { title: "Leads", soft: "From the first call to sign-up" },
  lead: { title: "Lead details" },
  customers: { title: "Customers and passports", soft: "Every customer and passport" },
  customer: { title: "Customer profile" },
  groups: { title: "Groups and flights", soft: "Active flights and events" },
  holidays: { title: "Holiday greetings", soft: "Write, review and send" },
  birthdays: { title: "Birthdays", soft: "An automatic WhatsApp greeting" },
  users: { title: "Users and permissions", soft: "Who signs in and what they see" },
  account: { title: "Account and settings" },
  import: { title: "Import from Monday.com", soft: "A one-time transfer" },
};

export const comingSoon: Widen<typeof heComingSoon> ="This screen comes in the next phase.";
