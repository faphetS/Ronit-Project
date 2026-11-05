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

  leadsToday: (count) => {
    if (count === 0) return "No leads yet today";
    return count === 1 ? "1 lead today" : `${count} leads today`;
  },
  sourceCount: (source, count) => `${source} ${count}`,
  leadsWaiting: (count) => {
    if (count === 0) return "All being handled";
    return count === 1 ? "1 waiting to be handled" : `${count} waiting to be handled`;
  },
  todaysLeadsLink: "Today’s leads",
  newLeadsLink: "New leads",
  couldNotLoad: "Didn’t load",

  calendar: {
    title: "Calendar",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    comingUp: "Coming up",
    backToComingUp: "Back to coming up",
    challahEvent: "Challah event",
    departs: "Flight leaves",
    returns: "Flight returns",
    dayLabel: (date, count) => {
      if (count === 0) return date;
      return count === 1 ? `${date}, 1 event` : `${date}, ${count} events`;
    },
    nothingThatDay: "Nothing on this day",
    nothingAhead: "Nothing coming up",
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
