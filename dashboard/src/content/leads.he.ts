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

  /** The line under the title: the leads are a copy of Monday, and when it was made. */
  monday: {
    synced: (when: string) => `מתעדכן מ-Monday · ${when}`,
    notYet: "עוד לא הועתק מ-Monday",
  },

  /** The panel above the board: how many leads came in on a day. */
  days: {
    label: "לידים לפי יום",
    today: "היום",
    yesterday: "אתמול",
    /** "היום · רביעי, 04.11" */
    title: (relative: string | null, weekday: string, date: string) => `${relative ? `${relative} · ` : ""}${weekday}, ${date}`,
    allDays: "כל הימים",
    backToToday: "חזרה להיום",
    earlier: "ימים קודמים",
    later: "ימים מאוחרים יותר",
    calendar: "לוח חודשי",
    previousMonth: "החודש הקודם",
    nextMonth: "החודש הבא",
    range: (from: string, to: string) => `${from} – ${to}`,
    pickDay: "בחרי יום בלוח",
    monthTotal: (count: string) => `${count} לידים בחודש`,
    unit: (count: number) => (count === 0 ? "לא נכנסו לידים" : count === 1 ? "ליד חדש" : "לידים חדשים"),
    openUnit: "לידים פתוחים",
    none: "ביום הזה לא נכנסו פניות",
    filtered: (count: string) => `${count} מהם בסינון הנוכחי`,
    split: {
      new: (count: string) => `${count} חדשים`,
      working: (count: string) => `${count} בטיפול`,
      "no-answer": (count: string) => `${count} בלי מענה`,
      registered: (count: string) => `${count} נרשמו`,
    },
    dayLabel: (date: string, count: number) => `${date}: ${count === 1 ? "ליד אחד" : `${count} לידים`}`,
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

  leadCount: (count: number) => (count === 1 ? "ליד אחד" : `${count} לידים`),
  /** A lead from the old CRM board, found by a search or by its day. */
  archived: "ארכיון",

  board: {
    label: "לוח לידים לפי סטטוס",
    title: {
      today: "הלידים של היום, לפי סטטוס",
      day: (date: string) => `הלידים מ-${date}, לפי סטטוס`,
      all: "כל הלידים הפתוחים, לפי סטטוס",
    },
    columns: { new: "חדש", working: "בטיפול", "no-answer": "אין מענה", registered: "נרשמו", "not-relevant": "לא רלוונטי" },
    empty: "אין לידים כאן",
    more: (count: number) => `הצגת עוד ${count}`,
    showCards: "הצגת הכרטיסים",
    hideCards: "הסתרת הכרטיסים",
    attempts: (count: number) => (count === 1 ? "ניסיון אחד" : `${count} ניסיונות`),
    whatsapp: (name: string) => `וואטסאפ ל${name}`,
    call: (name: string) => `שיחה ל${name}`,
  },

  empty: {
    filtered: "אין לידים בסינון הזה",
    none: "אין כרגע לידים פתוחים",
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
