import { describe, expect, it } from "vitest";
import {
  classifyBoard,
  columnReader,
  dayOf,
  leadSource,
  leadStatus,
  monthOf,
  normalizePhone,
  passportMark,
  serviceOf,
  splitName,
  toLeads,
  toTrips,
  type BoardSnapshot,
  type MondayRow,
} from "./monday-copy.mapping.js";

const IDS = { crm: "5101856136", archive: "5094895163" };

function row(id: string, name: string, groupId: string, values: Record<string, string>): MondayRow {
  return { id, name, groupId, createdAt: "2026-10-01T08:00:00Z", updatedAt: "2026-10-20T08:00:00Z", values };
}

describe("classifyBoard", () => {
  it("knows the CRM boards by id and the trip boards by name", () => {
    expect(classifyBoard({ id: IDS.crm, name: "רונית  - CRM" }, IDS)).toBe("crm");
    expect(classifyBoard({ id: IDS.archive, name: "רונית -CRM ישן" }, IDS)).toBe("crm-archive");
    expect(classifyBoard({ id: "1", name: "טיסה טו באב 26" }, IDS)).toBe("flight");
    expect(classifyBoard({ id: "2", name: "טיסה לאומן כסלו 26" }, IDS)).toBe("flight");
    expect(classifyBoard({ id: "3", name: "הפרשות חלה 27" }, IDS)).toBe("challah");
    expect(classifyBoard({ id: "4", name: "Subitems of רונית - CRM" }, IDS)).toBeNull();
  });
});

describe("columnReader", () => {
  it("finds a column by title, by another spelling, and ignores a trailing dash", () => {
    const read = columnReader([
      { id: "phone_1", title: "מספר טלפון" },
      { id: "text_1", title: "עיר מגורים" },
      { id: "long_1", title: "שלב הבא -" },
    ]);
    const r = row("1", "x", "g", { phone_1: " 0501234567 ", text_1: "כרמיאל", long_1: "לחזור ביום ראשון" });
    expect(read(r, "טלפון")).toBe("0501234567");
    expect(read(r, "עיר")).toBe("כרמיאל");
    expect(read(r, "שלב הבא")).toBe("לחזור ביום ראשון");
    expect(read(r, "סטטוס")).toBe("");
  });
});

describe("the small readers", () => {
  it("normalizes phones like the WhatsApp gateway, and drops what isn't a number", () => {
    expect(normalizePhone("050-123-4567")).toBe("972501234567");
    expect(normalizePhone("+972501234567")).toBe("972501234567");
    expect(normalizePhone("972501234567")).toBe("972501234567");
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
  });

  it("reads days, names, services, passports and month titles", () => {
    expect(dayOf("2026-11-02")).toBe("2026-11-02");
    expect(dayOf("2026-11-02 10:30")).toBe("2026-11-02");
    expect(dayOf("")).toBeNull();
    expect(splitName("שרה שפרה גליק")).toEqual({ firstName: "שרה שפרה", lastName: "גליק" });
    expect(splitName("  מעיין   נוריאל ")).toEqual({ firstName: "מעיין", lastName: "נוריאל" });
    expect(splitName("אסתר")).toEqual({ firstName: "אסתר", lastName: "" });
    expect(serviceOf("טיסות לאומן")).toBe("uman");
    expect(serviceOf("אומן ממומן")).toBe("uman");
    expect(serviceOf("הפרשות חלה")).toBe("challah");
    expect(serviceOf("טיסות לפורים")).toBeNull();
    expect(passportMark("יש")).toBe("yes");
    expect(passportMark("בהנפקה")).toBe("in-progress");
    expect(passportMark("")).toBeNull();
    expect(monthOf("נובמבר 2026")).toEqual({ label: "נובמבר 2026", start: "2026-11-01", end: "2026-11-30" });
    expect(monthOf("2026 דצמבר")).toEqual({ label: "דצמבר 2026", start: "2026-12-01", end: "2026-12-31" });
    expect(monthOf("פברואר 2028")?.end).toBe("2028-02-29");
    expect(monthOf("ביטולים")).toBeNull();
  });
});

