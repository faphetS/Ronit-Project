import type { Queryable } from "../../config/pg.js";
import {
  splitName,
  type BoardKind,
  type LeadRecord,
  type MemberRecord,
  type MondayBoardInfo,
  type MondayNote,
  type TripRecord,
} from "./monday-copy.mapping.js";

/**
 * The copy's writes. Each copy runs them in one transaction, so the dashboard never sees half
 * a copy. Bulk rows go in as one JSON parameter (jsonb_to_recordset), one statement per board.
 */

export interface StoredBoard {
  id: string;
  name: string;
  kind: BoardKind;
  items: number;
  copiedAt: Date | null;
  notesThrough: Date | null;
  notesRefreshedAt: Date | null;
  removedAt: Date | null;
}

export async function storedBoards(db: Queryable): Promise<Map<string, StoredBoard>> {
  const { rows } = await db.query<{
    id: string;
    name: string;
    kind: BoardKind;
    items: number;
    copied_at: Date | null;
    notes_through: Date | null;
    notes_refreshed_at: Date | null;
    removed_at: Date | null;
  }>("SELECT id, name, kind, items, copied_at, notes_through, notes_refreshed_at, removed_at FROM monday_boards");
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        kind: row.kind,
        items: row.items,
        copiedAt: row.copied_at,
        notesThrough: row.notes_through,
        notesRefreshedAt: row.notes_refreshed_at,
        removedAt: row.removed_at,
      },
    ]),
  );
}

export interface BoardUpdate {
  info: MondayBoardInfo;
  kind: BoardKind;
  /** Set when the board's rows were read in this copy. */
  read: { rows: number; groups: number } | null;
  /** Set when its notes were read through to the end. */
  notesThrough: Date | null;
  /** Set when every row's notes were read one by one. */
  notesRefreshedAt: Date | null;
}

export async function saveBoard(tx: Queryable, update: BoardUpdate, now: Date): Promise<void> {
  const { info, kind, read } = update;
  await tx.query(
    `INSERT INTO monday_boards (id, name, kind, items, groups, monday_updated_at, copied_at, notes_through, notes_refreshed_at, removed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $10, NULL)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       kind = EXCLUDED.kind,
       items = EXCLUDED.items,
       groups = CASE WHEN $9 THEN EXCLUDED.groups ELSE monday_boards.groups END,
       monday_updated_at = EXCLUDED.monday_updated_at,
       copied_at = COALESCE(EXCLUDED.copied_at, monday_boards.copied_at),
       notes_through = COALESCE(EXCLUDED.notes_through, monday_boards.notes_through),
       notes_refreshed_at = COALESCE(EXCLUDED.notes_refreshed_at, monday_boards.notes_refreshed_at),
       removed_at = NULL`,
    [info.id, info.name, kind, read?.rows ?? info.items, read?.groups ?? 0, info.updatedAt, read ? now : null, update.notesThrough, read !== null, update.notesRefreshedAt],
  );
}

/** A board gone from the account: its leads and trips are hidden. */
export async function removeBoard(tx: Queryable, boardId: string, now: Date): Promise<void> {
  await tx.query("UPDATE monday_boards SET removed_at = $2 WHERE id = $1 AND removed_at IS NULL", [boardId, now]);
  await tx.query("UPDATE leads SET removed_at = $2 WHERE monday_board_id = $1 AND removed_at IS NULL", [boardId, now]);
  await removeTripsExcept(tx, boardId, [], now);
}

// ---- Leads ----

