import type { Queryable } from "../../config/pg.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { addDays, israelDay } from "../../lib/israel-time.js";
import type { LeadSource, MondayPassport } from "../monday-copy/monday-copy.mapping.js";
import { isValidMsisdn } from "../whatsapp/whatsapp.gateway.js";
import { localPhone, phoneSearchDigits } from "./dashboard.format.js";

/**
 * Customers: everyone on a trip or a challah evening in Monday (merged by phone), plus anyone a
 * passport brings in. Notes and passport views belong to the dashboard.
 */

export type PassportSource = "whatsapp" | "monday" | "manual";

export interface PassportDto {
  /** Masked (38•••921) while the "mask passport numbers" switch is on; revealing it is logged. */
  number: string;
  birthDate: string;
  issueDate: string;
  expiryDate: string;
  nationality: string;
  receivedVia: PassportSource;
  receivedAt: string;
  photoAvailable: boolean;
}

export interface NoteDto {
  id: string;
  at: string;
  text: string;
  byUserId: string;
}

export interface CustomerDto {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** A mobile number WhatsApp can reach. */
  whatsappConnected: boolean;
  groupIds: string[];
  source: LeadSource | "monday" | "manual";
  assigneeId: null;
  since: string;
  updatedAt: string;
  /** Null without one, and for people without passport access. */
  passport: PassportDto | null;
  /** Monday's own mark ("יש" / "בהנפקה") while no scan is on file. */
  mondayPassport: MondayPassport | null;
  /** Newest first. Empty in lists. */
  notes: NoteDto[];
  leadId: string | null;
  /** The Monday board of her newest row. */
  mondayBoard: string | null;
}

export type CustomerFilter = "all" | "whatsapp-today" | "expiring" | "missing-passport";

export interface CustomerQuery {
  filter?: CustomerFilter;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type CustomerCounts = Record<CustomerFilter, number> & { withPassport: number };

/** Passports expiring within this many days (about six months) are flagged, as on the dashboard. */
export const EXPIRING_WITHIN_DAYS = 183;

export interface Viewer {
  userId: string;
  /** May see passport details. */
  passports: boolean;
}

interface CustomerRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  source: CustomerDto["source"];
  created_at: Date;
  updated_at: Date;
  group_ids: string[];
  monday_passport: MondayPassport | null;
  monday_board: string | null;
  lead_id: string | null;
  p_number: string | null;
  p_birth_date: string | null;
  p_issue_date: string | null;
  p_expiry_date: string | null;
  p_nationality: string | null;
  p_received_via: PassportSource | null;
  p_received_at: Date | null;
  p_photo_path: string | null;
}

const CUSTOMER_SELECT = `
  SELECT c.id, c.first_name, c.last_name, c.phone, c.source, c.created_at, c.updated_at,
    ARRAY(SELECT m.group_id::text FROM group_members m JOIN groups g ON g.id = m.group_id
          WHERE m.customer_id = c.id AND g.removed_at IS NULL ORDER BY g.starts_on NULLS FIRST) AS group_ids,
    (SELECT m.monday_passport FROM group_members m WHERE m.customer_id = c.id AND m.monday_passport IS NOT NULL
     ORDER BY m.monday_passport = 'yes' DESC LIMIT 1) AS monday_passport,
    (SELECT g.monday_board_name FROM group_members m JOIN groups g ON g.id = m.group_id
     WHERE m.customer_id = c.id AND g.monday_board_name IS NOT NULL ORDER BY m.added_at DESC LIMIT 1) AS monday_board,
    (SELECT l.id FROM leads l WHERE c.phone IS NOT NULL AND l.phone = c.phone AND l.removed_at IS NULL
     ORDER BY l.archived, l.updated_at DESC LIMIT 1) AS lead_id,
    p.number AS p_number, p.birth_date AS p_birth_date, p.issue_date AS p_issue_date, p.expiry_date AS p_expiry_date,
    p.nationality AS p_nationality, p.received_via AS p_received_via, p.received_at AS p_received_at, p.photo_path AS p_photo_path
  FROM customers c LEFT JOIN passports p ON p.customer_id = c.id`;

