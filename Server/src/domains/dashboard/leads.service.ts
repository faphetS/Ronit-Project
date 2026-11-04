import { env } from "../../config/env.js";
import type { Queryable } from "../../config/pg.js";
import { NotFoundError } from "../../lib/errors.js";
import type { LeadSource, LeadStatus, Service } from "../monday-copy/monday-copy.mapping.js";
import { localPhone, phoneSearchDigits } from "./dashboard.format.js";

/** Leads, as copied from Monday's CRM boards. Read-only: they're edited in Monday until the switch-over. */

export interface LeadEventDto {
  id: string;
  at: string;
  text: string;
  /** Monday notes have an author's name, not a dashboard user. */
  byUserId: null;
  author: string | null;
  mondayBoard: string | null;
}

export interface LeadDto {
  id: string;
  name: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  service: Service | null;
  /** Monday doesn't say which trip, or which dashboard user; these stay empty until the switch-over. */
  groupId: null;
  assigneeId: null;
  mondayBoard: string;
  mondayGroup: string;
  mondayUrl: string;
  createdAt: string;
  updatedAt: string;
  lastNote: string;
  archived: boolean;
  calls: number;
  lastCallOn: string | null;
  inquiryOn: string | null;
  lastMessage: string | null;
  nextStep: string | null;
  /** Newest first. Empty in lists; filled by getLead. */
  history: LeadEventDto[];
}

export type LeadStatusFilter = LeadStatus | "all";

export interface LeadFilters {
  status?: LeadStatusFilter;
  service?: Service;
  source?: LeadSource;
  search?: string;
  /** Only the leads that came in on this day (YYYY-MM-DD in Israel), archived ones too. */
  day?: string;
}

export type LeadCounts = Record<LeadStatusFilter, number>;

/** How many leads came in on one day. */
export interface LeadDayDto {
  /** YYYY-MM-DD, in Israel. */
  day: string;
  count: number;
}

/** The day a lead came in: Monday's "תאריך פנייה", or else the day its row was made, in Israel. */
const ARRIVED_ON = "coalesce(l.inquiry_on, (l.created_at AT TIME ZONE 'Asia/Jerusalem')::date)";

interface LeadRow {
  id: string;
  monday_item_id: string;
  monday_board_id: string;
  monday_group: string;
  board_name: string | null;
  name: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  service: Service | null;
  calls: number;
  last_call_on: string | null;
  inquiry_on: string | null;
  last_message: string | null;
  next_step: string | null;
  archived: boolean;
  created_at: Date;
  updated_at: Date;
  last_note: string | null;
}

const LEAD_SELECT = `
  SELECT l.id, l.monday_item_id, l.monday_board_id, l.monday_group, b.name AS board_name, l.name, l.phone, l.source,
         l.status, l.service, l.calls, l.last_call_on, l.inquiry_on, l.last_message, l.next_step, l.archived,
         l.created_at, l.updated_at,
         (SELECT n.body FROM monday_notes n WHERE n.monday_item_id = l.monday_item_id ORDER BY n.at DESC LIMIT 1) AS last_note
  FROM leads l LEFT JOIN monday_boards b ON b.id = l.monday_board_id`;

/** Where a row opens in Monday. */
export function mondayUrl(boardId: string, itemId: string): string {
  return `https://${env.MONDAY_ACCOUNT_SLUG}.monday.com/boards/${boardId}/pulses/${itemId}`;
}

function toLead(row: LeadRow): LeadDto {
  return {
    id: row.id,
    name: row.name,
    phone: localPhone(row.phone),
    source: row.source,
    status: row.status,
    service: row.service,
    groupId: null,
    assigneeId: null,
    mondayBoard: row.board_name ?? "",
    mondayGroup: row.monday_group,
    mondayUrl: mondayUrl(row.monday_board_id, row.monday_item_id),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    lastNote: row.last_note ?? row.next_step ?? row.last_message ?? "",
    archived: row.archived,
    calls: row.calls,
    lastCallOn: row.last_call_on,
    inquiryOn: row.inquiry_on,
    lastMessage: row.last_message,
    nextStep: row.next_step,
    history: [],
  };
}