/** Upserts a CRM board's leads, and hides the ones no longer on it (or without a phone now). */
export async function saveLeads(tx: Queryable, boardId: string, leads: LeadRecord[], now: Date): Promise<void> {
  const rows = leads.map((lead) => ({
    monday_item_id: lead.mondayItemId,
    monday_board_id: lead.mondayBoardId,
    monday_group: lead.mondayGroup,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    service: lead.service,
    status: lead.status,
    contact_status: lead.contactStatus,
    source: lead.source,
    calls: lead.calls,
    last_call_on: lead.lastCallOn,
    inquiry_on: lead.inquiryOn,
    last_message: lead.lastMessage,
    next_step: lead.nextStep,
    archived: lead.archived,
    created_at: lead.createdAt,
    updated_at: lead.updatedAt,
  }));
  if (rows.length > 0) {
    await tx.query(
      `INSERT INTO leads (monday_item_id, monday_board_id, monday_group, name, phone, email, service, status,
         contact_status, source, calls, last_call_on, inquiry_on, last_message, next_step, archived,
         created_at, updated_at, removed_at, copied_at)
       SELECT r.monday_item_id, r.monday_board_id, r.monday_group, r.name, r.phone, r.email, r.service, r.status,
         r.contact_status, r.source, r.calls, r.last_call_on, r.inquiry_on, r.last_message, r.next_step, r.archived,
         r.created_at, r.updated_at, NULL, $2
       FROM jsonb_to_recordset($1::jsonb) AS r(
         monday_item_id text, monday_board_id text, monday_group text, name text, phone text, email text,
         service text, status text, contact_status text, source text, calls integer, last_call_on date,
         inquiry_on date, last_message text, next_step text, archived boolean, created_at timestamptz,
         updated_at timestamptz)
       ON CONFLICT (monday_item_id) DO UPDATE SET
         monday_board_id = EXCLUDED.monday_board_id, monday_group = EXCLUDED.monday_group, name = EXCLUDED.name,
         phone = EXCLUDED.phone, email = EXCLUDED.email, service = EXCLUDED.service, status = EXCLUDED.status,
         contact_status = EXCLUDED.contact_status, source = EXCLUDED.source, calls = EXCLUDED.calls,
         last_call_on = EXCLUDED.last_call_on, inquiry_on = EXCLUDED.inquiry_on, last_message = EXCLUDED.last_message,
         next_step = EXCLUDED.next_step, archived = EXCLUDED.archived, created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at, removed_at = NULL, copied_at = EXCLUDED.copied_at`,
      [JSON.stringify(rows), now],
    );
  }
  await tx.query(
    "UPDATE leads SET removed_at = $3 WHERE monday_board_id = $1 AND removed_at IS NULL AND monday_item_id <> ALL($2::text[])",
    [boardId, leads.map((lead) => lead.mondayItemId), now],
  );
}

/**
 * Saves the notes of rows on the board, and forgets the notes of rows no longer on it. Monday's
 * board feed also returns notes of rows deleted or moved off the board (leads closed into a trip):
 * those aren't kept. `everyNote` is a read of every row's own notes: notes edited in Monday take
 * the new text, and notes deleted there go.
 */
export async function saveNotes(tx: Queryable, boardId: string, notes: MondayNote[], rowIds: string[], everyNote: boolean): Promise<void> {
  const onBoard = new Set(rowIds);
  const kept = notes.filter((note) => onBoard.has(note.itemId));
  if (kept.length > 0) {
    await tx.query(
      `INSERT INTO monday_notes (id, monday_item_id, board_id, at, author, body)
       SELECT r.id, r.item_id, $2, r.at, r.author, r.body
       FROM jsonb_to_recordset($1::jsonb) AS r(id text, item_id text, at timestamptz, author text, body text)
       ON CONFLICT (id) DO ${everyNote ? "UPDATE SET monday_item_id = EXCLUDED.monday_item_id, board_id = EXCLUDED.board_id, at = EXCLUDED.at, author = EXCLUDED.author, body = EXCLUDED.body" : "NOTHING"}`,
      [JSON.stringify(kept.map((note) => ({ id: note.id, item_id: note.itemId, at: note.at, author: note.author, body: note.body }))), boardId],
    );
  }
  if (everyNote) {
    await tx.query("DELETE FROM monday_notes WHERE board_id = $1 AND id <> ALL($2::text[])", [boardId, kept.map((note) => note.id)]);
  } else {
    await tx.query("DELETE FROM monday_notes WHERE board_id = $1 AND monday_item_id <> ALL($2::text[])", [boardId, rowIds]);
  }
}

// ---- Trips, events and their people ----

