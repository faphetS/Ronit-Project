import type { CampaignStage, CampaignStatus, IntakeResult, LeadSource } from "../data/types";

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

  // The orb card: today.
  birthdaysLink: "ימי הולדת",
  birthdaysToday: (count: number) => {
    if (count === 0) return "אין ימי הולדת היום";
    return count === 1 ? "ברכת יום הולדת אחת" : `${count} ברכות יום הולדת`;
  },
  /** "יצאו" reads as both "went out" and "will go out". */
  birthdaysSent: (count: number, time: string) => (count === 1 ? `יצאה אוטומטית ב-${time}` : `יצאו אוטומטית ב-${time}`),
  birthdaysDue: (count: number, time: string) => (count === 1 ? `תצא אוטומטית ב-${time}` : `יצאו אוטומטית ב-${time}`),
  birthdaysPaused: "הברכות האוטומטיות כבויות",
  passportsNew: (count: number) => {
    if (count === 0) return "אין דרכונים חדשים";
    return count === 1 ? "דרכון חדש אחד" : `${count} דרכונים חדשים`;
  },
  /** The same on phones, over two lines. */
  passportsTodayLines: (count: number) => {
    if (count === 0) return ["אין דרכונים", "חדשים היום"] as const;
    return count === 1 ? (["דרכון אחד", "חדש היום"] as const) : ([`${count} דרכונים`, "חדשים היום"] as const);
  },
  couldNotLoad: "לא נטען",

  greeting: {
    label: (holiday: string) => `ברכת ${holiday}`,
    next: "הברכה הבאה",
    nextPhone: (date: string) => `הברכה הבאה · ערב החג ${date}`,
    recipients: (count: string) => `${count} נמענים`,
    when: (date: string, time: string) => `ערב החג · ${date} · ${time}`,
    status: {
      draft: "טיוטה",
      "awaiting-approval": "ממתינה לאישור",
      scheduled: "מתוזמנת",
      sending: "בשליחה",
      completed: "נשלחה",
    } satisfies Record<CampaignStatus, string>,
    stages: { write: "כתיבה", review: "בדיקה", approve: "אישור", track: "שליחה" } satisfies Record<CampaignStage, string>,
    approve: "אישור ושליחה",
    preview: "תצוגה",
    previewPhone: "תצוגה מקדימה",
    confirmTitle: (holiday: string, count: string) => `לשלוח את ברכת ${holiday} ל-${count} לקוחות?`,
    confirmBody: (date: string, time: string, messages: number, minutes: number) =>
      `הברכה תצא בערב החג, ${date} ב-${time}, ${messages} הודעות כל ${minutes} דקות.`,
    approved: (holiday: string, date: string, time: string) => `ברכת ${holiday} אושרה ותצא ב-${date} ב-${time}`,
    approveFailed: "האישור לא נשמר. אפשר לנסות שוב.",
    none: "אין כרגע ברכה שמחכה לשליחה",
    toGreetings: "לברכות לחגים",
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
