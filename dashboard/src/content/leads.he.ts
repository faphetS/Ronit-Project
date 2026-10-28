import type { LeadStatusFilter } from "../data/services";
import type { LeadSource, LeadStatus } from "../data/types";

export const leadsCopy = {
  /** Status names, on tags, chips and in the detail. The mock writes them into lead history, in Hebrew. */
  status: {
    new: "חדש",
    talking: "בשיחה",
    "details-sent": "נשלחו פרטים",
    registered: "הרשמה הושלמה",
    "not-relevant": "לא רלוונטי",
  } satisfies Record<LeadStatus, string>,
  /** The toast after a status change. The mock writes it into lead history, in Hebrew. */
  statusChanged: (label: string) => `הסטטוס עודכן: ${label}`,

  title: "לידים",
  summary: (open: string, newThisWeek: string) => `${open} פתוחים · ${newThisWeek} חדשים השבוע`,
  summaryPhone: (open: string) => `${open} פתוחים`,
  /** Stands in for a number that is still loading. */
  pending: "…",
  /** Between parts of a line, like the phone and the source. */
  separator: " · ",
  /** The last note and when, under a lead on phones. */
  noteLine: (note: string, when: string) => `${note} · ${when}`,

  view: { label: "תצוגה", table: "טבלה", board: "לוח" },
  filter: "סינון",
  activeFilters: (count: number) => (count === 1 ? "מסנן אחד פעיל" : `${count} מסננים פעילים`),
  newLead: "ליד חדש",

  monday: {
    label: "הייבוא מ-Monday.com",
    note: "כל הלידים הועברו מ-Monday.com, כולל הערות והיסטוריית פעילות.",
    imported: (count: string) => `${count} יובאו`,
    details: "לפרטי הייבוא",
  },

  filters: {
    label: "סינון לידים",
    status: "סינון לפי סטטוס",
    statusOptions: {
      all: "הכל",
      new: "חדשים",
      talking: "בשיחה",
      "details-sent": "נשלחו פרטים",
      registered: "הרשמה הושלמה",
      "not-relevant": "לא רלוונטי",
    } satisfies Record<LeadStatusFilter, string>,
    source: "מקור",
    allSources: "כל המקורות",
    group: "קבוצה",
    allGroups: "כל הקבוצות",
    assignee: "שיוך",
    allAssignees: "שיוך: כולם",
    assignedTo: (name: string) => `שיוך: ${name}`,
    clear: "ניקוי הסינון",
  },

  sources: {
    "landing-page": "דף נחיתה",
    instagram: "אינסטגרם",
    facebook: "פייסבוק",
    whatsapp: "וואטסאפ",
    referral: "המלצה",
  } satisfies Record<LeadSource, string>,

  search: "חיפוש לפי שם או טלפון",

  table: {
    label: "רשימת לידים לפי קבוצה",
    name: "שם והערה אחרונה",
    phone: "טלפון",
    source: "מקור",
    status: "סטטוס",
    updated: "עדכון",
  },
  /** After a trip's name: when it leaves. */
  departs: (date: string) => `יציאה ${date}`,
  noGroup: "ללא קבוצה",
  leadCount: (count: number) => (count === 1 ? "ליד אחד" : `${count} לידים`),

  board: {
    label: "לוח לידים לפי סטטוס",
    empty: "אין לידים",
  },

  empty: {
    filtered: "אין לידים בסינון הזה",
    none: "אין כרגע לידים פתוחים",
  },

  /** In the side column on desktop, until a lead is chosen. */
  hint: {
    title: "בחרי ליד מהרשימה",
    text: "כאן יופיעו הפרטים שלו, הסטטוס, ההיסטוריה וההערות.",
  },

  detail: {
    title: "פרטי ליד",
    label: (name: string) => `פרטי ליד: ${name}`,
    whatsapp: "וואטסאפ",
    call: "שיחה",
    /** The WhatsApp link opens in a new tab. */
    newTab: (label: string) => `${label} (נפתח בלשונית חדשה)`,
    phone: "טלפון",
    source: "מקור",
    assignee: "שיוך",
    created: "נוצר",
    unassigned: "לא משויך",
    status: "סטטוס",
    changeStatus: "שינוי סטטוס",
    statusFailed: "הסטטוס לא עודכן. אפשר לנסות שוב.",
    history: "היסטוריה",
    noHistory: "אין עדיין פעילות",
    /** When and who, under a history entry. */
    historyMeta: (date: string, by: string) => `${date} · ${by}`,
    /** Under an entry that came over in the import: the Monday board it came from. */
    mondayBoard: (board: string) => `לוח ${board}`,
    note: "הערה חדשה",
    notePlaceholder: "מה סוכם בשיחה?",
    save: "שמירה",
    noteSaved: "ההערה נשמרה",
    noteEmpty: "כתבי הערה לפני השמירה",
    noteFailed: "ההערה לא נשמרה. אפשר לנסות שוב.",
    notFound: "הליד הזה לא נמצא",
    backToList: "חזרה ללידים",
  },
} as const;