function tripKeysOf(boardId: string): string[] {
  return [`board:${boardId}`, `month:${boardId}:%`];
}

/** Hides a board's trips that aren't in `keep`, and takes their people off them. */
async function removeTripsExcept(tx: Queryable, boardId: string, keep: string[], now: Date): Promise<void> {
  const [boardKey, monthPattern] = tripKeysOf(boardId);
  const { rows } = await tx.query<{ id: string }>(
    `UPDATE groups SET removed_at = $4, updated_at = $4
     WHERE (monday_key = $1 OR monday_key LIKE $2) AND removed_at IS NULL AND monday_key <> ALL($3::text[])
     RETURNING id`,
    [boardKey, monthPattern, keep, now],
  );
  if (rows.length > 0) await tx.query("DELETE FROM group_members WHERE group_id = ANY($1::uuid[])", [rows.map((row) => row.id)]);
}

/** "שרה  כהן " and "שרה כהן" are the same name. */
const sameName = "regexp_replace(btrim(first_name || ' ' || last_name), '\\s+', ' ', 'g')";

/**
 * The customer a Monday row belongs to. A row keeps the customer it was first linked to (so a
 * rename or a new phone in Monday follows her). A new row is the same person as a customer with the
 * same phone and the same name; a phone shared under another name (a mother and her daughter) is
 * someone else. Customers the copy created take the name and phone of their newest row.
 */
async function customerFor(tx: Queryable, member: MemberRecord): Promise<{ id: string; created: boolean }> {
  const { firstName, lastName } = splitName(member.name);
  const name = [firstName, lastName].filter(Boolean).join(" ");
  let id = (await tx.query<{ customer_id: string }>("SELECT customer_id FROM group_members WHERE monday_item_id = $1", [member.itemId])).rows[0]?.customer_id;
  if (!id && member.phone) {
    id = (
      await tx.query<{ id: string }>(`SELECT id FROM customers WHERE phone = $1 AND ${sameName} = $2 ORDER BY created_at, id LIMIT 1`, [member.phone, name])
    ).rows[0]?.id;
  }
  if (id) {
    await tx.query(
      `UPDATE customers SET
         first_name = CASE WHEN $4 >= updated_at THEN $2 ELSE first_name END,
         last_name = CASE WHEN $4 >= updated_at THEN $3 ELSE last_name END,
         phone = CASE WHEN $4 >= updated_at THEN COALESCE($6, phone) ELSE phone END,
         updated_at = GREATEST(updated_at, $4),
         created_at = LEAST(created_at, $5)
       WHERE id = $1 AND from_monday`,
      [id, firstName, lastName, member.updatedAt, member.createdAt, member.phone],
    );
    return { id, created: false };
  }
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO customers (first_name, last_name, phone, source, from_monday, created_at, updated_at)
     VALUES ($1, $2, $3, 'monday', true, $4, $5) RETURNING id`,
    [firstName, lastName, member.phone, member.createdAt, member.updatedAt],
  );
  return { id: rows[0].id, created: true };
}

/** Upserts a trip board's trips and their people (one membership per row), and removes what's gone from the board. Returns customers created. */
export async function saveTrips(tx: Queryable, boardId: string, trips: TripRecord[], members: MemberRecord[], now: Date): Promise<number> {
  const groupIds = new Map<string, string>();
  for (const trip of trips) {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO groups (name, short_name, kind, starts_on, ends_on, date_label, monday_key, monday_board_name, removed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9)
       ON CONFLICT (monday_key) DO UPDATE SET
         name = EXCLUDED.name, short_name = EXCLUDED.short_name, kind = EXCLUDED.kind, starts_on = EXCLUDED.starts_on,
         ends_on = EXCLUDED.ends_on, date_label = EXCLUDED.date_label, monday_board_name = EXCLUDED.monday_board_name,
         removed_at = NULL, updated_at = EXCLUDED.updated_at
       RETURNING id`,
      [trip.name, trip.shortName, trip.kind, trip.startsOn, trip.endsOn, trip.dateLabel, trip.mondayKey, trip.boardName, now],
    );
    groupIds.set(trip.mondayKey, rows[0].id);
  }
  await removeTripsExcept(tx, boardId, [...groupIds.keys()], now);

  let created = 0;
  const kept: string[] = [];
  for (const member of members) {
    const groupId = groupIds.get(member.tripKey);
    if (!groupId) continue;
    const customer = await customerFor(tx, member);
    if (customer.created) created += 1;
    await tx.query(
      `INSERT INTO group_members (group_id, customer_id, note, added_at, monday_item_id, monday_status, monday_passport, event_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (monday_item_id) WHERE monday_item_id IS NOT NULL DO UPDATE SET
         group_id = EXCLUDED.group_id, customer_id = EXCLUDED.customer_id, note = EXCLUDED.note, added_at = EXCLUDED.added_at,
         monday_status = EXCLUDED.monday_status, monday_passport = EXCLUDED.monday_passport, event_on = EXCLUDED.event_on`,
      [groupId, customer.id, member.note, member.createdAt, member.itemId, member.mondayStatus, member.mondayPassport, member.eventOn],
    );
    kept.push(member.itemId);
  }
  const [boardKey, monthPattern] = tripKeysOf(boardId);
  await tx.query(
    `DELETE FROM group_members m USING groups g
     WHERE m.group_id = g.id AND (g.monday_key = $1 OR g.monday_key LIKE $2)
       AND m.monday_item_id IS NOT NULL AND m.monday_item_id <> ALL($3::text[])`,
    [boardKey, monthPattern, kept],
  );
  return created;
}

