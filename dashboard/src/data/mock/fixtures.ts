import type { Activity, Customer, Group, Lead, LeadEvent, Passport, PassportIntake, StaffUser } from "../types";

// Every record here appears on the approved canvas. Times are UTC; Israel is UTC+2 on 2026-10-28.

export const USERS: StaffUser[] = [
  { id: "u-ronit", name: "רונית ברש", initial: "ר", role: "admin", passportAccess: true },
  { id: "u-shira", name: "שירה", initial: "ש", role: "office", passportAccess: true },
  { id: "u-moran", name: "מורן", initial: "מ", role: "sales", passportAccess: false },
];

export const GROUPS: Group[] = [
  { id: "g-poland-nov", name: "פולין · נובמבר", type: "flight", womenOnly: false, capacity: 40, startsOn: "2026-11-18", endsOn: "2026-11-22", dateLabel: null },
  { id: "g-challah-jlm", name: "ערב הפרשת חלה · ירושלים", type: "event", womenOnly: false, capacity: 60, startsOn: "2026-12-03", endsOn: null, dateLabel: null },
  { id: "g-uman-tubav", name: "אומן · ט״ו באב תשפ״ז", type: "flight", womenOnly: true, capacity: 45, startsOn: "2027-08-16", endsOn: null, dateLabel: "אוגוסט 2027" },
  { id: "g-uman-rh", name: "אומן · ראש השנה תשפ״ח", type: "flight", womenOnly: false, capacity: 50, startsOn: "2027-09-30", endsOn: null, dateLabel: "ספטמבר 2027" },
];

/** Registered participants per group, as on the design (98 in total). */
export const GROUP_REGISTRATIONS: Record<string, number> = {
  "g-poland-nov": 32,
  "g-challah-jlm": 46,
  "g-uman-tubav": 12,
  "g-uman-rh": 8,
};

const IMPORTED = "יובא מ-Monday.com";

function event(id: string, at: string, text: string, byUserId: string | null): LeadEvent {
  return { id, at, text, byUserId };
}

function lead(fields: Omit<Lead, "archived" | "history">, history?: LeadEvent[]): Lead {
  return {
    ...fields,
    archived: false,
    history: history ?? [event(`${fields.id}-e1`, fields.updatedAt, fields.lastNote, fields.assigneeId)],
  };
}

