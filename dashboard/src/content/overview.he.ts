import type { IntakeResult, LeadSource } from "../data/types";

export const overview = {
  title: "שלום, רונית",
  soft: "בואי נראה מה קורה היום",
  softPhone: "מה קורה היום?",
  numbersLabel: "המספרים של היום",
  numbers: { openLeads: "לידים פתוחים", customers: "לקוחות", activeGroups: "קבוצות פעילות" },
  pending: "…",
  weekTitle: "לידים השבוע",
  breakdown: (counts: { new: number; talking: number; registered: number }) =>
    `${counts.new} חדשים · ${counts.talking} בשיחה · ${counts.registered} נרשמו`,
  allLeads: "לכל הלידים",
  today: "היום",
  sideNote: "היום בעסק",
  restTitle: "עוד בסקירה",
  rest: "שאר הסקירה תיבנה בשלב הבא: לידים אחרונים, קבוצות, דרכונים ופעילות.",

  // The black card: leads this week.
  newLeads: "לידים חדשים",
  versusLastWeek: (difference: number) => {
    if (difference === 0) return "כמו בשבוע שעבר";
    const count = Math.abs(difference);
    if (difference > 0) return count === 1 ? "ליד אחד יותר משבוע שעבר" : `${count} יותר משבוע שעבר`;
    return count === 1 ? "ליד אחד פחות משבוע שעבר" : `${count} פחות משבוע שעבר`;
  },
  weeklyChart: (weeks: number) => `לידים חדשים בכל שבוע, ${weeks} השבועות האחרונים`,
  /** The axis label under this week's bar. */
  thisWeek: "השבוע",
  lastWeeks: (weeks: number) => `${weeks} השבועות האחרונים`,
  /** How fresh the numbers are, in whole minutes. */
  updated: (minutes: number) => {
    if (minutes < 1) return "עודכן עכשיו";
    if (minutes === 1) return "עודכן לפני דקה";
    if (minutes < 60) return `עודכן לפני ${minutes} דקות`;
    const hours = Math.round(minutes / 60);
    return hours === 1 ? "עודכן לפני שעה" : `עודכן לפני ${hours} שעות`;
  },
  toLeads: "ללידים",

  // The orb card: today's leads.
  leadsToday: (count: number) => {
    if (count === 0) return "עוד אין לידים היום";
    return count === 1 ? "ליד אחד היום" : `${count} לידים היום`;
  },
  /** One source and how many of today's leads came from it: "פייסבוק 3". */
  sourceCount: (source: string, count: number) => `${source} ${count}`,
  /** Today's leads still marked new: nobody has been in touch yet. */
  leadsWaiting: (count: number) => {
    if (count === 0) return "כולם כבר בטיפול";
    return count === 1 ? "ליד אחד מחכה לטיפול" : `${count} מחכים לטיפול`;
  },
  /** Desktop: the leads board opens on today. */
  todaysLeadsLink: "ללידים של היום",
  /** Phones: the list has no days, so this opens the new ones. */
  newLeadsLink: "ללידים החדשים",
  couldNotLoad: "לא נטען",

  // The calendar card: challah bookings, flights and holidays. No birthdays: they aren't kept.
  calendar: {
    title: "לוח אירועים",
    previousMonth: "החודש הקודם",
    nextMonth: "החודש הבא",
    comingUp: "האירועים הקרובים",
    backToComingUp: "לאירועים הקרובים",
    /** A booking without Monday's "סוג האירוע" or "עיר". */
    challahEvent: "אירוע חלה",
    departs: "יציאה לטיסה",
    returns: "חזרה מהטיסה",
    /** A day in the grid, for screen readers: "08.11, 2 אירועים". */
    dayLabel: (date: string, count: number) => {
      if (count === 0) return date;
      return count === 1 ? `${date}, אירוע אחד` : `${date}, ${count} אירועים`;
    },
    nothingThatDay: "אין אירועים ביום הזה",
    nothingAhead: "אין אירועים קרובים",
  },

  leads: {
    title: "לידים אחרונים",
    all: "לכל הלידים",
    columns: { name: "שם", group: "קבוצה", source: "מקור", status: "סטטוס", updated: "עדכון" },
    noGroup: "ללא קבוצה",
    empty: "אין לידים פתוחים כרגע",
  },

  sources: {
    "landing-page": "דף נחיתה",
    instagram: "אינסטגרם",
    facebook: "פייסבוק",
    whatsapp: "וואטסאפ",
    referral: "המלצה",
  } satisfies Record<LeadSource, string>,

  groups: {
    title: "קבוצות פעילות",
    all: "הכל",
    flight: "טיסה",
    event: "אירוע",
    womenOnly: "נשים בלבד",
    departs: (date: string) => `יציאה ${date}`,
    registered: (registered: string, capacity: string) => `${registered} מתוך ${capacity} נרשמו`,
    registeredCount: (registered: string) => `${registered} נרשמו`,
    noDate: "מועד ייקבע",
    empty: "אין קבוצות פעילות כרגע",
  },

  passports: {
    title: "דרכונים מוואטסאפ",
    toReview: (count: number) => `${count} לבדיקה`,
    today: "היום",
    result: { matched: "התאמה", "new-card": "כרטיס חדש", "needs-review": "בדיקה" } satisfies Record<IntakeResult, string>,
    /** Under a passport that matched a customer. */
    addedToCard: "נוסף לכרטיס הקיים",
    link: "ללקוחות ודרכונים",
    empty: "עוד לא הגיעו דרכונים היום",
  },

  activity: {
    title: "פעילות אחרונה",
    today: "היום",
    empty: "עדיין אין פעילות",
    /** Under a new lead's name: where she came from and what she asked about. */
    lead: (source: string, service: string | null) => (service ? `ליד חדש · ${source} · ${service}` : `ליד חדש · ${source}`),
    registration: (group: string) => `נרשמה · ${group}`,
    passport: { matched: "דרכון נקלט לכרטיס", "new-card": "דרכון פתח כרטיס חדש", "needs-review": "דרכון ממתין לבדיקה" } satisfies Record<IntakeResult, string>,
    importTitle: "העתקה מ-Monday",
    importDetail: (leads: string, customers: string) => `${leads} לידים · ${customers} לקוחות`,
  },
} as const;