/** A list never runs away: the pipeline is a few hundred leads. */
const LIST_LIMIT = 500;

/**
 * The open pipeline (not archived, not "not relevant"), newest Monday update first; "not-relevant"
 * lists those instead. A search, or a day, also finds archived leads, after the open ones.
 */
export async function listLeads(db: Queryable, filters: LeadFilters = {}): Promise<LeadDto[]> {
  const where = ["l.removed_at IS NULL"];
  const values: unknown[] = [];
  const add = (sql: (n: number) => string, value: unknown) => {
    values.push(value);
    where.push(sql(values.length));
  };
  const status = filters.status ?? "all";
  if (status === "all") where.push("l.status <> 'not-relevant'");
  else add((n) => `l.status = $${n}`, status);
  if (filters.service) add((n) => `l.service = $${n}`, filters.service);
  if (filters.source) add((n) => `l.source = $${n}`, filters.source);
  if (filters.day) add((n) => `${ARRIVED_ON} = $${n}::date`, filters.day);
  const term = filters.search?.trim();
  if (term) {
    values.push(`%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const byName = `l.name ILIKE $${values.length}`;
    const digits = phoneSearchDigits(term);
    if (digits) {
      values.push(`%${digits}%`);
      where.push(`(${byName} OR l.phone LIKE $${values.length})`);
    } else {
      where.push(byName);
    }
  } else if (!filters.day) {
    where.push("NOT l.archived");
  }
  const { rows } = await db.query<LeadRow>(
    `${LEAD_SELECT} WHERE ${where.join(" AND ")} ORDER BY l.archived, l.updated_at DESC LIMIT ${LIST_LIMIT}`,
    values,
  );
  return rows.map(toLead);
}

/** Open leads by status ("all" is the open pipeline), and the not-relevant ones apart. */
export async function leadCounts(db: Queryable): Promise<LeadCounts> {
  const { rows } = await db.query<{ status: LeadStatus; n: number }>(
    "SELECT status, count(*)::int AS n FROM leads WHERE removed_at IS NULL AND NOT archived GROUP BY status",
  );
  const counts: LeadCounts = { all: 0, new: 0, "no-answer": 0, talking: 0, "details-sent": 0, registered: 0, "not-relevant": 0 };
  for (const row of rows) {
    counts[row.status] = row.n;
    if (row.status !== "not-relevant") counts.all += row.n;
  }
  return counts;
}

/** How many leads came in on each day, oldest day first: every lead, archived and not-relevant ones too. */
export async function leadDays(db: Queryable): Promise<LeadDayDto[]> {
  const { rows } = await db.query<LeadDayDto>(
    `SELECT to_char(${ARRIVED_ON}, 'YYYY-MM-DD') AS day, count(*)::int AS count
     FROM leads l WHERE l.removed_at IS NULL GROUP BY 1 ORDER BY 1`,
  );
  return rows;
}

/** A lead with its Monday notes, newest first. Archived leads too. */
export async function getLead(db: Queryable, id: string): Promise<LeadDto> {
  const { rows } = await db.query<LeadRow>(`${LEAD_SELECT} WHERE l.id = $1 AND l.removed_at IS NULL`, [id]);
  if (!rows[0]) throw new NotFoundError("Lead");
  const lead = toLead(rows[0]);
  const notes = await db.query<{ id: string; at: Date; author: string | null; body: string }>(
    "SELECT id, at, author, body FROM monday_notes WHERE monday_item_id = $1 ORDER BY at DESC LIMIT 200",
    [rows[0].monday_item_id],
  );
  lead.history = notes.rows.map((note) => ({
    id: note.id,
    at: note.at.toISOString(),
    text: note.body,
    byUserId: null,
    author: note.author,
    mondayBoard: lead.mondayBoard || null,
  }));
  return lead;
}
