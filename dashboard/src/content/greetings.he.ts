import type { CampaignStage, CampaignStatus, DeliveryFailure, DeliveryStatus, ShabbatRule } from "../data/types";

/** Copy for the holiday greetings and birthdays screens. */
export const greetingsCopy = {
  /** Phones: holidays and birthdays share the ברכות tab, with a switch at the top. */
  tab: {
    title: "ברכות",
    label: "סוג ברכה",
    holidays: "חגים",
    birthdays: "ימי הולדת",
  },

  /** A holiday greeting's status, as a tag. */
  campaignStatus: {
    draft: "טיוטה",
    "awaiting-approval": "ממתינה לאישור",
    scheduled: "מתוזמנת",
    sending: "בשליחה",
    completed: "הושלמה",
  } satisfies Record<CampaignStatus, string>,

  /** One greeting sent on WhatsApp. */
  delivery: {
    "awaiting-approval": "ממתינה לאישור",
    scheduled: "מתוזמנת",
    paused: "מושהית",
    sent: "נשלחה",
    delivered: "נמסרה",
    read: "נקראה",
    failed: "נכשלה",
  } satisfies Record<DeliveryStatus, string>,

  failure: {
    "invalid-number": "מספר לא תקין",
    blocked: "המספר חסום",
  } satisfies Record<DeliveryFailure, string>,

  holidays: {
    title: "ברכות לחגים",
    /** The greeting being prepared, under the title: "חנוכה תשפ״ז". */
    campaignName: (holiday: string, year: string) => `${holiday} ${year}`,
    stagesLabel: "שלבי הברכה",
    stages: { write: "כתיבה", review: "בדיקה", approve: "אישור ושליחה", track: "מעקב" } satisfies Record<CampaignStage, string>,
    /** The phone's stage bar. */
    stagesShort: { write: "כתיבה", review: "בדיקה", approve: "אישור", track: "מעקב" } satisfies Record<CampaignStage, string>,
    newGreeting: "ברכה חדשה",
    audienceAll: "כל הלקוחות",
    noCampaign: "אין כרגע ברכה בהכנה",

    /** The orb card. */
    next: {
      label: "החג הבא",
      countdown: (days: number) => (days <= 0 ? "הערב" : days === 1 ? "מחר" : `בעוד ${days} ימים`),
      when: (countdown: string, time: string) => `${countdown} · ערב החג ${time}`,
      evePhone: (date: string, time: string) => `ערב החג · ${date} · ${time}`,
      recipients: (count: string) => `${count} נמענים`,
      status: {
        draft: "טיוטה",
        "awaiting-approval": "ממתינה לאישורך",
        scheduled: "אושרה לשליחה",
        sending: "נשלחת עכשיו",
        completed: "נשלחה",
      } satisfies Record<CampaignStatus, string>,
      toApprove: "אישור ושליחה",
      toApprovePhone: "לאישור",
      toDetails: "פרטי השליחה",
      toDetailsPhone: "לפרטים",
    },

    editor: {
      title: "נוסח הברכה",
      saved: (relative: string) => `נשמר ${relative}`,
      label: "ההודעה",
      tokens: { firstName: "שם פרטי", groupName: "שם הקבוצה" },
      length: (characters: string, messages: number) => `${characters} תווים · ${messages === 1 ? "הודעה אחת" : `${messages} הודעות`}`,
      save: "שמירת טיוטה",
      savedToast: "הטיוטה נשמרה",
      savedBackToApproval: "הנוסח נשמר. הברכה חזרה לאישור שלך.",
      unchanged: "אין שינויים לשמור",
      empty: "אי אפשר לשמור ברכה ריקה",
      alreadySent: "הברכה כבר יצאה, ואי אפשר לשנות אותה",
      failed: "הטיוטה לא נשמרה. אפשר לנסות שוב.",
    },

    preview: { title: "תצוגה מקדימה" },

    send: {
      title: "שליחה",
      recipients: "נמענים",
      audienceLabel: "למי שולחים",
      when: "מועד",
      whenValue: (time: string) => `ערב החג · ${time}`,
      rate: "קצב",
      rateValue: (messages: string, minutes: string) => `${messages} הודעות כל ${minutes} דקות`,
      duration: "משך משוער",
      durationValue: (minutes: number) => {
        if (minutes < 60) return `כ-${minutes} דקות`;
        const halfHours = Math.round(minutes / 30);
        const hours = Math.floor(halfHours / 2);
        const hoursText = hours === 1 ? "שעה" : hours === 2 ? "שעתיים" : `${hours} שעות`;
        const about = hours <= 2 ? `כ${hoursText}` : `כ-${hoursText}`;
        return halfHours % 2 === 1 ? `${about} וחצי` : about;
      },
      approve: "אישור ושליחה",
      test: "שליחת בדיקה אליי",
      testPhone: "בדיקה אליי",
      approvedNote: (date: string, time: string) => `אושרה. הברכה תצא ב-${date} ב-${time}.`,
      audienceSaved: (label: string) => `הנמענים עודכנו: ${label}`,
      audienceBackToApproval: (label: string) => `הנמענים עודכנו: ${label}. הברכה חזרה לאישור שלך.`,
      audienceFailed: "הנמענים לא עודכנו. אפשר לנסות שוב.",
      confirmTitle: (holiday: string, count: string) => `לשלוח את ברכת ${holiday} ל-${count} לקוחות?`,
      confirmBody: (date: string, time: string, rate: string) => `הברכה תצא בערב החג, ${date} ב-${time}, ${rate}.`,
      confirmSavesDraft: "השינויים שעוד לא נשמרו בנוסח יישמרו לפני האישור.",
      approved: (holiday: string, date: string, time: string) => `ברכת ${holiday} אושרה ותצא ב-${date} ב-${time}`,
      approveFailed: "האישור לא נשמר. אפשר לנסות שוב.",
      testTitle: "לשלוח לך הודעת בדיקה?",
      testBody: "הברכה תגיע לוואטסאפ שלך, בדיוק כמו שהלקוחות יראו אותה.",
      testUnsaved: "יישלח הנוסח השמור. כדי לבדוק את השינויים, כדאי לשמור אותם קודם.",
      testConfirm: "שליחת בדיקה",
      testSent: "הבדיקה נשלחה לוואטסאפ שלך",
      testFailed: "הבדיקה לא נשלחה. אפשר לנסות שוב.",
    },

    last: {
      title: (holiday: string) => `הברכה האחרונה · ${holiday}`,
      titleNone: "הברכה האחרונה",
      summary: (date: string, sent: string) => `${date} · ${sent} נשלחו`,
      parts: { read: "נקראו", delivered: "נמסרו", failed: "נכשלו" },
      failedNote: (count: number, shown: string) => (count === 1 ? "מספר אחד לא תקין או חסום" : `${shown} מספרים לא תקינים או חסומים`),
      resend: "שליחה חוזרת",
      none: "עוד לא יצאו ברכות לחגים",
    },

    history: {
      title: "היסטוריה",
      note: "כל הברכות נשמרות כאן",
      table: "היסטוריית שליחות",
      columns: { holiday: "חג", date: "תאריך", sent: "נשלחו", delivered: "נמסרו", read: "נקראו", status: "סטטוס" },
      eve: "ערב החג",
      /** In place of a figure that does not exist yet. */
      blank: "·",
      notYet: "עוד לא נשלחה",
      phoneLine: (date: string, sent: string, read: string) => `${date} · ${sent} נשלחו · ${read} נקראו`,
      empty: "עוד אין ברכות בהיסטוריה",
    },
  },

  birthdays: {
    title: "ימי הולדת",
    soft: "ברכה אוטומטית בוואטסאפ",
    lead: "ביום ההולדת, לפי תאריך הלידה מהדרכון. בלי שום פעולה ידנית.",
    age: (age: string) => `גיל ${age}`,
    ageWith: (age: string, detail: string) => `גיל ${age} · ${detail}`,

    today: {
      label: "ימי הולדת היום",
      day: "היום",
      count: (count: number) => (count === 0 ? "אין ימי הולדת היום" : count === 1 ? "יום הולדת אחד" : `${count} ימי הולדת`),
      allSent: (count: number) => (count === 1 ? "הברכה יצאה" : count === 2 ? "שתי הברכות יצאו" : `כל ${count} הברכות יצאו`),
      allSentPhone: (count: number) => (count === 1 ? "ברכה אחת יצאה" : `${count} ברכות יצאו`),
      someSent: (sent: number, count: number) => `${sent} מתוך ${count} ברכות יצאו`,
      pending: (count: number) => (count === 1 ? "הברכה תצא היום" : "הברכות ייצאו היום"),
      paused: "השליחה האוטומטית כבויה",
      via: (time: string) => `ב-${time} בוואטסאפ`,
      more: (count: number) => `ועוד ${count}`,
      toTemplate: "התבנית",
      toTemplatePhone: "תבנית",
      /** The phone's list of today's birthdays. */
      listTitle: (date: string) => `היום · ${date}`,
      sentTag: (count: number) => `${count} נשלחו`,
      empty: "אין ימי הולדת היום",
    },

    automation: {
      title: "שליחה אוטומטית",
      on: "פעילה",
      off: "כבויה",
      source: "לפי תאריך הלידה מהדרכון",
      switchLabel: "שליחה אוטומטית של ברכות יום הולדת",
      sendTime: "שעת שליחה",
      channel: "ערוץ",
      channels: { whatsapp: "וואטסאפ" },
      birthDate: "תאריך הלידה",
      birthDateSources: { passport: "מהדרכון" },
      shabbat: "יום הולדת בשבת",
      shabbatRules: { "after-shabbat": "במוצאי שבת", "before-shabbat": "ביום שישי" } satisfies Record<ShabbatRule, string>,
      sentThisYear: "ברכות נשלחו השנה",
      turnedOn: "השליחה האוטומטית פועלת",
      turnedOff: "השליחה האוטומטית כבויה. ברכות יום הולדת לא ייצאו עד שתפעילי אותה.",
      shabbatSaved: {
        "after-shabbat": "ימי הולדת בשבת: הברכה תצא במוצאי שבת",
        "before-shabbat": "ימי הולדת בשבת: הברכה תצא ביום שישי",
      } satisfies Record<ShabbatRule, string>,
      failed: "ההגדרה לא נשמרה. אפשר לנסות שוב.",
    },

    week: {
      title: "השבוע הקרוב",
      count: (count: number) => (count === 0 ? "אין ימי הולדת" : count === 1 ? "יום הולדת אחד" : `${count} ימי הולדת`),
      tomorrow: "מחר",
      shabbatNote: { "after-shabbat": "תצא במוצאי שבת", "before-shabbat": "תצא ביום שישי" } satisfies Record<ShabbatRule, string>,
      shabbatTag: { "after-shabbat": "מוצ״ש", "before-shabbat": "שישי" } satisfies Record<ShabbatRule, string>,
      empty: "אין ימי הולדת בשבוע הקרוב",
    },

    template: {
      title: "תבנית הברכה",
      updated: (date: string) => `עודכנה ב-${date}`,
      label: "ההודעה",
      tokens: { firstName: "שם פרטי", age: "גיל" },
      save: "שמירת התבנית",
      saved: "התבנית נשמרה",
      unchanged: "אין שינויים לשמור",
      empty: "אי אפשר לשמור תבנית ריקה",
      failed: "התבנית לא נשמרה. אפשר לנסות שוב.",
    },

    preview: { title: "תצוגה מקדימה" },

    recent: {
      title: "נשלחו לאחרונה",
      all: "כל ההיסטוריה",
      when: (date: string, time: string) => `${date} · ${time}`,
      empty: "עוד לא יצאו ברכות יום הולדת",
    },
  },
} as const;