/** "38412921" → "38•••921", the way the dashboard masks it. */
export function maskPassportNumber(number: string): string {
  return number.length < 6 ? "•••" : `${number.slice(0, 2)}•••${number.slice(-3)}`;
}

async function masking(db: Queryable): Promise<boolean> {
  const { rows } = await db.query<{ mask_passport_numbers: boolean }>("SELECT mask_passport_numbers FROM security_settings");
  return rows[0]?.mask_passport_numbers ?? true;
}

function toCustomer(row: CustomerRow, viewer: Viewer, mask: boolean): CustomerDto {
  const passport: PassportDto | null =
    viewer.passports && row.p_number !== null
      ? {
          number: mask ? maskPassportNumber(row.p_number) : row.p_number,
          birthDate: row.p_birth_date ?? "",
          issueDate: row.p_issue_date ?? "",
          expiryDate: row.p_expiry_date ?? "",
          nationality: row.p_nationality ?? "",
          receivedVia: row.p_received_via ?? "manual",
          receivedAt: (row.p_received_at ?? row.created_at).toISOString(),
          photoAvailable: row.p_photo_path !== null,
        }
      : null;
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: localPhone(row.phone),
    whatsappConnected: row.phone !== null && isValidMsisdn(row.phone),
    groupIds: row.group_ids,
    source: row.source,
    assigneeId: null,
    since: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    passport,
    mondayPassport: row.monday_passport,
    notes: [],
    leadId: row.lead_id,
    mondayBoard: row.monday_board,
  };
}

/** The SQL condition for a filter chip. Days are Israel days. */
function filterCondition(filter: CustomerFilter, values: unknown[], today: string): string | null {
  switch (filter) {
    case "whatsapp-today":
      values.push(today);
      return `p.received_via = 'whatsapp' AND (p.received_at AT TIME ZONE 'Asia/Jerusalem')::date = $${values.length}::date`;
    case "expiring":
      values.push(addDays(today, EXPIRING_WITHIN_DAYS));
      return `p.expiry_date IS NOT NULL AND p.expiry_date <= $${values.length}::date`;
    case "missing-passport":
      return "p.customer_id IS NULL";
    default:
      return null;
  }
}

const MAX_PAGE_SIZE = 100;

export async function listCustomers(db: Queryable, viewer: Viewer, query: CustomerQuery, now: Date): Promise<Page<CustomerDto>> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? 25));
  const values: unknown[] = [];
  const where: string[] = [];
  const condition = filterCondition(query.filter ?? "all", values, israelDay(now));
  if (condition) where.push(condition);
  const term = query.search?.trim();
  if (term) {
    values.push(`%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const options = [`(c.first_name || ' ' || c.last_name) ILIKE $${values.length}`];
    const digits = phoneSearchDigits(term);
    if (digits) {
      values.push(`%${digits}%`);
      options.push(`c.phone LIKE $${values.length}`);
      if (viewer.passports) options.push(`p.number LIKE $${values.length}`);
    }
    where.push(`(${options.join(" OR ")})`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const total = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM customers c LEFT JOIN passports p ON p.customer_id = c.id ${whereSql}`, values);
  values.push(pageSize, (page - 1) * pageSize);
  const { rows } = await db.query<CustomerRow>(
    `${CUSTOMER_SELECT} ${whereSql} ORDER BY c.updated_at DESC, c.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  const mask = await masking(db);
  return { items: rows.map((row) => toCustomer(row, viewer, mask)), total: total.rows[0].n, page, pageSize };
}

export async function customerCounts(db: Queryable, now: Date): Promise<CustomerCounts> {
  const today = israelDay(now);
  const count = async (filter: CustomerFilter) => {
    const values: unknown[] = [];
    const condition = filterCondition(filter, values, today);
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM customers c LEFT JOIN passports p ON p.customer_id = c.id ${condition ? `WHERE ${condition}` : ""}`,
      values,
    );
    return rows[0].n;
  };
  const all = await count("all");
  const missing = await count("missing-passport");
  return {
    all,
    "whatsapp-today": await count("whatsapp-today"),
    expiring: await count("expiring"),
    "missing-passport": missing,
    withPassport: all - missing,
  };
}

