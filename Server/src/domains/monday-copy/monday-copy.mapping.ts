import { toMsisdn } from "../whatsapp/whatsapp.gateway.js";

/**
 * How Ronit's Monday boards land in the dashboard's database. Pure functions: the copy reads
 * the boards, these decide what each row becomes, and the repository writes the result.
 * Columns are found by title, not id, so next year's boards work without code changes.
 */

export type BoardKind = "crm" | "crm-archive" | "flight" | "challah";
export type LeadStatus = "new" | "no-answer" | "talking" | "details-sent" | "registered" | "not-relevant";
export type LeadSource = "landing-page" | "instagram" | "facebook" | "whatsapp" | "referral";
export type Service = "uman" | "challah";
export type MondayPassport = "yes" | "in-progress";

export interface MondayBoardInfo {
  id: string;
  name: string;
  /** When anything on the board last changed, as Monday reports it. */
  updatedAt: string | null;
  items: number;
}

export interface MondayColumn {
  id: string;
  title: string;
}

export interface MondayGroup {
  id: string;
  title: string;
}

export interface MondayRow {
  id: string;
  name: string;
  groupId: string;
  createdAt: string;
  updatedAt: string;
  /** Each column's text, by column id. */
  values: Record<string, string>;
}

export interface BoardSnapshot {
  board: MondayBoardInfo & { kind: BoardKind };
  columns: MondayColumn[];
  groups: MondayGroup[];
  rows: MondayRow[];
}

/** A Monday "update" on a row: a note the team wrote, or a call summary. */
export interface MondayNote {
  id: string;
  itemId: string;
  at: string;
  author: string | null;
  body: string;
}

export interface CrmBoardIds {
  crm: string;
  archive: string;
}

/** The CRM boards by id; trip boards by name, since the close flow creates new ones. */
export function classifyBoard(board: Pick<MondayBoardInfo, "id" | "name">, ids: CrmBoardIds): BoardKind | null {
  if (board.id === ids.crm) return "crm";
  if (board.id === ids.archive) return "crm-archive";
  if (board.name.includes("הפרשות חלה")) return "challah";
  if (board.name.includes("טיסה") || board.name.includes("אומן")) return "flight";
  return null;
}

// ---- Reading a row ----

/** Titles that name the same column on different boards. */
const SAME_COLUMN: string[][] = [
  ["טלפון", "מספר טלפון", "Phone"],
  ["עיר", "עיר מגורים"],
  ["דרכון", "דרכון בתוקף"],
  ["תאריך", "Date"],
];

/** "שלב הבא -" and "שלב הבא" are the same title. */
function titleKey(title: string): string {
  return title.replace(/[\s\-–—:]+/g, " ").trim();
}

function spellings(title: string): string[] {
  const key = titleKey(title);
  return SAME_COLUMN.find((group) => group.some((spelling) => titleKey(spelling) === key)) ?? [title];
}

export type ColumnReader = (row: MondayRow, title: string) => string;

/** Reads a row's column by its title (or another spelling of it); "" when the board has none or it's empty. */
export function columnReader(columns: MondayColumn[]): ColumnReader {
  const idsByTitle = new Map<string, string[]>();
  for (const column of columns) {
    const key = titleKey(column.title);
    idsByTitle.set(key, [...(idsByTitle.get(key) ?? []), column.id]);
  }
  return (row, title) => {
    for (const spelling of spellings(title)) {
      for (const id of idsByTitle.get(titleKey(spelling)) ?? []) {
        const value = row.values[id]?.trim();
        if (value) return value;
      }
    }
    return "";
  };
}

const MIN_PHONE_DIGITS = 7;

/** Digits with the country code and no plus (972501234567), like the WhatsApp gateway; null without a usable number. */
export function normalizePhone(text: string): string | null {
  const digits = text.replace(/\D/g, "");
  return digits.length < MIN_PHONE_DIGITS ? null : toMsisdn(digits);
}

/** A date column's day (YYYY-MM-DD), without any time Monday adds. */
export function dayOf(text: string): string | null {
  return /^(\d{4}-\d{2}-\d{2})/.exec(text.trim())?.[1] ?? null;
}

