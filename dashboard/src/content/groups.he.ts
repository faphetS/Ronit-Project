const seatsLeft = (seats: number) => (seats <= 0 ? "האירוע מלא" : seats === 1 ? "מקום אחד פנוי" : `${seats} מקומות פנויים`);

/** Copy for the groups and flights screen. Group names, places and notes come from the data and stay as stored. */
export const groupsCopy = {
  title: "קבוצות וטיסות",
  /** The headline's second line: how many groups, and how many people registered to them. */
  soft: (groups: number, registered: number) => `${groups} פעילות · ${registered} נרשמו`,
  softPhone: (registered: number) => `${registered} נרשמו`,
  pending: "…",
  /** Joins the parts of a short line, like "טיסה · נשים בלבד". */
  sep: " · ",
  newGroup: "קבוצה חדשה",
  /** Names the row of group cards. */
  cards: "הקבוצות",
  /** Names the phone carousel under the selected group. */
  otherGroups: "קבוצות נוספות",
  kind: { flight: "טיסה", event: "אירוע" },
  womenOnly: "נשים בלבד",
  selected: "נבחרה",
  departs: (date: string) => `יציאה ${date}`,
  onDate: (date: string) => `תאריך ${date}`,
  dateRange: (from: string, to: string) => `${from} עד ${to}`,
  /** Under the meter on the selected phone card. */
  registered: "נרשמו",
  registeredOf: (registered: number, capacity: number) => `${registered} מתוך ${capacity} נרשמו`,
  percent: (value: number) => `${value}%`,
  seatsLeft,
  empty: "אין עדיין קבוצות.",
  notFound: "הקבוצה הזו לא נמצאה.",
  allGroups: "לכל הקבוצות",
  participants: {
    title: (group: string) => `משתתפים · ${group}`,
    /** The phone list of an event's participants. */
    phoneTitle: "משתתפים",
    table: (group: string) => `משתתפי ${group}`,
    summary: (registered: number, received: number, missing: number) =>
      `${registered} נרשמו · ${received} ${received === 1 ? "דרכון התקבל" : "דרכונים התקבלו"} · ${missing} ${missing === 1 ? "חסר" : "חסרים"}`,
    summaryEvent: (registered: number, seats: number) => `${registered} נרשמו · ${seatsLeft(seats)}`,
    missingTag: (missing: number) => (missing === 1 ? "דרכון אחד חסר" : `${missing} דרכונים חסרים`),
    allReceived: "כל הדרכונים התקבלו",
    columns: { name: "שם", phone: "טלפון", passport: "דרכון", expiry: "תוקף", notes: "הערות" },
    passport: { received: "התקבל", missing: "חסר" },
    /** An empty cell shows a dot; screen readers hear noValue instead. */
    blank: "·",
    noValue: "אין",
    empty: "אין עדיין משתתפים בקבוצה הזו.",
    count: (count: number) => `${count} משתתפים`,
    showAll: (count: number) => `הצגת כל ה-${count}`,
    showFewer: "הצגת פחות",
  },
  readiness: {
    label: (group: string) => `מוכנות לטיסה, ${group}`,
    word: "מוכנות",
    of: (received: number, registered: number) => `${received} מתוך ${registered}`,
    passportsIn: "דרכונים התקבלו",
    /** The action that shows who is missing a passport. */
    missing: (missing: number) => `${missing} ${missing === 1 ? "חסר" : "חסרים"}`,
    missingShort: "חסרים",
    allIn: "כל הדרכונים התקבלו",
    note: "הדרכונים החסרים יגיעו בוואטסאפ ויתווספו לכרטיסים אוטומטית.",
  },
  missing: {
    title: "חסרים דרכונים",
    count: (missing: number) => (missing === 1 ? "דרכון אחד חסר" : `${missing} דרכונים חסרים`),
    note: "הדרכונים יגיעו בוואטסאפ ויתווספו לכרטיסים אוטומטית.",
    none: "כל הדרכונים התקבלו.",
  },
  flight: {
    title: "פרטי הטיסה",
    outbound: "הלוך",
    inbound: "חזור",
    airline: "חברת תעופה",
    hotel: "מלון",
    guide: "הדרכה",
    /** Points from where the flight leaves to where it lands, in the reading direction. */
    arrow: "←",
    placeholder: { leg: "[תאריך ושעה]", airline: "[חברת התעופה]", hotel: "[שם המלון]", guide: "[צוות ההדרכה]" },
  },
  event: {
    label: (group: string) => `מועד האירוע, ${group}`,
    countdown: (days: number) => (days < 0 ? "האירוע כבר התקיים" : days === 0 ? "היום" : days === 1 ? "מחר" : `בעוד ${days} ימים`),
    toParticipants: "משתתפים",
    note: "לאירוע לא צריך דרכון, ולכן אין כאן מוכנות לטיסה.",
    details: "פרטי האירוע",
    date: "תאריך",
    capacity: "מקומות",
    registered: "נרשמו",
    free: "מקומות פנויים",
    audience: "קהל",
  },
} as const;