describe("leadStatus", () => {
  it("lets the group decide for not relevant and closed", () => {
    expect(leadStatus("לא רלוונטי", "נוצר קשר")).toBe("not-relevant");
    expect(leadStatus("נסגרו טו באב2026", "")).toBe("registered");
  });

  it("then reads the contact status", () => {
    expect(leadStatus("פולואפ", "אין מענה")).toBe("no-answer");
    expect(leadStatus("לידים נווה", "נוצר קשר")).toBe("talking");
    expect(leadStatus("לידים נווה", "לחזור אליה שוב")).toBe("talking");
    expect(leadStatus("לידים נווה", "מעוניינת להתקדם")).toBe("talking");
    expect(leadStatus("לידים נווה", "קיבלה פרטים לחזור אליה")).toBe("details-sent");
    expect(leadStatus("לידים נווה", "נסגר")).toBe("registered");
    expect(leadStatus("לידים נווה", "תרומה")).toBe("not-relevant");
  });

  it("then the group, and new when nothing says otherwise", () => {
    expect(leadStatus("אין מענה,חנוכה", "")).toBe("no-answer");
    expect(leadStatus("תרומה", "")).toBe("not-relevant");
    expect(leadStatus("פולאו אפ חנוכה", "")).toBe("talking");
    expect(leadStatus("פולו אפ טו באב 2026", "")).toBe("talking");
    expect(leadStatus("פולואופ אורטל-סליחות", "")).toBe("talking");
    expect(leadStatus("לידים חדשים אורטל", "")).toBe("new");
  });
});

describe("leadSource", () => {
  it("reads paid ads as Facebook, Instagram chats as Instagram, the rest as the website", () => {
    expect(leadSource("ממומן", "היי")).toBe("facebook");
    expect(leadSource("אורגני", "היי, אשמח לפרטים")).toBe("instagram");
    expect(leadSource("אורגני", "")).toBe("landing-page");
    expect(leadSource("", "")).toBe("landing-page");
  });
});

const CRM_COLUMNS = [
  { id: "phone_mm2pf4nm", title: "מספר טלפון" },
  { id: "dropdown_mm2p1nvf", title: "שירות" },
  { id: "long_text_mm3qd4jt", title: "הודעה אחרונה באינסטגרם" },
  { id: "color_mm4hcjz7", title: "נוצר קשר" },
  { id: "long_text_mm2pqwp9", title: "שלב הבא -" },
  { id: "color_mm4tm9wn", title: "מקור ליד" },
  { id: "date_mm2psbnf", title: "תאריך פנייה" },
  { id: "date_mm2psp19", title: "שיחה אחרונה" },
  { id: "numeric_mm2paaz", title: "כמות שיחות שבוצעו" },
  { id: "email_mm3p4w7", title: "מייל" },
];

describe("toLeads", () => {
  const snapshot = (kind: "crm" | "crm-archive"): BoardSnapshot => ({
    board: { id: kind === "crm" ? IDS.crm : IDS.archive, name: "רונית - CRM", updatedAt: null, items: 3, kind },
    columns: CRM_COLUMNS,
    groups: [
      { id: "g_new", title: "לידים חדשים אורטל" },
      { id: "g_nophone", title: "ללא מספרי טלפון" },
    ],
    rows: [
      row("101", "יעל פרץ", "g_new", {
        phone_mm2pf4nm: "0542212219",
        dropdown_mm2p1nvf: "טיסות לאומן",
        long_text_mm3qd4jt: "היי אשמח לפרטים",
        color_mm4hcjz7: "נוצר קשר",
        long_text_mm2pqwp9: "לשלוח מסלול",
        color_mm4tm9wn: "אורגני",
        date_mm2psbnf: "2026-10-12",
        date_mm2psp19: "2026-10-20",
        numeric_mm2paaz: "3",
        email_mm3p4w7: "Yael@Example.com - Yael@Example.com",
      }),
      row("102", "noa.biton", "g_nophone", { long_text_mm3qd4jt: "כמה עולה?" }),
      row("103", "", "g_new", { phone_mm2pf4nm: "+972527734410", color_mm4tm9wn: "ממומן" }),
    ],
  });

  it("makes a lead of every row with a phone, and counts the chats without one", () => {
    const { leads, withoutPhone } = toLeads(snapshot("crm"));
    expect(withoutPhone).toBe(1);
    expect(leads).toEqual([
      {
        mondayItemId: "101",
        mondayBoardId: IDS.crm,
        mondayGroup: "לידים חדשים אורטל",
        name: "יעל פרץ",
        phone: "972542212219",
        email: "yael@example.com",
        service: "uman",
        status: "talking",
        contactStatus: "נוצר קשר",
        source: "instagram",
        calls: 3,
        lastCallOn: "2026-10-20",
        inquiryOn: "2026-10-12",
        lastMessage: "היי אשמח לפרטים",
        nextStep: "לשלוח מסלול",
        archived: false,
        createdAt: "2026-10-01T08:00:00Z",
        updatedAt: "2026-10-20T08:00:00Z",
      },
      expect.objectContaining({ mondayItemId: "103", name: "972527734410", source: "facebook", status: "new", service: null, calls: 0 }),
    ]);
  });

  it("archives the old board's leads", () => {
    expect(toLeads(snapshot("crm-archive")).leads.every((lead) => lead.archived)).toBe(true);
  });
});