export async function getCustomer(db: Queryable, viewer: Viewer, id: string): Promise<CustomerDto> {
  const { rows } = await db.query<CustomerRow>(`${CUSTOMER_SELECT} WHERE c.id = $1`, [id]);
  if (!rows[0]) throw new NotFoundError("Customer");
  const customer = toCustomer(rows[0], viewer, await masking(db));
  const notes = await db.query<{ id: string; at: Date; text: string; by_user_id: string | null }>(
    "SELECT id, at, text, by_user_id FROM customer_notes WHERE customer_id = $1 ORDER BY at DESC, id",
    [id],
  );
  customer.notes = notes.rows.map((note) => ({ id: note.id, at: note.at.toISOString(), text: note.text, byUserId: note.by_user_id ?? "" }));
  return customer;
}

export async function addCustomerNote(db: Queryable, viewer: Viewer, id: string, text: string, now: Date): Promise<CustomerDto> {
  const note = text.trim();
  if (!note) throw new ValidationError("A note needs some text");
  const { rows } = await db.query<{ id: string }>("SELECT id FROM customers WHERE id = $1", [id]);
  if (!rows[0]) throw new NotFoundError("Customer");
  await db.query("INSERT INTO customer_notes (customer_id, by_user_id, at, text) VALUES ($1, $2, $3, $4)", [id, viewer.userId, now, note]);
  await db.query("UPDATE customers SET updated_at = GREATEST(updated_at, $2) WHERE id = $1", [id, now]);
  return getCustomer(db, viewer, id);
}

// ---- Passports ----

export type IntakeResult = "matched" | "new-card" | "needs-review";

export interface PassportIntakeDto {
  id: string;
  name: string;
  phone: string;
  receivedAt: string;
  result: IntakeResult;
  /** A reason code from the intake (passports domain); the dashboard words it. */
  reason: string;
  customerId: string | null;
}

/** Passports that arrived on WhatsApp, newest first. */
export async function listIntakes(db: Queryable): Promise<PassportIntakeDto[]> {
  const { rows } = await db.query<{
    id: string;
    sender_name: string | null;
    sender_phone: string | null;
    received_at: Date;
    status: string;
    reason: string | null;
    customer_id: string | null;
    first_name: string | null;
    last_name: string | null;
  }>(
    `SELECT i.id, i.sender_name, i.sender_phone, i.received_at, i.status, i.reason, i.customer_id, c.first_name, c.last_name
     FROM passport_intakes i LEFT JOIN customers c ON c.id = i.customer_id
     ORDER BY i.received_at DESC LIMIT 100`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.first_name !== null ? `${row.first_name} ${row.last_name ?? ""}`.trim() : (row.sender_name ?? ""),
    phone: localPhone(row.sender_phone),
    receivedAt: row.received_at.toISOString(),
    result: row.status === "matched" || row.status === "new-card" ? row.status : "needs-review",
    reason: row.reason ?? row.status,
    customerId: row.customer_id,
  }));
}

export type PassportAccessEntryDto = {
  id: string;
  at: string;
  byUserId: string | null;
  customerId: string;
  customerName: string;
} & ({ action: "passport-view" | "passport-photo-view" } | { action: "passport-received"; via: PassportSource });

/** Who saw the customer's passport, newest first, after its arrival. */
export async function passportAccessLog(db: Queryable, id: string): Promise<PassportAccessEntryDto[]> {
  const customer = await db.query<{ name: string; received_at: Date | null; received_via: PassportSource | null }>(
    `SELECT c.first_name || ' ' || c.last_name AS name, p.received_at, p.received_via
     FROM customers c LEFT JOIN passports p ON p.customer_id = c.id WHERE c.id = $1`,
    [id],
  );
  if (!customer.rows[0]) throw new NotFoundError("Customer");
  const { name, received_at: receivedAt, received_via: receivedVia } = customer.rows[0];
  const { rows } = await db.query<{ id: string; at: Date; by_user_id: string | null; action: "passport-view" | "passport-photo-view" }>(
    `SELECT id, at, by_user_id, action FROM audit_log
     WHERE customer_id = $1 AND action IN ('passport-view', 'passport-photo-view') ORDER BY at DESC, id LIMIT 200`,
    [id],
  );
  const entries: PassportAccessEntryDto[] = rows.map((row) => ({
    id: row.id,
    at: row.at.toISOString(),
    byUserId: row.by_user_id,
    action: row.action,
    customerId: id,
    customerName: name.trim(),
  }));
  if (receivedAt && receivedVia) {
    entries.push({ id: `${id}-passport-received`, at: receivedAt.toISOString(), byUserId: null, action: "passport-received", via: receivedVia, customerId: id, customerName: name.trim() });
  }
  return entries;
}

