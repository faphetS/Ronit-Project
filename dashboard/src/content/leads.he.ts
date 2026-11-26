import type { LeadStatusFilter } from "../data/services";
import type { LeadService, LeadSource, LeadStatus } from "../data/types";

export const leadsCopy = {
  /** Status names, on tags, chips and in the detail. */
  status: {
    new: "חדש",
    "no-answer": "אין מענה",
    talking: "בשיחה",
    "details-sent": "נשלחו פרטים",
    registered: "הרשמה הושלמה",
    "not-relevant": "לא רלוונטי",
  } satisfies Record<LeadStatus, string>,

  title: "לידים",
  summary: (open: string, newThisWeek: string) => `${open} פתוחים · ${newThisWeek} חדשים השבוע`,
  summaryPhone: (open: string) => `${open} פתוחים`,
  /** Stands in for a number that is still loading. */
  pending: "…",
  /** Between parts of a line, like the phone and the source. */
  separator: " · ",
  /** The last note and when, under a lead on phones. */
  noteLine: (note: string, when: string) => `${note} · ${when}`,

  /** The panel above the board: how many leads came in on a day. */
  days: {
    label: "לידים לפי יום",
    today: "היום",
    yesterday: "אתמול",
    /** "היום · רביעי, 04.11" */
    title: (relative: string | null, weekday: string, date: string) => `${relative ? `${relative} · ` : ""}${weekday}, ${date}`,
    allDays: "כל הימים",
    backToToday: "חזרה להיום",
    earlier: "ימים קודמים",
    later: "ימים מאוחרים יותר",
    calendar: "לוח חודשי",
    previousMonth: "החודש הקודם",
    nextMonth: "החודש הבא",
    range: (from: string, to: string) => `${from} – ${to}`,
    pickDay: "בחרי יום בלוח",
    monthTotal: (count: string) => `${count} לידים בחודש`,
    unit: (count: number) => (count === 0 ? "לא נכנסו לידים" : count === 1 ? "ליד חדש" : "לידים חדשים"),
    openUnit: "לידים פתוחים",
    none: "ביום הזה לא נכנסו פניות",
    filtered: (count: string) => `${count} מהם בסינון הנוכחי`,
    split: {
      new: (count: string) => `${count} חדשים`,
      working: (count: string) => `${count} בטיפול`,
      "no-answer": (count: string) => `${count} בלי מענה`,
      registered: (count: string) => `${count} נרשמו`,
    },
    dayLabel: (date: string, count: number) => `${date}: ${count === 1 ? "ליד אחד" : `${count} לידים`}`,
  },

  filters: {
    label: "סינון לידים",
    status: "סינון לפי סטטוס",
    statusOptions: {
      all: "הכל",
      new: "חדשים",
      "no-answer": "אין מענה",
      talking: "בשיחה",
      "details-sent": "נשלחו פרטים",
      registered: "הרשמה הושלמה",
      "not-relevant": "לא רלוונטי",
    } satisfies Record<LeadStatusFilter, string>,
    source: "מקור",
    allSources: "כל המקורות",
    service: "שירות",
    allServices: "כל השירותים",
    /** A toggle: only the leads whose notes tag the signed-in person, on every day. */
    taggedMe: "תויגתי",
    clear: "ניקוי הסינון",
  },

  sources: {
    "landing-page": "אתר",
    instagram: "אינסטגרם",
    facebook: "פייסבוק",
    whatsapp: "וואטסאפ",
    referral: "המלצה",
  } satisfies Record<LeadSource, string>,

  /** What the lead asked about, from Monday's "שירות". */
  services: {
    uman: "טיסות לאומן",
    challah: "הפרשות חלה",
  } satisfies Record<LeadService, string>,
  noService: "שירות לא צוין",

  search: "חיפוש לפי שם או טלפון",

  leadCount: (count: number) => (count === 1 ? "ליד אחד" : `${count} לידים`),
  /** A lead from the old CRM board, found by a search or by its day. */
  archived: "ארכיון",

  board: {
    label: "לוח לידים לפי סטטוס",
    title: {
      today: "הלידים של היום, לפי סטטוס",
      day: (date: string) => `הלידים מ-${date}, לפי סטטוס`,
      all: "כל הלידים הפתוחים, לפי סטטוס",
      tagged: "הלידים שתויגת בהם, לפי סטטוס",
    },
    columns: { new: "חדש", working: "בטיפול", "no-answer": "אין מענה", registered: "נרשמו", "not-relevant": "לא רלוונטי" },
    empty: "אין לידים כאן",
    /** Read out on a card whose notes tag people; the card shows their faces and the first name. */
    tagged: (names: string) => `מתויגים: ${names}`,
    more: (count: number) => `הצגת עוד ${count}`,
    showCards: "הצגת הכרטיסים",
    hideCards: "הסתרת הכרטיסים",
    attempts: (count: number) => (count === 1 ? "ניסיון אחד" : `${count} ניסיונות`),
    whatsapp: (name: string) => `וואטסאפ ל${name}`,
    call: (name: string) => `שיחה ל${name}`,
    /** Read out to screen readers while a card is dragged. */
    drag: {
      pickedUp: (name: string) => `הכרטיס של ${name} נגרר`,
      over: (column: string) => `מעל העמודה ${column}`,
      dropped: (name: string, column: string) => `הכרטיס של ${name} הועבר לעמודה ${column}`,
      cancelled: (name: string) => `הגרירה בוטלה. הכרטיס של ${name} נשאר במקומו`,
    },
  },

  /** Picking several cards on the board, to move them all to one column or tag someone on all of them. */
  select: {
    start: "בחירה",
    /** Read out on a card's check while picking. */
    pick: (name: string) => `בחירת ${name}`,
    /** The check at the start of a column's heading: the cards shown in it. */
    pickColumn: (column: string) => `בחירת כל הכרטיסים בעמודה ${column}`,
    /** The bar at the bottom while picking. */
    bar: "פעולות על הלידים שנבחרו",
    count: (count: number) => (count === 0 ? "בחרו לידים בלוח" : count === 1 ? "ליד אחד נבחר" : `${count} לידים נבחרו`),
    move: "העברה לעמודה",
    tag: "תיוג איש צוות",
    done: "סיום",
    moved: (count: number, column: string) => (count === 1 ? `ליד אחד הועבר לעמודה ${column}` : `${count} לידים הועברו לעמודה ${column}`),
    movedSome: (done: number, total: number) => `${done} מתוך ${total} לידים הועברו. את השאר כדאי לנסות שוב`,
    alreadyThere: (column: string) => `הלידים שנבחרו כבר בעמודה ${column}`,
    /** The sheet that writes one note, with its tags, on every lead picked. */
    tagTitle: (count: number) => (count === 1 ? "תיוג על ליד אחד" : `תיוג על ${count} לידים`),
    tagBody: "ההערה תישמר בכל אחד מהלידים שנבחרו, ומי שתויג יקבל התראה.",
    tagLabel: "ההערה",
    tagPlaceholder: "@ לתיוג איש צוות, ומה צריך לעשות",
    tagSave: (count: number) => (count === 1 ? "שמירה בליד" : `שמירה ב-${count} לידים`),
    tagCancel: "ביטול",
    tagged: (count: number) => (count === 1 ? "ההערה נשמרה בליד" : `ההערה נשמרה ב-${count} לידים`),
    taggedSome: (done: number, total: number) => `ההערה נשמרה ב-${done} מתוך ${total} לידים. את השאר כדאי לנסות שוב`,
  },

  /**
   * The next trip: on desktop a card above the leads that counts the days to it, with a bar for each of the 30 days
   * before it; on phones a pill. A flight that left and isn't back yet shows instead, by its day. Opens the group.
   */
  nextTrip: {
    label: { flight: "הטיסה הקרובה", event: "האירוע הקרוב" },
    underWay: "בנסיעה עכשיו",
    when: (days: number) => (days === 0 ? "היום" : days === 1 ? "מחר" : `בעוד ${days} ימים`),
    /** Beside the big number of days. */
    unit: {
      flight: (days: number) => (days === 1 ? "יום להמראה" : "ימים להמראה"),
      event: (days: number) => (days === 1 ? "יום לאירוע" : "ימים לאירוע"),
    },
    today: { flight: "הטיסה יוצאת היום", event: "האירוע היום" },
    todayNumber: "היום",
    /** A flight under way: "יום 2 מתוך 5". */
    tripDay: "ימי הנסיעה",
    back: (date: string) => `חוזרים ב־${date}`,
    dates: (from: string, to: string) => `${from} – ${to}`,
    seats: (registered: string, capacity: string) => `${registered} מתוך ${capacity} מקומות`,
    registered: (registered: string) => `${registered} נרשמו`,
    passports: (percent: string) => `דרכונים ${percent}%`,
    then: "אחר כך",
    runUp: (days: number) => (days > 30 ? "יותר מחודש עד היציאה" : days <= 0 ? "יוצאים" : `עוד ${days} ימים עד היציאה`),
    runUpFar: "יותר מחודש",
    todayMark: "היום",
    /** The flight tracker's two ends: home, and the trip's place with the day it takes off. */
    from: "ישראל",
    takeOff: "המראה",
    none: "אין עדיין טיסה או אירוע עם תאריך",
    noneHint: "תאריך שמוסיפים לקבוצה מופיע כאן, עם ספירה לאחור.",
    toGroups: "לקבוצות",
    failed: "הנסיעה הקרובה לא נטענה",
  },

  /** When a status change didn't go through: a drop on the board, or the status menu. */
  statusChange: {
    gone: "הסטטוס לא השתנה: הליד הזה כבר לא בלוח",
    "no-access": "הסטטוס לא השתנה: אין לך הרשאה לשנות סטטוסים",
    failed: "הסטטוס לא השתנה. כדאי לנסות שוב",
  },

  empty: {
    filtered: "אין לידים בסינון הזה",
    none: "אין כרגע לידים פתוחים",
  },

  detail: {
    title: "פרטי ליד",
    label: (name: string) => `פרטי ליד: ${name}`,
    whatsapp: "וואטסאפ",
    call: "שיחה",
    /** A link that opens in a new tab. */
    newTab: (label: string) => `${label} (נפתח בלשונית חדשה)`,
    phone: "טלפון",
    source: "מקור",
    service: "שירות",
    inquiry: "פנייה",
    calls: "שיחות",
    callsLine: (count: number, last: string | null) => (count === 0 ? "עוד לא" : last ? `${count} · אחרונה ${last}` : String(count)),
    /** The status menu in the lead's header. */
    statusLabel: "שינוי סטטוס",
    nextStep: "שלב הבא",
    lastMessage: "הודעה אחרונה באינסטגרם",
    history: "הערות ושיחות",
    noHistory: "אין עדיין הערות",
    /** When and who, under a note. */
    historyMeta: (date: string, by: string) => `${date} · ${by}`,
    /** The note box on the lead's card. */
    noteLabel: "הערה חדשה",
    notePlaceholder: "כתבו הערה על הליד · @ לתיוג",
    /** Beside "שמירה": starts a tag of someone from the team, like typing "@". */
    noteTag: "תיוג",
    /** The list of people that opens under the box after "@". */
    noteTagList: "אנשי צוות לתיוג",
    /** The switch in the note box: what kind of note this is. A question or an answer shows its label on the note. */
    noteKind: "סוג ההערה",
    noteKinds: { note: "הערה", question: "שאלה", answer: "תשובה" },
    noteSave: "שמירה",
    noteSaved: "ההערה נשמרה",
    noteFailed: "ההערה לא נשמרה. נסו שוב.",
    noteEdit: "עריכה",
    noteEditLabel: "עריכת ההערה",
    noteCancel: "ביטול",
    noteDelete: "מחיקה",
    noteDeleteTitle: "למחוק את ההערה?",
    noteDeleteDescription: "ההערה תימחק מהכרטיס של הליד.",
    noteDeleteConfirm: "מחיקת ההערה",
    noteDeleted: "ההערה נמחקה",
    noteEdited: "נערכה",
    groups: "קבוצות",
    noGroups: "עוד לא בקבוצה",
    notFound: "הליד הזה לא נמצא",
    backToList: "חזרה ללידים",
  },
} as const;
