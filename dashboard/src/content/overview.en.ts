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

  newLeads: "New leads",
  versusLastWeek: (difference) => {
    if (difference === 0) return "Same as last week";
    const count = Math.abs(difference);
    return difference > 0 ? `${count} more than last week` : `${count} fewer than last week`;
  },
  weeklyChart: (weeks) => `New leads per week, last ${weeks} weeks`,
  // "This week" does not fit under a bar.
  thisWeek: "Now",
  lastWeeks: (weeks) => `Last ${weeks} weeks`,
  updated: (minutes) => {
    if (minutes < 1) return "Updated just now";
    if (minutes === 1) return "Updated a minute ago";
    if (minutes < 60) return `Updated ${minutes} minutes ago`;
    const hours = Math.round(minutes / 60);
    return hours === 1 ? "Updated an hour ago" : `Updated ${hours} hours ago`;
  },
  toLeads: "All leads",

  birthdaysLink: "Birthdays",
  birthdaysToday: (count) => {
    if (count === 0) return "No birthdays today";
    return count === 1 ? "1 birthday greeting" : `${count} birthday greetings`;
  },
  birthdaysSent: (_count, time) => `Sent automatically at ${time}`,
  birthdaysDue: (_count, time) => `Going out automatically at ${time}`,
  birthdaysPaused: "Automatic greetings are off",
  passportsNew: (count) => {
    if (count === 0) return "No new passports";
    return count === 1 ? "1 new passport" : `${count} new passports`;
  },
  passportsTodayLines: (count) => {
    if (count === 0) return ["No new", "passports today"];
    return count === 1 ? ["1 new passport", "today"] : [`${count} new passports`, "today"];
  },
  couldNotLoad: "Didn’t load",

  greeting: {
    label: (holiday) => `${holiday} greeting`,
    next: "Next greeting",
    nextPhone: (date) => `Next greeting · Holiday eve ${date}`,
    recipients: (count) => `${count} recipients`,
    when: (date, time) => `Holiday eve · ${date} · ${time}`,
    status: {
      draft: "Draft",
      "awaiting-approval": "Awaiting approval",
      scheduled: "Scheduled",
      sending: "Sending",
      completed: "Sent",
    },
    stages: { write: "Write", review: "Review", approve: "Approve", track: "Send" },
    approve: "Approve and send",
    preview: "Preview",
    previewPhone: "Preview",
    confirmTitle: (holiday, count) => `Send the ${holiday} greeting to ${count} customers?`,
    confirmBody: (date, time, messages, minutes) =>
      `It goes out on the holiday eve, ${date} at ${time}, ${messages} messages every ${minutes} minutes.`,
    approved: (holiday, date, time) => `${holiday} greeting approved. It goes out on ${date} at ${time}.`,
    approveFailed: "The approval didn’t go through. Please try again.",
    none: "No greeting is waiting to go out",
    toGreetings: "Holiday greetings",
  },

  leads: {
    title: "Recent leads",
    all: "All leads",
    columns: { name: "Name", group: "Group", source: "Source", status: "Status", updated: "Updated" },
    noGroup: "No group",
    empty: "No open leads right now",
  },

  sources: {
    "landing-page": "Landing page",
    instagram: "Instagram",
    facebook: "Facebook",
    whatsapp: "WhatsApp",
    referral: "Referral",
  },

  groups: {
    title: "Active groups",
    all: "View all",
    flight: "Flight",
    event: "Event",
    womenOnly: "Women only",
    departs: (date) => `Departs ${date}`,
    registered: (registered, capacity) => `${registered} of ${capacity} registered`,
    registeredCount: (registered) => `${registered} registered`,
    noDate: "Date to be set",
    empty: "No active groups right now",
  },

  passports: {
    title: "WhatsApp passports",
    toReview: (count) => `${count} to review`,
    today: "today",
    result: { matched: "Matched", "new-card": "New card", "needs-review": "Needs review" },
    addedToCard: "Added to the existing card",
    link: "Customers and passports",
    empty: "No passports came in today yet",
  },

  activity: {
    title: "Recent activity",
    today: "Today",
    empty: "No activity yet",
    lead: (source, service) => (service ? `New lead · ${source} · ${service}` : `New lead · ${source}`),
    registration: (group) => `Registered · ${group}`,
    passport: { matched: "Passport added to her card", "new-card": "Passport opened a new card", "needs-review": "Passport waiting for review" },
    importTitle: "Copy from Monday",
    importDetail: (leads, customers) => `${leads} leads · ${customers} customers`,
  },
};