describe("toTrips", () => {
  it("makes a flight board one trip, with the room, Monday's status and passport mark on each person", () => {
    const { trips, members } = toTrips({
      board: { id: "5097312406", name: "טיסה טו באב 26", updatedAt: null, items: 2, kind: "flight" },
      columns: [
        { id: "phone_mm2pf4nm", title: "טלפון" },
        { id: "color_mm3rh0q8", title: "סטטוס" },
        { id: "dropdown_mm3rxzqy", title: "דרכון" },
        { id: "text_mm3r3hsv", title: "חדר" },
        { id: "long_text_mm3r2cyv", title: "הערות" },
        { id: "date_mm3s6dh6", title: "Date" },
      ],
      groups: [{ id: "group_mm2pqvdg", title: 'ט"ו באב אומן' }],
      rows: [
        row("201", "שרה שפרה גליק", "group_mm2pqvdg", { phone_mm2pf4nm: "0501112233", color_mm3rh0q8: "תשלום חלקי", dropdown_mm3rxzqy: "יש", text_mm3r3hsv: "לבד" }),
        row("202", "מרים דוק", "group_mm2pqvdg", { color_mm3rh0q8: "צוות", dropdown_mm3rxzqy: "בהנפקה", long_text_mm3r2cyv: "צמחונית" }),
      ],
    });
    expect(trips).toEqual([
      {
        mondayKey: "board:5097312406",
        boardId: "5097312406",
        boardName: "טיסה טו באב 26",
        name: "טיסה טו באב 26",
        shortName: 'ט"ו באב אומן',
        kind: "flight",
        startsOn: null,
        endsOn: null,
        dateLabel: null,
      },
    ]);
    expect(members).toEqual([
      expect.objectContaining({ itemId: "201", phone: "972501112233", mondayStatus: "תשלום חלקי", mondayPassport: "yes", note: "חדר: לבד" }),
      expect.objectContaining({ itemId: "202", phone: null, mondayStatus: "צוות", mondayPassport: "in-progress", note: "צמחונית" }),
    ]);
  });

  it("makes each challah month an event, skipping empty months and cancellations", () => {
    const { trips, members } = toTrips({
      board: { id: "5095155077", name: "הפרשות חלה 26", updatedAt: null, items: 3, kind: "challah" },
      columns: [
        { id: "phone_mm2pf4nm", title: "טלפון" },
        { id: "date_mm3r77vt", title: "תאריך" },
        { id: "text_mm3pf74e", title: "עיר" },
        { id: "text_mm3r8e1m", title: "סוג האירוע" },
      ],
      groups: [
        { id: "g_dec", title: "2026 דצמבר" },
        { id: "g_nov", title: "נובמבר 2026" },
        { id: "g_cancel", title: "ביטולים" },
      ],
      rows: [
        row("301", "רחל אברהם", "g_nov", { phone_mm2pf4nm: "+972539902874", date_mm3r77vt: "2026-11-10", text_mm3pf74e: "דימונה", text_mm3r8e1m: "הפרשת חלה לכלה" }),
        row("302", "לאה ברגר", "g_cancel", { phone_mm2pf4nm: "0549981120", date_mm3r77vt: "2026-11-12" }),
      ],
    });
    expect(trips).toEqual([
      {
        mondayKey: "month:5095155077:g_nov",
        boardId: "5095155077",
        boardName: "הפרשות חלה 26",
        name: "הפרשות חלה · נובמבר 2026",
        shortName: "חלה · נובמבר 2026",
        kind: "event",
        startsOn: "2026-11-01",
        endsOn: "2026-11-30",
        dateLabel: "נובמבר 2026",
      },
    ]);
    expect(members).toEqual([
      expect.objectContaining({ tripKey: "month:5095155077:g_nov", itemId: "301", phone: "972539902874", eventOn: "2026-11-10", note: "הפרשת חלה לכלה · דימונה" }),
    ]);
  });
});
