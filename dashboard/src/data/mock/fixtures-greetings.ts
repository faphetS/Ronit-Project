import { estimateSendMinutes } from "../rules";
import type { Audience, BirthdaySettings, CustomerMessage, HolidayCampaign, SendRate } from "../types";

// Greetings as on the Holidays, Birthdays and CustomerProfile boards. Times are UTC: Israel is UTC+3 until 25.10.2026
// and UTC+2 after it, so 17:00 on 11.09 is 14:00Z and 17:00 on 04.12 is 15:00Z.

export const HANUKKAH_CAMPAIGN_ID = "hc-hanukkah-5787";

/** 50 messages every 10 minutes. */
const RATE: SendRate = { messages: 50, everyMinutes: 10 };

const SIGNATURE = "רונית ברש · אור הצדיק";

export const AUDIENCES: Audience[] = [
  { id: "all", kind: "all", name: null, shortName: null, groupIds: [] },
  { id: "poland", kind: "groups", name: "פולין · נובמבר", shortName: "פולין", groupIds: ["g-poland-nov"] },
  { id: "uman", kind: "groups", name: "אומן", shortName: "אומן", groupIds: ["g-uman-tubav", "g-uman-rh"] },
  { id: "challah", kind: "groups", name: "הפרשת חלה", shortName: "הפרשת חלה", groupIds: ["g-challah-jlm"] },
];

type PastCampaign = Pick<HolidayCampaign, "id" | "holiday" | "hebrewYear" | "eve" | "sendAt" | "message" | "savedAt" | "approvedAt"> & {
  stats: NonNullable<HolidayCampaign["stats"]>;
};

/** A greeting that went out to every customer. */
function sent({ stats, ...fields }: PastCampaign): HolidayCampaign {
  return {
    ...fields,
    stage: "track",
    status: "completed",
    audienceId: "all",
    recipients: stats.sent,
    rate: RATE,
    estimatedMinutes: estimateSendMinutes(stats.sent, RATE),
    preview: null,
    savedByUserId: "u-ronit",
    approvedByUserId: "u-ronit",
    lastTest: null,
    stats,
  };
}

/** Newest first, as the history table lists them. */
export const CAMPAIGNS: HolidayCampaign[] = [
  {
    id: HANUKKAH_CAMPAIGN_ID,
    holiday: "hanukkah",
    hebrewYear: 5787,
    stage: "approve",
    status: "awaiting-approval",
    eve: "2026-12-04",
    sendAt: "2026-12-04T15:00:00.000Z",
    message: `ערב טוב {שם פרטי},\nלכבוד חנוכה אני שולחת לך ולמשפחתך ברכה חמה, שהאור של הנרות ימשיך ללוות אתכם כל השנה.\nחג אורים שמח,\n${SIGNATURE}`,
    audienceId: "all",
    recipients: 412,
    rate: RATE,
    estimatedMinutes: 90,
    preview: { customerId: "c-michal-levi", firstName: "מיכל", lastName: "לוי", groupName: "אומן · ט״ו באב" },
    // "נשמר לפני 2 דקות" at the demo moment, 15:30.
    savedAt: "2026-10-28T13:28:00.000Z",
    savedByUserId: "u-ronit",
    approvedAt: null,
    approvedByUserId: null,
    lastTest: null,
    stats: null,
  },
  sent({
    id: "hc-sukkot-5787",
    holiday: "sukkot",
    hebrewYear: 5787,
    eve: "2026-09-25",
    sendAt: "2026-09-25T14:00:00.000Z",
    message: `ערב טוב {שם פרטי},\nחג סוכות שמח לך ולכל המשפחה, שנזכה לשבת יחד בצל הסוכה בבריאות ובשמחה.\nמועדים לשמחה,\n${SIGNATURE}`,
    savedAt: "2026-09-22T08:10:00.000Z",
    approvedAt: "2026-09-23T07:40:00.000Z",
    stats: { sent: 412, delivered: 405, read: 331, failed: 7 },
  }),
  sent({
    id: "hc-yom-kippur-5787",
    holiday: "yomKippur",
    hebrewYear: 5787,
    eve: "2026-09-20",
    sendAt: "2026-09-20T10:00:00.000Z",
    message: `ערב טוב {שם פרטי},\nלקראת יום הכיפורים אני מאחלת לך ולכל המשפחה גמר חתימה טובה וצום קל.\n${SIGNATURE}`,
    savedAt: "2026-09-16T09:05:00.000Z",
    approvedAt: "2026-09-17T06:30:00.000Z",
    stats: { sent: 409, delivered: 401, read: 318, failed: 8 },
  }),
  sent({
    id: "hc-rosh-hashana-5787",
    holiday: "roshHashana",
    hebrewYear: 5787,
    eve: "2026-09-11",
    sendAt: "2026-09-11T14:00:00.000Z",
    message: `ערב טוב {שם פרטי},\nלקראת ראש השנה אני מאחלת לך ולמשפחתך שנה טובה ומתוקה, שנה של אור, בריאות ושמחה.\nשנה טובה,\n${SIGNATURE}`,
    savedAt: "2026-09-06T10:20:00.000Z",
    approvedAt: "2026-09-08T07:00:00.000Z",
    stats: { sent: 409, delivered: 403, read: 352, failed: 6 },
  }),
  sent({
    id: "hc-pesach-5786",
    holiday: "pesach",
    hebrewYear: 5786,
    eve: "2026-04-01",
    sendAt: "2026-04-01T15:00:00.000Z",
    message: `ערב טוב {שם פרטי},\nחג פסח כשר ושמח לך ולכל המשפחה, שנזכה לחירות אמיתית ולשמחה גדולה.\nחג שמח,\n${SIGNATURE}`,
    savedAt: "2026-03-26T08:45:00.000Z",
    approvedAt: "2026-03-29T06:15:00.000Z",
    stats: { sent: 388, delivered: 380, read: 297, failed: 8 },
  }),
];