export const LEADS: Lead[] = [
  lead(
    { id: "l-yael-peretz", name: "יעל פרץ", phone: "0542212219", source: "instagram", status: "talking", groupId: "g-poland-nov", assigneeId: "u-moran", createdAt: "2026-10-12T08:00:00.000Z", updatedAt: "2026-10-28T12:30:00.000Z", lastNote: "בקשה לפרטים על המלון" },
    [
      event("e-yael-4", "2026-10-28T12:30:00.000Z", "בקשה לפרטים על המלון", "u-moran"),
      event("e-yael-3", "2026-10-14T09:00:00.000Z", "מסלול הטיול נשלח בוואטסאפ", "u-moran"),
      event("e-yael-2", "2026-10-12T08:30:00.000Z", "שיחה ראשונה", "u-ronit"),
      event("e-yael-1", "2026-10-12T08:00:00.000Z", "יובא מ-Monday.com עם 3 עדכונים", null),
    ],
  ),
  lead({ id: "l-noa-biton", name: "נועה ביטון", phone: "0527734410", source: "landing-page", status: "new", groupId: "g-poland-nov", assigneeId: null, createdAt: "2026-10-28T10:30:00.000Z", updatedAt: "2026-10-28T10:30:00.000Z", lastNote: "פרטים מהטופס באתר" }),
  lead(
    { id: "l-hana-goldberg", name: "חנה גולדברג", phone: "0503318832", source: "referral", status: "details-sent", groupId: "g-poland-nov", assigneeId: "u-moran", createdAt: "2026-09-20T09:00:00.000Z", updatedAt: "2026-10-27T15:00:00.000Z", lastNote: "מסלול הטיול נשלח בוואטסאפ" },
    [event("e-hana-2", "2026-10-27T15:00:00.000Z", "מסלול הטיול נשלח בוואטסאפ", "u-moran"), event("e-hana-1", "2026-09-20T09:00:00.000Z", IMPORTED, null)],
  ),
  lead(
    { id: "l-dvora-stern", name: "דבורה שטרן", phone: "0536401907", source: "facebook", status: "details-sent", groupId: "g-poland-nov", assigneeId: "u-shira", createdAt: "2026-09-10T09:00:00.000Z", updatedAt: "2026-10-24T08:00:00.000Z", lastNote: "נשלח טופס הרשמה" },
    [event("e-dvora-2", "2026-10-24T08:00:00.000Z", "נשלח טופס הרשמה", "u-shira"), event("e-dvora-1", "2026-09-10T09:00:00.000Z", IMPORTED, null)],
  ),
  lead(
    { id: "l-orit-dahan", name: "אורית דהן", phone: "0587756623", source: "whatsapp", status: "talking", groupId: "g-poland-nov", assigneeId: "u-moran", createdAt: "2026-09-05T10:00:00.000Z", updatedAt: "2026-10-22T07:00:00.000Z", lastNote: "לחזור אחרי החגים" },
    [event("e-orit-2", "2026-10-22T07:00:00.000Z", "לחזור אחרי החגים", "u-moran"), event("e-orit-1", "2026-09-05T10:00:00.000Z", IMPORTED, null)],
  ),
  lead({ id: "l-michal-levi", name: "מיכל לוי", phone: "0524487731", source: "landing-page", status: "new", groupId: "g-uman-tubav", assigneeId: null, createdAt: "2026-10-28T10:05:00.000Z", updatedAt: "2026-10-28T10:05:00.000Z", lastNote: "ליד חדש מהאתר" }),
  lead({ id: "l-tamar-azulay", name: "תמר אזולאי", phone: "0546103390", source: "instagram", status: "new", groupId: "g-uman-tubav", assigneeId: null, createdAt: "2026-10-28T08:41:00.000Z", updatedAt: "2026-10-28T08:41:00.000Z", lastNote: "פנייה בהודעה פרטית" }),
  lead({ id: "l-liat-hadad", name: "ליאת חדד", phone: "0508825512", source: "referral", status: "talking", groupId: "g-uman-tubav", assigneeId: "u-shira", createdAt: "2026-10-26T09:00:00.000Z", updatedAt: "2026-10-27T13:00:00.000Z", lastNote: "התעניינות בחדר זוגי" }),
  lead(
    { id: "l-sigal-amar", name: "סיגל עמר", phone: "0523319047", source: "landing-page", status: "not-relevant", groupId: "g-uman-tubav", assigneeId: "u-moran", createdAt: "2026-09-28T09:00:00.000Z", updatedAt: "2026-10-20T08:00:00.000Z", lastNote: "התאריך לא מתאים" },
    [event("e-sigal-2", "2026-10-20T08:00:00.000Z", "התאריך לא מתאים", "u-moran"), event("e-sigal-1", "2026-09-28T09:00:00.000Z", IMPORTED, null)],
  ),
  lead({ id: "l-rachel-avraham", name: "רחל אברהם", phone: "0539902874", source: "whatsapp", status: "registered", groupId: "g-challah-jlm", assigneeId: "u-shira", createdAt: "2026-10-25T08:00:00.000Z", updatedAt: "2026-10-25T09:00:00.000Z", lastNote: "הרשמה לקבוצה של 4" }),
  lead(
    { id: "l-esther-mizrahi", name: "אסתר מזרחי", phone: "0504471166", source: "landing-page", status: "details-sent", groupId: "g-challah-jlm", assigneeId: "u-shira", createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-23T08:00:00.000Z", lastNote: "נשלחו פרטי האירוע" },
    [event("e-esther-2", "2026-10-23T08:00:00.000Z", "נשלחו פרטי האירוע", "u-shira"), event("e-esther-1", "2026-10-01T09:00:00.000Z", IMPORTED, null)],
  ),
  lead({ id: "l-shiran-katz", name: "שירן כץ", phone: "0545587302", source: "facebook", status: "new", groupId: "g-challah-jlm", assigneeId: null, createdAt: "2026-10-28T07:12:00.000Z", updatedAt: "2026-10-28T07:12:00.000Z", lastNote: "פנייה מהקמפיין" }),
];

const IMPORT_RUN_AT = "2026-10-28T06:40:00.000Z";

function passport(number: string, birthDate: string, issueDate: string, expiryDate: string, receivedVia: Passport["receivedVia"], receivedAt: string): Passport {
  return { number, birthDate, issueDate, expiryDate, nationality: "ישראלית", receivedVia, receivedAt, photoAvailable: true };
}

export const CUSTOMERS: Customer[] = [
  {
    id: "c-sara-cohen", firstName: "שרה", lastName: "כהן", phone: "0526120418", whatsappConnected: true, groupIds: ["g-poland-nov"], source: "referral", assigneeId: "u-moran",
    since: "2023-04-02T09:00:00.000Z", updatedAt: "2026-10-28T12:32:00.000Z",
    passport: passport("38412921", "1979-03-14", "2021-05-02", "2031-05-01", "whatsapp", "2026-10-28T12:32:00.000Z"),
    notes: [
      { id: "n-sara-2", at: "2026-10-20T08:00:00.000Z", text: "בקשה לחדר קרוב למעלית", byUserId: "u-moran" },
      { id: "n-sara-1", at: "2026-10-02T08:00:00.000Z", text: "כשרות מהדרין בכל הארוחות", byUserId: "u-ronit" },
    ],
  },
  {
    id: "c-lea-berger", firstName: "לאה", lastName: "ברגר", phone: "0549981120", whatsappConnected: true, groupIds: [], source: "whatsapp", assigneeId: null,
    since: "2026-10-28T09:20:00.000Z", updatedAt: "2026-10-28T09:20:00.000Z",
    passport: passport("40955318", "1985-06-21", "2022-03-10", "2032-03-09", "whatsapp", "2026-10-28T09:20:00.000Z"), notes: [],
  },
  {
    id: "c-rina-malka", firstName: "רינה", lastName: "מלכה", phone: "0547716045", whatsappConnected: true, groupIds: ["g-uman-rh"], source: "referral", assigneeId: "u-shira",
    since: "2021-09-14T09:00:00.000Z", updatedAt: "2026-10-26T10:00:00.000Z",
    passport: passport("40118233", "1981-10-28", "2022-12-13", "2032-12-12", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-michal-levi", firstName: "מיכל", lastName: "לוי", phone: "0524487731", whatsappConnected: true, groupIds: ["g-uman-tubav"], source: "landing-page", assigneeId: null,
    since: "2026-10-28T10:05:00.000Z", updatedAt: "2026-10-28T10:05:00.000Z", passport: null, notes: [],
  },
  {
    id: "c-rachel-avraham", firstName: "רחל", lastName: "אברהם", phone: "0539902874", whatsappConnected: true, groupIds: ["g-challah-jlm"], source: "whatsapp", assigneeId: "u-shira",
    since: "2022-02-01T09:00:00.000Z", updatedAt: "2026-10-25T09:00:00.000Z",
    passport: passport("41220305", "1975-10-22", "2017-01-16", "2027-01-15", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-dvora-stern", firstName: "דבורה", lastName: "שטרן", phone: "0536401907", whatsappConnected: true, groupIds: ["g-poland-nov"], source: "facebook", assigneeId: "u-shira",
    since: "2024-05-12T09:00:00.000Z", updatedAt: "2026-10-24T08:00:00.000Z",
    passport: passport("36550118", "1968-11-05", "2019-07-01", "2029-06-30", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-esther-mizrahi", firstName: "אסתר", lastName: "מזרחי", phone: "0504471166", whatsappConnected: true, groupIds: ["g-challah-jlm"], source: "landing-page", assigneeId: "u-shira",
    since: "2025-03-03T09:00:00.000Z", updatedAt: "2026-10-23T08:00:00.000Z",
    passport: passport("39871542", "1983-10-29", "2020-02-20", "2030-02-19", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-hana-goldberg", firstName: "חנה", lastName: "גולדברג", phone: "0503318832", whatsappConnected: true, groupIds: ["g-poland-nov"], source: "referral", assigneeId: "u-moran",
    since: "2023-11-20T09:00:00.000Z", updatedAt: "2026-10-27T15:00:00.000Z",
    passport: passport("37064760", "1971-01-17", "2017-03-09", "2027-03-08", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-gila-friedman", firstName: "גילה", lastName: "פרידמן", phone: "0526633318", whatsappConnected: true, groupIds: ["g-uman-tubav"], source: "referral", assigneeId: "u-ronit",
    since: "2020-06-30T09:00:00.000Z", updatedAt: "2026-10-21T08:00:00.000Z",
    passport: passport("33910871", "1962-10-28", "2018-04-05", "2028-04-04", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-naama-rozen", firstName: "נעמה", lastName: "רוזן", phone: "0587762290", whatsappConnected: false, groupIds: ["g-poland-nov"], source: "instagram", assigneeId: "u-moran",
    since: "2025-08-01T09:00:00.000Z", updatedAt: "2026-10-19T08:00:00.000Z",
    passport: passport("42305019", "1990-12-09", "2021-08-22", "2031-08-21", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-ilana-shmueli", firstName: "אילנה", lastName: "שמואלי", phone: "0548834381", whatsappConnected: true, groupIds: ["g-poland-nov"], source: "referral", assigneeId: "u-shira",
    since: "2022-10-10T09:00:00.000Z", updatedAt: "2026-10-15T08:00:00.000Z",
    passport: passport("35518304", "1966-04-12", "2020-10-18", "2030-10-17", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-yael-peretz", firstName: "יעל", lastName: "פרץ", phone: "0542212219", whatsappConnected: true, groupIds: ["g-poland-nov"], source: "instagram", assigneeId: "u-moran",
    since: "2026-10-12T08:00:00.000Z", updatedAt: "2026-10-28T12:30:00.000Z", passport: null, notes: [],
  },
  {
    id: "c-miriam-alon", firstName: "מרים", lastName: "אלון", phone: "0527716170", whatsappConnected: true, groupIds: ["g-poland-nov"], source: "facebook", assigneeId: "u-moran",
    since: "2026-09-02T09:00:00.000Z", updatedAt: "2026-10-18T08:00:00.000Z", passport: null, notes: [],
  },
  {
    id: "c-tova-rabinovich", firstName: "טובה", lastName: "רבינוביץ", phone: "0503349904", whatsappConnected: false, groupIds: ["g-poland-nov"], source: "referral", assigneeId: "u-shira",
    since: "2026-08-20T09:00:00.000Z", updatedAt: "2026-10-17T08:00:00.000Z", passport: null, notes: [],
  },
];

export const INTAKES: PassportIntake[] = [
  { id: "i-sara", name: "שרה כהן", phone: "0526120418", receivedAt: "2026-10-28T12:32:00.000Z", result: "matched", reason: "נמצאה התאמה לפי שם מלא", customerId: "c-sara-cohen" },
  { id: "i-lea", name: "לאה ברגר", phone: "0549981120", receivedAt: "2026-10-28T09:20:00.000Z", result: "new-card", reason: "לא נמצא לקוח בשם הזה", customerId: "c-lea-berger" },
  { id: "i-pnina", name: "פנינה לוי", phone: "0545520077", receivedAt: "2026-10-28T08:05:00.000Z", result: "needs-review", reason: "נמצאו 2 לקוחות באותו שם", customerId: null },
  { id: "i-tzipora", name: "ציפורה אוחיון", phone: "0507712233", receivedAt: "2026-10-27T17:48:00.000Z", result: "needs-review", reason: "הצילום לא ברור, חסר תאריך לידה", customerId: null },
];

export const ACTIVITY: Activity[] = [
  { id: "a-passport", kind: "passport", at: "2026-10-28T12:32:00.000Z", title: "דרכון התקבל בוואטסאפ · שרה כהן", detail: "נמצאה התאמה לפי שם, הדרכון נוסף לכרטיס הקיים" },
  { id: "a-lead", kind: "lead", at: "2026-10-28T10:05:00.000Z", title: "ליד חדש מדף הנחיתה · מיכל לוי", detail: "שויך לקבוצה אומן · ט״ו באב" },
  { id: "a-greeting", kind: "greeting", at: "2026-10-28T07:15:00.000Z", title: "ברכת חנוכה נשמרה כטיוטה", detail: "ממתינה לאישור לפני שליחה ל-412 לקוחות" },
  { id: "a-birthday", kind: "birthday", at: "2026-10-28T07:00:00.000Z", title: "2 ברכות יום הולדת נשלחו", detail: "רינה מלכה וגילה פרידמן" },
  { id: "a-import", kind: "import", at: "2026-10-28T06:40:00.000Z", title: "הייבוא מ-Monday.com הושלם", detail: "1,284 לידים הועברו, 37 כפילויות אוחדו" },
];
