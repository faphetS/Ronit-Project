import type { BoardKind, CopyStatus } from "../data/types";

/** Copy for the screen about the copy from Monday.com. Board and column names come from Monday and stay as stored. */
export const importCopy = {
  title: "העתקה מ-Monday.com",
  soft: "עד המעבר למערכת",
  /** The title in the phone's top bar. */
  phoneTitle: "העתקה מ-Monday",
  intro: "הלידים, הטיסות והאירועים מועתקים מ-Monday.com לכאן כל שעתיים. הצוות ממשיך לעבוד ב-Monday, ומה שמשתנה שם מגיע לכאן בהעתקה הבאה.",
  result: {
    label: "מצב ההעתקה",
    status: {
      completed: "הנתונים מעודכנים",
      running: "מעתיקים עכשיו מ-Monday",
      failed: "ההעתקה האחרונה נכשלה",
      skipped: "ההעתקה האחרונה דולגה",
    } satisfies Record<CopyStatus, string>,
    /** Monday was limiting calls, or something failed: the data on screen is from the copy before. */
    keptPrevious: "מוצגים הנתונים מההעתקה הקודמת.",
    copiedAt: (when: string) => `עודכן ${when}`,
    notYet: "עוד לא הועתק",
    moved: { first: "לידים", second: "מהלוח הפעיל" },
    movedPhone: { first: "לידים", second: "פעילים" },
    archived: "לידים בארכיון",
    archivedPhone: "בארכיון",
    customers: "לקוחות מהטיסות והאירועים",
    customersPhone: "לקוחות",
    withoutPhone: "שיחות אינסטגרם בלי טלפון",
    withoutPhonePhone: "בלי טלפון",
    toLeads: "מעבר ללידים",
    copyNow: "העתקה עכשיו",
    copying: "מעתיק…",
    started: "ההעתקה התחילה. זה לוקח כחצי דקה.",
    tooSoon: "רק עכשיו הועתק. אפשר שוב בעוד כמה דקות.",
    failedToStart: "ההעתקה לא התחילה. נסי שוב.",
  },
  schedule: {
    title: "מתי מעתיקים",
    every: "כל שעתיים, מ-07:00 עד 23:00",
    next: (when: string) => `ההעתקה הבאה: ${when}`,
    last: (when: string) => `האחרונה: ${when}`,
    off: "ההעתקה כבויה בשרת, אז הנתונים לא מתעדכנים.",
    readOnly: "ההעתקה רק קוראת מ-Monday ולא משנה בו כלום.",
    todayAt: (time: string) => `היום ב-${time}`,
    tomorrowAt: (time: string) => `מחר ב-${time}`,
  },
  boards: {
    title: "לוחות ב-Monday",
    label: "הלוחות שמועתקים",
    items: (count: string) => `${count} פריטים`,
    kind: {
      crm: "לידים",
      "crm-archive": "לידים ישנים, בארכיון",
      flight: "טיסה",
      challah: "הפרשות חלה",
    } satisfies Record<BoardKind, string>,
    empty: "עוד לא הועתקו לוחות.",
  },
  mapping: {
    title: "מה עובר לאן",
    hint: "ב-Monday ← במערכת",
    table: "מה מ-Monday נכנס לאן במערכת",
    columns: { monday: "ב-Monday", field: "במערכת" },
    rows: [
      { monday: "שם, מספר טלפון", field: "ליד: שם וטלפון. שורה בלי טלפון לא נכנסת" },
      { monday: "הקבוצה ו״נוצר קשר״", field: "סטטוס הליד" },
      { monday: "מקור ליד, הודעה אחרונה באינסטגרם", field: "מקור: פייסבוק, אינסטגרם או אתר" },
      { monday: "שירות", field: "אומן או הפרשת חלה" },
      { monday: "עדכונים", field: "הערות ושיחות של הליד" },
      { monday: "לוח טיסה", field: "טיסה, והנוסעות כלקוחות" },
      { monday: "לוח הפרשות חלה", field: "אירוע לכל חודש, והמזמינות כלקוחות" },
    ],
  },
  monday: {
    title: "Monday נשאר כלי העבודה",
    body: "עד המעבר, עובדים ב-Monday: סטטוסים, הערות ולידים חדשים. האוטומציות ממשיכות לכתוב לשם, והמערכת מציגה העתק.",
    next: "במעבר, לידים חדשים ייכנסו ישר לכאן, ו-Monday ייסגר.",
  },
} as const;