/**
 * After a copy: customers the copy made take their lead's source (by phone), and the ones
 * Monday no longer has, with nothing of their own in the dashboard, are removed.
 */
export async function tidyCustomers(tx: Queryable): Promise<void> {
  await tx.query(
    `UPDATE customers c SET source = COALESCE(
       (SELECT l.source FROM leads l WHERE l.phone = c.phone AND l.removed_at IS NULL ORDER BY l.created_at DESC LIMIT 1),
       'monday')
     WHERE c.from_monday`,
  );
  await tx.query(
    `DELETE FROM customers c
     WHERE c.from_monday
       AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.customer_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM passports p WHERE p.customer_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM customer_notes n WHERE n.customer_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM messages x WHERE x.customer_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM passport_intakes i WHERE i.customer_id = c.id)`,
  );
}

// ---- What the Import page shows ----

export interface CopyTotals {
  /** Rows on the boards the copy reads. */
  itemsFound: number;
  /** Leads from the live CRM board (every status). */
  leads: number;
  archivedLeads: number;
  /** CRM rows without a phone: Instagram chats that never left a number. */
  withoutPhone: number;
  customers: number;
  /** Trips and challah months. */
  groups: number;
  /** Monday rows of a customer already counted (the same phone and name on another row). */
  duplicatesMerged: number;
  notes: number;
}

export async function copyTotals(db: Queryable): Promise<CopyTotals> {
  const { rows } = await db.query<Record<keyof CopyTotals, string | number>>(
    `SELECT
       (SELECT COALESCE(sum(items), 0) FROM monday_boards WHERE removed_at IS NULL) AS "itemsFound",
       (SELECT count(*) FROM leads WHERE removed_at IS NULL AND NOT archived) AS leads,
       (SELECT count(*) FROM leads WHERE removed_at IS NULL AND archived) AS "archivedLeads",
       (SELECT COALESCE(sum(items), 0) FROM monday_boards WHERE removed_at IS NULL AND kind IN ('crm', 'crm-archive'))
         - (SELECT count(*) FROM leads WHERE removed_at IS NULL) AS "withoutPhone",
       (SELECT count(*) FROM customers) AS customers,
       (SELECT count(*) FROM groups WHERE monday_key IS NOT NULL AND removed_at IS NULL) AS groups,
       (SELECT count(*) - count(DISTINCT customer_id) FROM group_members WHERE monday_item_id IS NOT NULL) AS "duplicatesMerged",
       (SELECT count(*) FROM monday_notes) AS notes`,
  );
  const totals = rows[0];
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.max(0, Number(value))])) as unknown as CopyTotals;
}
