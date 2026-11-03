import type { LeadStatusFilter } from "../data/services";
import type { LeadService, LeadSource, LeadStatus } from "../data/types";

export const leadsCopy = {
  /** Status names, on tags, chips and in the detail. */
  status: {
    new: "חדש",
    "no-answer": "אין מענה",
    talking: "בשיחה",
    "details-sent": "נשלחו פרטים",
    registered: "הרשמה הושלמה",
    "not-relevant": "לא רלוונטי",
  } satisfies Record<LeadStatus, string>,

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

  /** The strip under the header: the leads are a copy of Monday, and when it was made. */
  monday: {
    label: "ההעתקה מ-Monday.com",
    note: "הלידים מועתקים מ-Monday.com כל שעתיים, עם ההערות. עריכה של ליד נעשית ב-Monday.",
    copiedAt: (when: string) => `עודכן ${when}`,
    notYet: "עוד לא הועתק",
    details: "לפרטי ההעתקה",
  },

  filters: {
    label: "סינון לידים",
    status: "סינון לפי סטטוס",
    statusOptions: {
      all: "הכל",
      new: "חדשים",
      "no-answer": "אין מענה",
      talking: "בשיחה",
      "details-sent": "נשלחו פרטים",
      registered: "הרשמה הושלמה",
      "not-relevant": "לא רלוונטי",
    } satisfies Record<LeadStatusFilter, string>,
    source: "מקור",
    allSources: "כל המקורות",
    service: "שירות",
    allServices: "כל השירותים",
    clear: "ניקוי הסינון",
  },

  sources: {
    "landing-page": "אתר",
    instagram: "אינסטגרם",
    facebook: "פייסבוק",
    whatsapp: "וואטסאפ",
    referral: "המלצה",
  } satisfies Record<LeadSource, string>,

  /** What the lead asked about, from Monday's "שירות". */
  services: {
    uman: "טיסות לאומן",
    challah: "הפרשות חלה",
  } satisfies Record<LeadService, string>,
  noService: "שירות לא צוין",

  search: "חיפוש לפי שם או טלפון",

  table: {
    label: "רשימת לידים לפי שירות",
    name: "שם והערה אחרונה",
    phone: "טלפון",
    source: "מקור",
    status: "סטטוס",
    updated: "עדכון",
  },
  leadCount: (count: number) => (count === 1 ? "ליד אחד" : `${count} לידים`),
  /** A lead from the old CRM board, found by a search. */
  archived: "ארכיון",

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
    text: "כאן יופיעו הפרטים שלו, השיחות וההערות מ-Monday.",
  },

  detail: {
    title: "פרטי ליד",
    label: (name: string) => `פרטי ליד: ${name}`,
    whatsapp: "וואטסאפ",
    call: "שיחה",
    /** A link that opens in a new tab. */
    newTab: (label: string) => `${label} (נפתח בלשונית חדשה)`,
    phone: "טלפון",
    source: "מקור",
    service: "שירות",
    mondayGroup: "קבוצה ב-Monday",
    inquiry: "פנייה",
    calls: "שיחות",
    callsLine: (count: number, last: string | null) => (count === 0 ? "עוד לא" : last ? `${count} · אחרונה ${last}` : String(count)),
    /** Where the lead is edited until the switch-over. */
    inMonday: "ב-Monday",
    openInMonday: "פתיחה ב-Monday",
    editInMonday: "שינוי סטטוס והוספת הערות נעשים ב-Monday, עד המעבר למערכת.",
    nextStep: "שלב הבא",
    lastMessage: "הודעה אחרונה באינסטגרם",
    history: "הערות ושיחות",
    noHistory: "אין עדיין הערות",
    /** When and who, under a note. */
    historyMeta: (date: string, by: string) => `${date} · ${by}`,
    notFound: "הליד הזה לא נמצא",
    backToList: "חזרה ללידים",
  },
} as const;
