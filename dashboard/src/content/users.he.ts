import type { AccessLevel, ImportRun, PassportSource, PermissionArea, Role, SecuritySwitch, TwoStepStatus } from "../data/types";

/** Copy for the users and access screen, and for the account and admin screen on phones. */
export const usersCopy = {
  title: "משתמשים והרשאות",
  /** The headline's second line until the users load. */
  softFallback: "מי נכנס ומה רואים",
  /** "3 פעילים · הזמנה אחת ממתינה". */
  summary: (active: number, pending: number) => {
    const people = active === 1 ? "פעיל אחד" : `${active} פעילים`;
    if (pending === 0) return people;
    return `${people} · ${pending === 1 ? "הזמנה אחת ממתינה" : `${pending} הזמנות ממתינות`}`;
  },
  activeCount: (active: number) => (active === 1 ? "פעיל אחד" : `${active} פעילים`),
  note: "רק משתמשים מורשים נכנסים למערכת. גישה לפרטי הדרכון המלאים ניתנת בנפרד.",
  invite: "הזמנת משתמש",
  today: (clock: string) => `היום ${clock}`,
  yesterday: (clock: string) => `אתמול ${clock}`,
  roles: { admin: "ניהול", office: "משרד", sales: "מכירות" } satisfies Record<Role, string>,
  users: {
    title: "משתמשים",
    columns: {
      user: "משתמש",
      role: "תפקיד",
      passport: "פרטי דרכון",
      lastSignIn: "כניסה אחרונה",
      twoStep: "אימות דו-שלבי",
    },
    passportFull: "גישה מלאה",
    passportNone: "ללא גישה",
    twoStep: { active: "פעיל", "not-set": "לא הוגדר" } satisfies Record<TwoStepStatus, string>,
    /** Read instead of the dot in the two-step column of a pending invite. */
    twoStepNotYet: "עדיין לא הוגדר",
    neverSignedIn: "אין כניסה עדיין",
    /** In a pending invite's avatar, and in its empty two-step cell. */
    inviteInitial: "?",
    noValue: "·",
    pendingInvite: "הזמנה ממתינה",
    inviteSent: (date: string) => `ההזמנה נשלחה ${date}`,
    empty: "אין משתמשים להצגה.",
  },
  permissions: {
    title: "הרשאות לפי תפקיד",
    adminOnly: "שינוי הרשאות זמין לניהול בלבד",
    area: "תחום",
    areas: {
      leads: "לידים",
      customers: "לקוחות",
      passports: "פרטי דרכון מלאים",
      greetings: "ברכות ושליחה",
      import: "ייבוא מ-Monday",
      users: "משתמשים והרשאות",
    } satisfies Record<PermissionArea, string>,
    access: { full: "גישה מלאה", view: "צפייה", none: "ללא גישה" } satisfies Record<AccessLevel, string>,
    empty: "אין הרשאות להצגה.",
  },
  security: {
    title: "אבטחה",
    twoStepRequired: "אימות דו-שלבי חובה לכל המשתמשים",
    twoStepRequiredShort: "אימות דו-שלבי חובה",
    maskPassportNumbers: "מספרי דרכון מוסתרים ברשימות",
    autoSignOut: (minutes: number) => `יציאה אוטומטית אחרי ${minutes} דקות`,
    passportAccessLog: "יומן גישה לכל צפייה בדרכון",
    turnedOn: (setting: string) => `ההגדרה הופעלה: ${setting}`,
    turnedOff: (setting: string) => `ההגדרה כובתה: ${setting}`,
    failed: "השינוי לא נשמר. נסי שוב.",
  },
  audit: {
    title: "פעולות רגישות אחרונות",
    empty: "עדיין אין פעולות רגישות.",
    /** Who did an automatic action. */
    system: "המערכת",
    meta: (who: string, when: string) => `${who} · ${when}`,
    passportView: (customer: string) => `צפייה בדרכון · ${customer}`,
    passportPhotoView: (customer: string) => `צפייה בצילום הדרכון · ${customer}`,
    passportReceived: (customer: string, via: string) => `קליטת דרכון ${via} · ${customer}`,
    via: { whatsapp: "מוואטסאפ", monday: "מ-Monday", manual: "ידנית" } satisfies Record<PassportSource, string>,
    greetingEdit: (holiday: string) => `עריכת ברכת ${holiday}`,
    greetingApprove: (holiday: string) => `אישור ברכת ${holiday}`,
    /** "שינוי הרשאות · מורן למכירות". */
    roleChange: (user: string, role: string) => `שינוי הרשאות · ${user} ${role}`,
    roleTo: { admin: "לניהול", office: "למשרד", sales: "למכירות" } satisfies Record<Role, string>,
    newDevice: "כניסה ממכשיר חדש",
    securityChange: (setting: string, enabled: boolean) => `${enabled ? "הפעלת" : "כיבוי"} ${setting}`,
    settings: {
      twoStepRequired: "חובת אימות דו-שלבי",
      maskPassportNumbers: "הסתרת מספרי דרכון",
      autoSignOut: "יציאה אוטומטית",
      passportAccessLog: "יומן הגישה לדרכונים",
    } satisfies Record<SecuritySwitch, string>,
    mondayClose: "סגירת Monday.com",
  },
  account: {
    title: "חשבון וניהול",
    label: "החשבון שלי",
    passportsFull: "גישה מלאה לדרכונים",
    passportsNone: "ללא גישה לדרכונים",
    admin: "ניהול",
    import: "ייבוא מ-Monday",
    importStatus: { running: "בתהליך", completed: "הושלם", failed: "נכשל" } satisfies Record<ImportRun["status"], string>,
    history: "היסטוריית הודעות",
    signOut: "יציאה מהמערכת",
    signOutFailed: "היציאה מהמערכת לא הצליחה. נסי שוב.",
    passportsTag: "דרכונים",
    noPassportsTag: "ללא דרכונים",
    /** "משרד · היום 15:02". */
    personLine: (role: string, when: string) => `${role} · ${when}`,
    /** "מכירות · נשלחה 27.10". */
    inviteLine: (role: string, date: string) => `${role} · נשלחה ${date}`,
    noOthers: "אין עוד משתמשים.",
  },
} as const;
