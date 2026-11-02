import type { Queryable } from "../../config/pg.js";
import { NotFoundError } from "../../lib/errors.js";
import { addDays, israelDay } from "../../lib/israel-time.js";
import type { MondayPassport } from "../monday-copy/monday-copy.mapping.js";
import { EXPIRING_WITHIN_DAYS, type Viewer } from "./customers.service.js";
import { localPhone } from "./dashboard.format.js";

/** Trips (a Monday flight board) and events (a challah month), with the people on them. */

export interface FlightDto {
  outbound: null;
  inbound: null;
  airline: null;
  hotel: null;
  guide: null;
}

export interface GroupDto {
  id: string;
  name: string;
  shortName: string;
  type: "flight" | "event";
  womenOnly: boolean;
  /** Monday has no capacity. */
  capacity: number | null;
  startsOn: string | null;
  endsOn: string | null;
  dateLabel: string | null;
  /** Flights: travel details, empty until they're entered somewhere. Events: null. */
  flight: FlightDto | null;
  mondayBoard: string | null;
  registered: number;
  /** A passport on file, or Monday's "יש". */
  passportsReceived: number;
  missingPassports: number;
  /** Flights only: the share with a passport, 0–100. */
  readiness: number | null;
}

export interface GroupParticipantDto {
  customerId: string;
  firstName: string;
  lastName: string;
  phone: string;
  passport: "received" | "missing";
  passportExpiry: string | null;
  passportExpiringSoon: boolean;
  note: string | null;
  mondayPassport: MondayPassport | null;
  /** Monday's own status for her on a flight (תשלום חלקי, צוות…). */
  mondayStatus: string | null;
  /** A challah booking's date. */
  eventOn: string | null;
}

interface GroupRow {
  id: string;
  name: string;
  short_name: string | null;
  kind: "flight" | "event";
  women_only: boolean;
  capacity: number | null;
  starts_on: string | null;
  ends_on: string | null;
  date_label: string | null;
  monday_board_name: string | null;
  registered: number;
  passports: number;
}

const GROUP_SELECT = `
  SELECT g.id, g.name, g.short_name, g.kind, g.women_only, g.capacity, g.starts_on, g.ends_on, g.date_label, g.monday_board_name,
    (SELECT count(*)::int FROM group_members m WHERE m.group_id = g.id) AS registered,
    (SELECT count(*)::int FROM group_members m LEFT JOIN passports p ON p.customer_id = m.customer_id
     WHERE m.group_id = g.id AND (p.customer_id IS NOT NULL OR m.monday_passport = 'yes')) AS passports
  FROM groups g`;

function toGroup(row: GroupRow): GroupDto {
  const flight = row.kind === "flight";
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name ?? row.name,
    type: row.kind,
    womenOnly: row.women_only,
    capacity: row.capacity,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    dateLabel: row.date_label,
    flight: flight ? { outbound: null, inbound: null, airline: null, hotel: null, guide: null } : null,
    mondayBoard: row.monday_board_name,
    registered: row.registered,
    passportsReceived: row.passports,
    missingPassports: row.registered - row.passports,
    readiness: flight ? (row.registered === 0 ? 0 : Math.round((100 * row.passports) / row.registered)) : null,
  };
}

/** Every trip and event, undated ones first, then by start date. The screens hide the past ones. */
export async function listGroups(db: Queryable): Promise<GroupDto[]> {
  const { rows } = await db.query<GroupRow>(`${GROUP_SELECT} WHERE g.removed_at IS NULL ORDER BY g.starts_on NULLS FIRST, g.name`);
  return rows.map(toGroup);
}

export async function getGroup(db: Queryable, id: string): Promise<GroupDto> {
  const { rows } = await db.query<GroupRow>(`${GROUP_SELECT} WHERE g.id = $1 AND g.removed_at IS NULL`, [id]);
  if (!rows[0]) throw new NotFoundError("Group");
  return toGroup(rows[0]);
}

export async function groupParticipants(db: Queryable, viewer: Viewer, id: string, now: Date): Promise<GroupParticipantDto[]> {
  await getGroup(db, id);
  const soon = addDays(israelDay(now), EXPIRING_WITHIN_DAYS);
  const { rows } = await db.query<{
    customer_id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    has_passport: boolean;
    expiry_date: string | null;
    note: string | null;
    monday_passport: MondayPassport | null;
    monday_status: string | null;
    event_on: string | null;
  }>(
    `SELECT m.customer_id, c.first_name, c.last_name, c.phone, p.customer_id IS NOT NULL AS has_passport, p.expiry_date,
            m.note, m.monday_passport, m.monday_status, m.event_on
     FROM group_members m JOIN customers c ON c.id = m.customer_id LEFT JOIN passports p ON p.customer_id = m.customer_id
     WHERE m.group_id = $1
     ORDER BY m.event_on NULLS LAST, c.first_name, c.last_name`,
    [id],
  );
  return rows.map((row) => {
    const expiry = viewer.passports ? row.expiry_date : null;
    return {
      customerId: row.customer_id,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: localPhone(row.phone),
      passport: row.has_passport ? "received" : "missing",
      passportExpiry: expiry,
      passportExpiringSoon: expiry !== null && expiry <= soon,
      note: row.note,
      mondayPassport: row.monday_passport,
      mondayStatus: row.monday_status,
      eventOn: row.event_on,
    };
  });
}