export type PassportPart = "details" | "photo";

/**
 * Showing a passport's number or photo: logged when the access log is on, and the full number
 * comes back for "details".
 */
export async function revealPassport(
  db: Queryable,
  viewer: Viewer,
  id: string,
  part: PassportPart,
  now: Date,
): Promise<{ entry: PassportAccessEntryDto | null; number: string | null }> {
  const { rows } = await db.query<{ number: string; name: string }>(
    `SELECT p.number, c.first_name || ' ' || c.last_name AS name FROM passports p JOIN customers c ON c.id = p.customer_id WHERE p.customer_id = $1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError("Passport");
  const action = part === "photo" ? "passport-photo-view" : "passport-view";
  const settings = await db.query<{ passport_access_log: boolean }>("SELECT passport_access_log FROM security_settings");
  let entry: PassportAccessEntryDto | null = null;
  if (settings.rows[0]?.passport_access_log ?? true) {
    const logged = await db.query<{ id: string }>(
      "INSERT INTO audit_log (at, by_user_id, action, customer_id, details) VALUES ($1, $2, $3, $4, $5::text::jsonb) RETURNING id",
      [now, viewer.userId, action, id, JSON.stringify({ customerName: rows[0].name.trim() })],
    );
    entry = { id: logged.rows[0].id, at: now.toISOString(), byUserId: viewer.userId, action, customerId: id, customerName: rows[0].name.trim() };
  }
  return { entry, number: part === "details" ? rows[0].number : null };
}

// ---- Messages ----

export type DeliveryStatus = "awaiting-approval" | "scheduled" | "paused" | "sent" | "delivered" | "read" | "failed";

export interface CustomerMessageDto {
  id: string;
  customerId: string;
  kind: "holiday" | "birthday";
  holiday: string | null;
  hebrewYear: number | null;
  campaignId: string | null;
  at: string;
  status: DeliveryStatus;
  failure: string | null;
}

const DELIVERY: Record<string, DeliveryStatus> = {
  queued: "scheduled",
  sending: "scheduled",
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
  skipped: "failed",
};

/** Greetings sent to the customer and the ones queued, newest first. */
export async function customerMessages(db: Queryable, id: string): Promise<CustomerMessageDto[]> {
  const exists = await db.query("SELECT 1 FROM customers WHERE id = $1", [id]);
  if (exists.rows.length === 0) throw new NotFoundError("Customer");
  const { rows } = await db.query<{
    id: string;
    kind: "holiday" | "birthday";
    campaign_id: string | null;
    holiday: string | null;
    hebrew_year: number | null;
    send_at: Date;
    sent_at: Date | null;
    status: string;
    failure: string | null;
  }>(
    `SELECT m.id, m.kind, m.campaign_id, c.holiday, c.hebrew_year, m.send_at, m.sent_at, m.status, m.failure
     FROM messages m LEFT JOIN campaigns c ON c.id = m.campaign_id
     WHERE m.customer_id = $1 ORDER BY COALESCE(m.sent_at, m.send_at) DESC LIMIT 100`,
    [id],
  );
  return rows.map((row) => ({
    id: row.id,
    customerId: id,
    kind: row.kind,
    holiday: row.holiday,
    hebrewYear: row.hebrew_year,
    campaignId: row.campaign_id,
    at: (row.sent_at ?? row.send_at).toISOString(),
    status: DELIVERY[row.status] ?? "failed",
    failure: row.failure === "invalid-number" || row.failure === "blocked" ? row.failure : null,
  }));
}
