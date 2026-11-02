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

  view: { label: "View", table: "Table", board: "Board" },
  filter: "Filters",
  activeFilters: (count) => (count === 1 ? "1 filter on" : `${count} filters on`),

  monday: {
    label: "The copy from Monday.com",
    note: "Leads are copied from Monday.com every 2 hours, with their notes. Leads are edited in Monday.",
    copiedAt: (when) => `Updated ${when}`,
    notYet: "Not copied yet",
    details: "Copy details",
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

  table: {
    label: "Leads by service",
    name: "Name and last note",
    phone: "Phone",
    source: "Source",
    status: "Status",
    updated: "Updated",
  },
  leadCount: (count) => (count === 1 ? "1 lead" : `${count} leads`),
  archived: "Archive",

  board: {
    label: "Leads board by status",
    empty: "No leads",
  },

  empty: {
    filtered: "No leads match these filters",
    none: "No open leads right now",
  },

  hint: {
    title: "Choose a lead from the list",
    text: "Its details, calls and notes from Monday will show up here.",
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
