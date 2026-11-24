import type { DesktopNavKey, PhoneTabKey } from "../app/sections";

export const nav = {
  main: "ניווט ראשי",
  tools: "כלים וניהול",
  items: {
    overview: "סקירה",
    leads: "לידים",
    customers: "לקוחות ודרכונים",
    groups: "קבוצות וטיסות",
    holidays: "ברכות לחגים",
    birthdays: "ימי הולדת",
  } satisfies Record<DesktopNavKey, string>,
  tabs: {
    home: "בית",
    leads: "לידים",
    customers: "לקוחות",
    groups: "קבוצות",
    greetings: "ברכות",
  } satisfies Record<PhoneTabKey, string>,
  whatsappPassports: (count: number) => `דרכונים מוואטסאפ, ${count} חדשים`,
  import: "העתקה מ-Monday",
  history: "היסטוריית הודעות",
  users: "משתמשים והרשאות",
  settings: "הגדרות",
  search: "חיפוש מהיר",
  notifications: (count: number) => `התראות, ${count} חדשות`,
  /** What the bell opens: the alerts its count includes, and the notes that tagged the signed-in person. */
  bell: {
    title: "התראות",
    markAllRead: "סימון הכול כנקרא",
    empty: "אין התראות חדשות",
    /** Read beside the dot of a tag nobody opened yet. */
    unread: "לא נקרא",
    mentionTitle: (lead: string) => `תיוג בהערה · ${lead}`,
    /** The author's first name and the opening of the note. */
    mentionDetail: (author: string, text: string) => `${author}: ${text}`,
    mentionsFailed: "התיוגים לא נטענו.",
    passports: (count: number) => (count === 1 ? "דרכון ממתין לבדיקה" : `${count} דרכונים ממתינים לבדיקה`),
    greeting: (holiday: string) => `ברכת ${holiday} ממתינה לאישור`,
    greetingDetail: (recipients: string) => `${recipients} נמענים`,
  },
  withNew: (label: string, count: number) => `${label}, ${count} חדשים`,
  signOut: (name: string) => `${name}, יציאה מהמערכת`,
  account: (name: string) => `${name}, חשבון וניהול`,
  back: "חזרה",
  /** The panel Ronit's avatar opens. */
  accountMenu: {
    title: "הגדרות",
    profile: "פרטים אישיים",
    team: "משתמשים והרשאות",
    import: "העתקה מ-Monday",
    language: "שפה",
    maskPassports: "הסתרת מספרי דרכון",
    password: "סיסמה",
    /** Beside "סיסמה": whether you can sign in with one yet. */
    passwordSet: "מוגדרת",
    passwordNotSet: "המשרד מגדיר",
    signOut: "התנתקות",
    name: "שם מלא",
    email: "אימייל",
    /** Under the email in your own details: it's the Google account you sign in with, so it can't change here. */
    emailNote: "לכאן מגיעים קודי הכניסה, וזה גם חשבון ה-Google שאיתו אפשר להיכנס. כדי להחליף אותו, מנהלת מזמינה את המייל החדש.",
    phone: "מספר וואטסאפ",
    phoneNote: "בדיקות של ברכות מגיעות למספר הזה.",
    phoneInvalid: "המספר לא נראה כמו מספר נייד.",
    save: "שמירה",
    saved: "הפרטים נשמרו",
    saveFailed: "הפרטים לא נשמרו. כדאי לנסות שוב.",
  },
} as const;
