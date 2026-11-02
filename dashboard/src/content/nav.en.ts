import type { nav as he } from "./nav.he";
import type { Widen } from "./types";

// Menu items are shorter than the screen titles, so the English menu fits the same bar.
export const nav: Widen<typeof he> = {
  main: "Main navigation",
  tools: "Tools and admin",
  items: {
    overview: "Overview",
    leads: "Leads",
    customers: "Customers",
    groups: "Groups",
    holidays: "Holidays",
    birthdays: "Birthdays",
  },
  tabs: {
    home: "Home",
    leads: "Leads",
    customers: "Customers",
    groups: "Groups",
    greetings: "Greetings",
  },
  whatsappPassports: (count) => `Passports from WhatsApp, ${count} new`,
  import: "Copy from Monday",
  history: "Message history",
  users: "Users and permissions",
  settings: "Settings",
  search: "Quick search",
  notifications: (count) => `Notifications, ${count} new`,
  withNew: (label, count) => `${label}, ${count} new`,
  signOut: (name) => `${name}, sign out`,
  account: (name) => `${name}, account and settings`,
  back: "Back",
  accountMenu: {
    title: "Settings",
    profile: "My details",
    team: "Users and permissions",
    import: "Copy from Monday",
    language: "Language",
    maskPassports: "Hide passport numbers",
    signOut: "Sign out",
    name: "Full name",
    email: "Email",
    emailNote: "The Google account you sign in with. To change it, an admin invites the new email.",
    save: "Save",
    saved: "Your details were saved",
    saveFailed: "Your details weren't saved. Please try again.",
  },
};
