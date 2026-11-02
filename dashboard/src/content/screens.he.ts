export type ScreenKey =
  | "overview"
  | "leads"
  | "lead"
  | "customers"
  | "customer"
  | "groups"
  | "holidays"
  | "birthdays"
  | "users"
  | "account"
  | "import";

export const screens: Record<ScreenKey, { title: string; soft?: string }> = {
  overview: { title: "שלום, רונית", soft: "בואי נראה מה קורה היום" },
  leads: { title: "לידים", soft: "מהשיחה הראשונה ועד ההרשמה" },
  lead: { title: "פרטי ליד" },
  customers: { title: "לקוחות ודרכונים", soft: "כל הלקוחות והדרכונים" },
  customer: { title: "כרטיס לקוח" },
  groups: { title: "קבוצות וטיסות", soft: "טיסות ואירועים פעילים" },
  holidays: { title: "ברכות לחגים", soft: "כתיבה, בדיקה ושליחה" },
  birthdays: { title: "ימי הולדת", soft: "ברכה אוטומטית בוואטסאפ" },
  users: { title: "משתמשים והרשאות", soft: "מי נכנס ומה רואים" },
  account: { title: "חשבון וניהול" },
  import: { title: "ייבוא מ-Monday.com", soft: "העברה חד-פעמית" },
};

export const comingSoon = "המסך הזה ייבנה בשלב הבא.";
