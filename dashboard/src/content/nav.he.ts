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
  import: "ייבוא מ-Monday",
  history: "היסטוריית הודעות",
  users: "משתמשים והרשאות",
  settings: "הגדרות",
  search: "חיפוש מהיר",
  notifications: (count: number) => `התראות, ${count} חדשות`,
  withNew: (label: string, count: number) => `${label}, ${count} חדשים`,
  signOut: (name: string) => `${name}, יציאה מהמערכת`,
  account: (name: string) => `${name}, חשבון וניהול`,
  back: "חזרה",
} as const;
