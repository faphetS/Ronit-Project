import type { AccessLevel, CopyStatus, PassportSource, PermissionArea, Role, SecuritySwitch, TwoStepStatus } from "../data/types";

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
  /** The invite form: they sign in with the Google account of this email. */
  inviteForm: {
    title: "הזמנת משתמש",
    body: "הכניסה היא עם חשבון Google של המייל הזה. ההזמנה נשלחת במייל.",
    email: "מייל (חשבון Google)",
    name: "שם",
    role: "תפקיד",
    passportAccess: "גישה לפרטי דרכון מלאים",
    salesNoPassports: "למכירות אין גישה לדרכונים.",
    send: "שליחת ההזמנה",
    sent: (email: string) => `ההזמנה נשלחה אל ${email}`,
    notEmailed: "החשבון נפתח, אבל המייל לא נשלח. אפשר להעביר את הקישור למערכת ידנית.",
    exists: "למייל הזה כבר יש חשבון.",
    invalid: "צריך שם ומייל תקין.",
    failed: "ההזמנה לא נשלחה. נסי שוב.",
  },
  /** Removing someone: they can't sign in any more, and are signed out everywhere. */
  remove: {
    action: "הסרה",
    cancelInvite: "ביטול ההזמנה",
    title: (name: string) => `להסיר את ${name}?`,
    /** A pending invite: "לבטל את ההזמנה של dana@gmail.com?". */
    inviteTitle: (email: string) => `לבטל את ההזמנה של ${email}?`,
    inviteBody: "אי אפשר יהיה להיכנס עם המייל הזה. אפשר להזמין אותו שוב בכל זמן.",
    body: "לא תהיה יותר כניסה למערכת, וכל החיבורים הפתוחים ייסגרו. אפשר להזמין שוב בכל זמן.",
    confirm: "הסרה",
    done: "ההסרה בוצעה",
    failed: "ההסרה לא הצליחה. נסי שוב.",
  },
  /** Changing someone's role and passport access, or a pending invite's. */
  edit: {
    action: "עריכה",
    title: (name: string) => `ההרשאות של ${name}`,
    body: "התפקיד קובע מה רואים בכל תחום, לפי הטבלה. השינוי חל מיד.",
    /** Beside your own role, which another admin changes. */
    ownRole: "את התפקיד שלך משנה מנהל אחר.",
    save: "שמירה",
    saved: (name: string) => `ההרשאות של ${name} עודכנו`,
    lastAdmin: "צריך להישאר לפחות מנהל אחד.",
    failed: "השינוי לא נשמר. נסי שוב.",
  },
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
      import: "העתקה מ-Monday",
      users: "משתמשים והרשאות",
    } satisfies Record<PermissionArea, string>,
    access: { full: "גישה מלאה", view: "צפייה", none: "ללא גישה" } satisfies Record<AccessLevel, string>,
    empty: "אין הרשאות להצגה.",
    /** For admins, in place of adminOnly. */
    adminHint: "לחיצה על תא משנה אותו",
    /** Read beside a cell that can't change. */
    fixed: "קבוע",
    /** Under the table, for admins: why some cells don't change. */
    fixedNote: "לניהול תמיד גישה מלאה, למכירות אין גישה לדרכונים, ורק הניהול מנהל משתמשים.",
    /** The sheet for one cell: "משרד · לקוחות". */
    change: {
      title: (role: string, area: string) => `${role} · ${area}`,
      body: "מה התפקיד יכול לעשות בתחום הזה. השינוי חל על כל מי שבתפקיד, מיד.",
      label: "רמת גישה",
      save: "שמירה",
      saved: (role: string, area: string, level: string) => `${role} · ${area}: ${level}`,
      failed: "השינוי לא נשמר. נסי שוב.",
    },
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
    greetingTest: (holiday: string) => `בדיקת ברכת ${holiday} בוואטסאפ`,
    newDevice: "כניסה ממכשיר חדש",
    signInLocked: "החשבון ננעל אחרי קודים שגויים",
    /** Someone with a Google account that isn't registered tried to sign in. */
    signInRefused: (email: string) => `ניסיון כניסה של חשבון לא רשום · ${email}`,
    staffInvited: (name: string) => `הזמנת משתמש · ${name}`,
    staffRemoved: (name: string) => `הסרת משתמש · ${name}`,
    staffAccessChanged: (name: string, role: string, passports: boolean) => `שינוי הרשאות · ${name}: ${role}${passports ? ", עם דרכונים" : ""}`,
    permissionChange: (role: string, area: string, level: string) => `שינוי בטבלת ההרשאות · ${role} · ${area}: ${level}`,
    securityChange: (setting: string, enabled: boolean) => `${enabled ? "הפעלת" : "כיבוי"} ${setting}`,
    settings: {
      twoStepRequired: "חובת אימות דו-שלבי",
      maskPassportNumbers: "הסתרת מספרי דרכון",
      autoSignOut: "יציאה אוטומטית",
      passportAccessLog: "יומן הגישה לדרכונים",
    } satisfies Record<SecuritySwitch, string>,
    mondayCopy: "העתקה מ-Monday לפי בקשה",
  },
  account: {
    title: "חשבון וניהול",
    label: "החשבון שלי",
    passportsFull: "גישה מלאה לדרכונים",
    passportsNone: "ללא גישה לדרכונים",
    admin: "ניהול",
    import: "העתקה מ-Monday",
    importStatus: { running: "מעתיק עכשיו", completed: "מעודכן", failed: "נכשלה", skipped: "דולגה" } satisfies Record<CopyStatus, string>,
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
