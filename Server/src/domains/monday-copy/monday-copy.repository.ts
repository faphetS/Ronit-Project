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
    removed_at: Date | null;
  }>("SELECT id, name, kind, items, copied_at, notes_through, removed_at FROM monday_boards");
  return new Map(
    rows.map((row) => [
      row.id,
      { id: row.id, name: row.name, kind: row.kind, items: row.items, copiedAt: row.copied_at, notesThrough: row.notes_through, removedAt: row.removed_at },
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
}

export async function saveBoard(tx: Queryable, update: BoardUpdate, now: Date): Promise<void> {
  const { info, kind, read } = update;
  await tx.query(
    `INSERT INTO monday_boards (id, name, kind, items, groups, monday_updated_at, copied_at, notes_through, removed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       kind = EXCLUDED.kind,
       items = EXCLUDED.items,
       groups = CASE WHEN $9 THEN EXCLUDED.groups ELSE monday_boards.groups END,
       monday_updated_at = EXCLUDED.monday_updated_at,
       copied_at = COALESCE(EXCLUDED.copied_at, monday_boards.copied_at),
       notes_through = COALESCE(EXCLUDED.notes_through, monday_boards.notes_through),
       removed_at = NULL`,
    [info.id, info.name, kind, read?.rows ?? info.items, read?.groups ?? 0, info.updatedAt, read ? now : null, update.notesThrough, read !== null],
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

export async function saveNotes(tx: Queryable, boardId: string, notes: MondayNote[]): Promise<void> {
  if (notes.length === 0) return;
  await tx.query(
    `INSERT INTO monday_notes (id, monday_item_id, board_id, at, author, body)
     SELECT r.id, r.item_id, $2, r.at, r.author, r.body
     FROM jsonb_to_recordset($1::jsonb) AS r(id text, item_id text, at timestamptz, author text, body text)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(notes.map((note) => ({ id: note.id, item_id: note.itemId, at: note.at, author: note.author, body: note.body }))), boardId],
  );
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

/**
 * The customer a Monday row belongs to: the same phone is the same customer; a row without a
 * phone is its own customer. Customers the copy created take the newest row's name.
 */
async function customerFor(tx: Queryable, member: MemberRecord): Promise<{ id: string; created: boolean }> {
  const { firstName, lastName } = splitName(member.name);
  let found: { id: string } | undefined;
  if (member.phone) {
    found = (await tx.query<{ id: string }>("SELECT id FROM customers WHERE phone = $1 ORDER BY created_at, id LIMIT 1", [member.phone])).rows[0];
    if (!found) {
      // A row that had no phone before: its customer gets the phone now.
      found = (
        await tx.query<{ id: string }>("UPDATE customers SET phone = $2, monday_item_id = NULL WHERE monday_item_id = $1 RETURNING id", [
          member.itemId,
          member.phone,
        ])
      ).rows[0];
    }
  } else {
    found = (await tx.query<{ id: string }>("SELECT id FROM customers WHERE monday_item_id = $1", [member.itemId])).rows[0];
  }

  if (found) {
    await tx.query(
      `UPDATE customers SET
         first_name = CASE WHEN $4 >= updated_at THEN $2 ELSE first_name END,
         last_name = CASE WHEN $4 >= updated_at THEN $3 ELSE last_name END,
         updated_at = GREATEST(updated_at, $4),
         created_at = LEAST(created_at, $5)
       WHERE id = $1 AND from_monday`,
      [found.id, firstName, lastName, member.updatedAt, member.createdAt],
    );
    return { id: found.id, created: false };
  }

  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO customers (first_name, last_name, phone, source, monday_item_id, from_monday, created_at, updated_at)
     VALUES ($1, $2, $3, 'monday', $4, true, $5, $6) RETURNING id`,
    [firstName, lastName, member.phone, member.phone ? null : member.itemId, member.createdAt, member.updatedAt],
  );
  return { id: rows[0].id, created: true };
}

interface Membership {
  groupId: string;
  customerId: string;
  itemId: string;
  addedAt: string;
  updatedAt: string;
  notes: string[];
  mondayStatus: string | null;
  mondayPassport: string | null;
  eventOn: string | null;
}

/** Upserts a trip board's trips and their people, and removes what's gone from the board. Returns customers created. */
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

  // The same person twice on one trip (a duplicate row, two bookings in a month) is one membership.
  let created = 0;
  const memberships = new Map<string, Membership>();
  for (const member of members) {
    const groupId = groupIds.get(member.tripKey);
    if (!groupId) continue;
    const customer = await customerFor(tx, member);
    if (customer.created) created += 1;
    const key = `${groupId}:${customer.id}`;
    const seen = memberships.get(key);
    if (!seen) {
      memberships.set(key, {
        groupId,
        customerId: customer.id,
        itemId: member.itemId,
        addedAt: member.createdAt,
        updatedAt: member.updatedAt,
        notes: member.note ? [member.note] : [],
        mondayStatus: member.mondayStatus,
        mondayPassport: member.mondayPassport,
        eventOn: member.eventOn,
      });
      continue;
    }
    if (member.note && !seen.notes.includes(member.note)) seen.notes.push(member.note);
    if (member.createdAt < seen.addedAt) seen.addedAt = member.createdAt;
    if (member.eventOn && (!seen.eventOn || member.eventOn < seen.eventOn)) seen.eventOn = member.eventOn;
    if (member.updatedAt > seen.updatedAt) {
      seen.updatedAt = member.updatedAt;
      seen.mondayStatus = member.mondayStatus ?? seen.mondayStatus;
      seen.mondayPassport = member.mondayPassport ?? seen.mondayPassport;
    }
  }

  for (const m of memberships.values()) {
    await tx.query(
      `INSERT INTO group_members (group_id, customer_id, note, added_at, monday_item_id, monday_status, monday_passport, event_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (group_id, customer_id) DO UPDATE SET
         note = EXCLUDED.note, added_at = EXCLUDED.added_at, monday_item_id = EXCLUDED.monday_item_id,
         monday_status = EXCLUDED.monday_status, monday_passport = EXCLUDED.monday_passport, event_on = EXCLUDED.event_on`,
      [m.groupId, m.customerId, m.notes.join(" · ") || null, m.addedAt, m.itemId, m.mondayStatus, m.mondayPassport, m.eventOn],
    );
  }
  for (const groupId of groupIds.values()) {
    const keep = [...memberships.values()].filter((m) => m.groupId === groupId).map((m) => m.customerId);
    await tx.query("DELETE FROM group_members WHERE group_id = $1 AND customer_id <> ALL($2::uuid[])", [groupId, keep]);
  }
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
  /** Monday rows that joined a customer already counted (the same phone on another row). */
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
