import type { leadsCopy as he } from "./leads.he";
import type { Widen } from "./types";

export const leadsCopy: Widen<typeof he> = {
  status: {
    new: "New",
    talking: "In talks",
    "details-sent": "Details sent",
    registered: "Registered",
    "not-relevant": "Not relevant",
  },
  statusChanged: (label) => `Status updated: ${label}`,

  title: "Leads",
  summary: (open, newThisWeek) => `${open} open · ${newThisWeek} new this week`,
  summaryPhone: (open) => `${open} open`,
  pending: "…",
  separator: " · ",
  noteLine: (note, when) => `${note} · ${when}`,

  view: { label: "View", table: "Table", board: "Board" },
  filter: "Filters",
  activeFilters: (count) => (count === 1 ? "1 filter on" : `${count} filters on`),
  newLead: "New lead",

  monday: {
    label: "The Monday.com import",
    note: "Every lead came over from Monday.com, with its notes and activity history.",
    imported: (count) => `${count} imported`,
    details: "Import details",
  },

  filters: {
    label: "Lead filters",
    status: "Filter by status",
    statusOptions: {
      all: "All",
      new: "New",
      talking: "In talks",
      "details-sent": "Details sent",
      registered: "Registered",
      "not-relevant": "Not relevant",
    },
    source: "Source",
    allSources: "All sources",
    group: "Group",
    allGroups: "All groups",
    assignee: "Assignee",
    allAssignees: "Assignee: everyone",
    assignedTo: (name) => `Assignee: ${name}`,
    clear: "Clear filters",
  },

  sources: {
    "landing-page": "Landing page",
    instagram: "Instagram",
    facebook: "Facebook",
    whatsapp: "WhatsApp",
    referral: "Referral",
  },

  search: "Search by name or phone",

  table: {
    label: "Leads by group",
    name: "Name and last note",
    phone: "Phone",
    source: "Source",
    status: "Status",
    updated: "Updated",
  },
  departs: (date) => `Departs ${date}`,
  noGroup: "No group",
  leadCount: (count) => (count === 1 ? "1 lead" : `${count} leads`),

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
    text: "Its details, status, history and notes will show up here.",
  },

  detail: {
    title: "Lead details",
    label: (name) => `Lead details: ${name}`,
    whatsapp: "WhatsApp",
    call: "Call",
    newTab: (label) => `${label} (opens in a new tab)`,
    phone: "Phone",
    source: "Source",
    assignee: "Assignee",
    created: "Created",
    unassigned: "Unassigned",
    status: "Status",
    changeStatus: "Change status",
    statusFailed: "The status wasn’t updated. Please try again.",
    history: "History",
    noHistory: "No activity yet",
    historyMeta: (date, by) => `${date} · ${by}`,
    mondayBoard: (board) => `Monday board: ${board}`,
    note: "New note",
    notePlaceholder: "What was agreed on the call?",
    save: "Save",
    noteSaved: "Note saved",
    noteEmpty: "Write a note before saving",
    noteFailed: "The note wasn’t saved. Please try again.",
    notFound: "This lead wasn’t found",
    backToList: "Back to leads",
  },
};