export const BIRTHDAY_SETTINGS: BirthdaySettings = {
  enabled: true,
  sendTime: "09:00",
  channel: "whatsapp",
  birthDateSource: "passport",
  shabbatRule: "after-shabbat",
  template: `מזל טוב {שם פרטי}!\nמאחלת לך שנה של אור, בריאות ושמחה,\nשכל הבקשות שבלב יתמלאו.\nבאהבה,\n${SIGNATURE}`,
  templateUpdatedAt: "2026-10-12T07:30:00.000Z",
};

function holidayMessage(id: string, customerId: string, campaign: HolidayCampaign, status: CustomerMessage["status"]): CustomerMessage {
  return {
    id, customerId, kind: "holiday", holiday: campaign.holiday, hebrewYear: campaign.hebrewYear, campaignId: campaign.id,
    at: campaign.sendAt, status, failure: null,
  };
}

function birthdayMessage(id: string, customerId: string, at: string, status: CustomerMessage["status"], failure: CustomerMessage["failure"] = null): CustomerMessage {
  return { id, customerId, kind: "birthday", holiday: null, hebrewYear: null, campaignId: null, at, status, failure };
}

const campaign = (id: string): HolidayCampaign => {
  const found = CAMPAIGNS.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown campaign ${id}`);
  return found;
};

/**
 * Messages written by hand from the boards. Customers here get no generated messages of the same kind, so שרה כהן's
 * profile shows exactly the design's list, and the recent birthday sends are exactly the design's five (plus רחל אברהם's).
 * Equal times keep this order.
 */
export const MESSAGES: CustomerMessage[] = [
  holidayMessage("m-sara-rosh-hashana", "c-sara-cohen", campaign("hc-rosh-hashana-5787"), "read"),
  birthdayMessage("m-sara-birthday", "c-sara-cohen", "2026-03-14T07:00:00.000Z", "read"),
  holidayMessage("m-sara-pesach", "c-sara-cohen", campaign("hc-pesach-5786"), "delivered"),
  birthdayMessage("m-bd-rina", "c-rina-malka", "2026-10-28T07:00:00.000Z", "read"),
  birthdayMessage("m-bd-gila", "c-gila-friedman", "2026-10-28T07:00:00.000Z", "delivered"),
  birthdayMessage("m-bd-yehudit", "c-yehudit-landau", "2026-10-26T07:00:00.000Z", "read"),
  // 24.10 was Shabbat, so the greeting went out after it ended, at 21:00.
  birthdayMessage("m-bd-avigail", "c-avigail-saada", "2026-10-24T18:00:00.000Z", "failed", "invalid-number"),
  birthdayMessage("m-bd-ruti", "c-ruti-ben-haim", "2026-10-22T06:00:00.000Z", "read"),
  birthdayMessage("m-bd-rachel", "c-rachel-avraham", "2026-10-22T06:00:00.000Z", "read"),
];
