import type { leadsCopy as he } from "./leads.he";
import type { Widen } from "./types";

export const leadsCopy: Widen<typeof he> = {
  status: {
    new: "New",
    "no-answer": "No answer",
    talking: "In talks",
    "details-sent": "Details sent",
    registered: "Registered",
    "not-relevant": "Not relevant",
  },

  title: "Leads",
  summary: (open, newThisWeek) => `${open} open · ${newThisWeek} new this week`,
  summaryPhone: (open) => `${open} open`,
  pending: "…",
  separator: " · ",
  noteLine: (note, when) => `${note} · ${when}`,

  monday: {
    synced: (when) => `Synced from Monday · ${when}`,
    notYet: "Not copied from Monday yet",
  },

  days: {
    label: "Leads by day",
    today: "Today",
    yesterday: "Yesterday",
    title: (relative, weekday, date) => `${relative ? `${relative} · ` : ""}${weekday}, ${date}`,
    allDays: "All days",
    backToToday: "Back to today",
    earlier: "Earlier days",
    later: "Later days",
    calendar: "Month calendar",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    range: (from, to) => `${from} – ${to}`,
    pickDay: "Pick a day on the calendar",
    monthTotal: (count) => `${count} leads this month`,
    unit: (count) => (count === 0 ? "No leads came in" : count === 1 ? "new lead" : "new leads"),
    openUnit: "open leads",
    none: "No inquiries came in that day",
    filtered: (count) => `${count} of them match the filters`,
    split: {
      new: (count) => `${count} new`,
      working: (count) => `${count} in progress`,
      "no-answer": (count) => `${count} no answer`,
      registered: (count) => `${count} registered`,
    },
    dayLabel: (date, count) => `${date}: ${count === 1 ? "1 lead" : `${count} leads`}`,
  },

  filters: {
    label: "Lead filters",
    status: "Filter by status",
    statusOptions: {
      all: "All",
      new: "New",
      "no-answer": "No answer",
      talking: "In talks",
      "details-sent": "Details sent",
      registered: "Registered",
      "not-relevant": "Not relevant",
    },
    source: "Source",
    allSources: "All sources",
    service: "Service",
    allServices: "All services",
    clear: "Clear filters",
  },

  sources: {
    "landing-page": "Website",
    instagram: "Instagram",
    facebook: "Facebook",
    whatsapp: "WhatsApp",
    referral: "Referral",
  },

  services: {
    uman: "Uman flights",
    challah: "Challah evenings",
  },
  noService: "No service given",

  search: "Search by name or phone",

  leadCount: (count) => (count === 1 ? "1 lead" : `${count} leads`),
  archived: "Archive",

  board: {
    label: "Leads board by status",
    title: {
      today: "Today's leads, by status",
      day: (date) => `Leads from ${date}, by status`,
      all: "All open leads, by status",
    },
    columns: { new: "New", working: "In progress", "no-answer": "No answer", registered: "Registered", "not-relevant": "Not relevant" },
    empty: "No leads here",
    more: (count) => `Show ${count} more`,
    showCards: "Show the cards",
    hideCards: "Hide the cards",
    attempts: (count) => (count === 1 ? "1 attempt" : `${count} attempts`),
    whatsapp: (name) => `WhatsApp ${name}`,
    call: (name) => `Call ${name}`,
  },

  empty: {
    filtered: "No leads match these filters",
    none: "No open leads right now",
  },

  detail: {
    title: "Lead details",
    label: (name) => `Lead details: ${name}`,
    whatsapp: "WhatsApp",
    call: "Call",
    newTab: (label) => `${label} (opens in a new tab)`,
    phone: "Phone",
    source: "Source",
    service: "Service",
    mondayGroup: "Monday group",
    inquiry: "First contact",
    calls: "Calls",
    callsLine: (count, last) => (count === 0 ? "None yet" : last ? `${count} · last ${last}` : String(count)),
    inMonday: "In Monday",
    openInMonday: "Open in Monday",
    editInMonday: "Statuses and notes are changed in Monday until the switch-over.",
    nextStep: "Next step",
    lastMessage: "Last Instagram message",
    history: "Notes and calls",
    noHistory: "No notes yet",
    historyMeta: (date, by) => `${date} · ${by}`,
    notFound: "This lead wasn’t found",
    backToList: "Back to leads",
  },
};