function countOf(text: string): number {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function emailOf(text: string): string | null {
  return /[^\s@]+@[^\s@]+\.[^\s@]+/.exec(text)?.[0].toLowerCase() ?? null;
}

/** "שרה שפרה גליק" → first "שרה שפרה", last "גליק": the last word is the surname. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

// ---- Leads ----

const FOLLOW_UP = ["פולואפ", "פולו אפ", "פולאו אפ", "פולואו אפ", "פולואופ"];

/** The dashboard's status, from the row's group and its "נוצר קשר" label (spec section 3). */
export function leadStatus(groupTitle: string, contactStatus: string): LeadStatus {
  const group = groupTitle.trim();
  const status = contactStatus.trim();
  if (group.includes("לא רלוונטי")) return "not-relevant";
  if (group.startsWith("נסגר")) return "registered";
  if (status === "לא רלוונטי" || status === "תרומה") return "not-relevant";
  if (status === "נסגר") return "registered";
  if (status.startsWith("קיבלה פרטים")) return "details-sent";
  if (status === "נוצר קשר" || status === "לחזור אליה שוב" || status === "מעוניינת להתקדם") return "talking";
  if (status === "אין מענה") return "no-answer";
  if (group.includes("תרומה")) return "not-relevant";
  if (group.includes("אין מענה")) return "no-answer";
  if (FOLLOW_UP.some((spelling) => group.includes(spelling))) return "talking";
  return "new";
}

/** Paid ads (ממומן) come from Facebook; a row with an Instagram message came from Instagram; the rest from the website. */
export function leadSource(sourceLabel: string, instagramMessage: string): LeadSource {
  if (sourceLabel.trim() === "ממומן") return "facebook";
  if (instagramMessage.trim()) return "instagram";
  return "landing-page";
}

export function serviceOf(label: string): Service | null {
  if (label.includes("אומן")) return "uman";
  if (label.includes("חלה")) return "challah";
  return null;
}

export interface LeadRecord {
  mondayItemId: string;
  mondayBoardId: string;
  mondayGroup: string;
  name: string;
  phone: string;
  email: string | null;
  service: Service | null;
  status: LeadStatus;
  contactStatus: string | null;
  source: LeadSource;
  calls: number;
  lastCallOn: string | null;
  inquiryOn: string | null;
  lastMessage: string | null;
  nextStep: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A CRM board's rows that have a phone. The rest are Instagram chats that never left a number. */
export function toLeads(snapshot: BoardSnapshot): { leads: LeadRecord[]; withoutPhone: number } {
  const read = columnReader(snapshot.columns);
  const groupTitles = new Map(snapshot.groups.map((group) => [group.id, group.title.trim()]));
  const leads: LeadRecord[] = [];
  let withoutPhone = 0;
  for (const row of snapshot.rows) {
    const phone = normalizePhone(read(row, "מספר טלפון"));
    if (!phone) {
      withoutPhone += 1;
      continue;
    }
    const groupTitle = groupTitles.get(row.groupId) ?? "";
    const contactStatus = read(row, "נוצר קשר");
    const instagramMessage = read(row, "הודעה אחרונה באינסטגרם");
    leads.push({
      mondayItemId: row.id,
      mondayBoardId: snapshot.board.id,
      mondayGroup: groupTitle,
      name: row.name.trim() || phone,
      phone,
      email: emailOf(read(row, "מייל")),
      service: serviceOf(read(row, "שירות")),
      status: leadStatus(groupTitle, contactStatus),
      contactStatus: contactStatus || null,
      source: leadSource(read(row, "מקור ליד"), instagramMessage),
      calls: countOf(read(row, "כמות שיחות שבוצעו")),
      lastCallOn: dayOf(read(row, "שיחה אחרונה")),
      inquiryOn: dayOf(read(row, "תאריך פנייה")),
      lastMessage: instagramMessage || null,
      nextStep: read(row, "שלב הבא") || null,
      archived: snapshot.board.kind === "crm-archive",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
  return { leads, withoutPhone };
}

// ---- Trips and events ----

const HEBREW_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const pad = (value: number) => String(value).padStart(2, "0");

/** A challah month group's title ("נובמבר 2026", "2026 דצמבר"): its label and first and last day. */
export function monthOf(title: string): { label: string; start: string; end: string } | null {
  const year = /(?:^|\D)(20\d{2})(?:\D|$)/.exec(title)?.[1];
  const index = HEBREW_MONTHS.findIndex((month) => title.includes(month));
  const month = index >= 0 ? index : title.includes("מרס") ? 2 : -1;
  if (!year || month < 0) return null;
  const lastDay = new Date(Date.UTC(Number(year), month + 1, 0)).getUTCDate();
  return { label: `${HEBREW_MONTHS[month]} ${year}`, start: `${year}-${pad(month + 1)}-01`, end: `${year}-${pad(month + 1)}-${pad(lastDay)}` };
}

export function passportMark(text: string): MondayPassport | null {
  const value = text.trim();
  if (value === "יש" || value === "כן") return "yes";
  if (value === "בהנפקה") return "in-progress";
  return null;
}

export interface TripRecord {
  /** 'board:<id>' for a flight board, 'month:<board>:<group>' for a challah month. */
  mondayKey: string;
  boardId: string;
  boardName: string;
  name: string;
  shortName: string;
  kind: "flight" | "event";
  startsOn: string | null;
  endsOn: string | null;
  /** The office's own words for when, shown instead of a date: "נובמבר 2026". */
  dateLabel: string | null;
}

export interface MemberRecord {
  tripKey: string;
  itemId: string;
  name: string;
  phone: string | null;
  /** Monday's own status for the person on a flight: תשלום חלקי, נסגר, צוות, בתהליך. */
  mondayStatus: string | null;
  mondayPassport: MondayPassport | null;
  note: string | null;
  /** A challah booking's date. */
  eventOn: string | null;
  createdAt: string;
  updatedAt: string;
}

const joinNote = (parts: string[]) => parts.filter(Boolean).join(" · ") || null;

function dateRange(days: (string | null)[]): { startsOn: string | null; endsOn: string | null } {
  const sorted = days.filter((day): day is string => day !== null).sort();
  if (sorted.length === 0) return { startsOn: null, endsOn: null };
  const startsOn = sorted[0];
  const last = sorted[sorted.length - 1];
  return { startsOn, endsOn: last === startsOn ? null : last };
}

/** A flight board is one trip; a challah board is one event per month group. Empty groups and cancellations are left out. */
export function toTrips(snapshot: BoardSnapshot): { trips: TripRecord[]; members: MemberRecord[] } {
  const { board } = snapshot;
  const read = columnReader(snapshot.columns);
  const phoneOf = (row: MondayRow) => normalizePhone(read(row, "טלפון"));

  if (board.kind === "flight") {
    const mondayKey = `board:${board.id}`;
    const members = snapshot.rows.map((row) => {
      const room = read(row, "חדר");
      return {
        tripKey: mondayKey,
        itemId: row.id,
        name: row.name.trim(),
        phone: phoneOf(row),
        mondayStatus: read(row, "סטטוס") || null,
        mondayPassport: passportMark(read(row, "דרכון")),
        note: joinNote([room ? `חדר: ${room}` : "", read(row, "הערות")]),
        eventOn: dayOf(read(row, "תאריך")),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies MemberRecord;
    });
    if (members.length === 0) return { trips: [], members: [] };
    const onlyGroup = snapshot.groups.length === 1 ? snapshot.groups[0].title.trim() : "";
    const trip: TripRecord = {
      mondayKey,
      boardId: board.id,
      boardName: board.name,
      name: board.name.trim(),
      shortName: onlyGroup || board.name.trim(),
      kind: "flight",
      ...dateRange(members.map((member) => member.eventOn)),
      dateLabel: null,
    };
    return { trips: [trip], members };
  }

  if (board.kind === "challah") {
    const trips: TripRecord[] = [];
    const members: MemberRecord[] = [];
    for (const group of snapshot.groups) {
      if (group.title.includes("ביטול")) continue;
      const rows = snapshot.rows.filter((row) => row.groupId === group.id);
      if (rows.length === 0) continue;
      const mondayKey = `month:${board.id}:${group.id}`;
      const groupMembers = rows.map(
        (row): MemberRecord => ({
          tripKey: mondayKey,
          itemId: row.id,
          name: row.name.trim(),
          phone: phoneOf(row),
          mondayStatus: null,
          mondayPassport: null,
          note: joinNote([read(row, "סוג האירוע"), read(row, "עיר")]),
          eventOn: dayOf(read(row, "תאריך")),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }),
      );
      const month = monthOf(group.title);
      const label = month?.label ?? group.title.trim();
      const range = dateRange(groupMembers.map((member) => member.eventOn));
      trips.push({
        mondayKey,
        boardId: board.id,
        boardName: board.name,
        name: `הפרשות חלה · ${label}`,
        shortName: `חלה · ${label}`,
        kind: "event",
        startsOn: month?.start ?? range.startsOn,
        endsOn: month?.end ?? range.endsOn,
        dateLabel: label,
      });
      members.push(...groupMembers);
    }
    return { trips, members };
  }

  return { trips: [], members: [] };
}
