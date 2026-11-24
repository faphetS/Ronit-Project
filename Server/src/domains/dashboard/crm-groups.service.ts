import type { Db, Queryable } from "../../config/pg.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { splitName } from "../monday-copy/monday-copy.mapping.js";
import { applyStatusChange } from "./lead-status.service.js";

/**
 * Groups made in the CRM (a flight, an event or a project), and leads joining them.
 * Monday's groups (with a monday_key) are read-only here. Spec: 2026-11-24-lead-notes-and-crm-groups-design.md
 */

export interface NewGroup {
  name: string;
  type: "flight" | "event" | "project";
  startsOn?: string | null;
  endsOn?: string | null;
  capacity?: number | null;
}

export async function createGroup(db: Queryable, input: NewGroup, now: Date): Promise<string> {
  const name = input.name.trim();
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO groups (name, short_name, kind, starts_on, ends_on, capacity, monday_key, created_at, updated_at)
     VALUES ($1, $1, $2, $3, $4, $5, NULL, $6, $6) RETURNING id`,
    [name, input.type, input.startsOn ?? null, input.endsOn ?? null, input.capacity ?? null, now],
  );
  return rows[0].id;
}

/** The group, if it's active and made in the CRM. */
async function crmGroup(db: Queryable, id: string): Promise<{ starts_on: string | null; ends_on: string | null }> {
  const { rows } = await db.query<{ monday_key: string | null; starts_on: string | null; ends_on: string | null }>(
    "SELECT monday_key, starts_on, ends_on FROM groups WHERE id = $1 AND removed_at IS NULL",
    [id],
  );
  if (!rows[0]) throw new NotFoundError("Group");
  if (rows[0].monday_key !== null) throw new AppError(409, "This group comes from Monday", "MONDAY_GROUP");
  return rows[0];
}

/** A date or capacity given as null is cleared; one left out is kept. The type never changes. */
export async function updateGroup(db: Queryable, id: string, patch: Partial<NewGroup>, now: Date): Promise<void> {
  const current = await crmGroup(db, id);
  const startsOn = patch.startsOn !== undefined ? patch.startsOn : current.starts_on;
  const endsOn = patch.endsOn !== undefined ? patch.endsOn : current.ends_on;
  if (startsOn && endsOn && endsOn < startsOn) throw new AppError(400, "The end is before the start", "VALIDATION_ERROR");
  const name = patch.name === undefined ? null : patch.name.trim();
  await db.query(
    `UPDATE groups SET name = coalesce($2, name), short_name = coalesce($2, short_name), starts_on = $3, ends_on = $4,
       capacity = CASE WHEN $5::boolean THEN $6::integer ELSE capacity END, updated_at = $7
     WHERE id = $1`,
    [id, name, startsOn, endsOn, patch.capacity !== undefined, patch.capacity ?? null, now],
  );
}

export async function removeGroup(db: Queryable, id: string, now: Date): Promise<void> {
  await crmGroup(db, id);
  await db.query("UPDATE groups SET removed_at = $2, updated_at = $2 WHERE id = $1", [id, now]);
}

/** "שרה  כהן " and "שרה כהן" are the same name (the copy's rule). */
const SAME_NAME = "regexp_replace(btrim(first_name || ' ' || last_name), '\\s+', ' ', 'g')";

/**
 * Puts a lead in a group, in one transaction: the customer card (the lead's own, else the newest with the same phone and name,
 * else a new one), the membership, the link on the lead, the "registered" status and the audit row.
 * statusChanged tells the route whether Monday's label needs a push.
 */
export async function joinGroup(
  db: Db,
  crmBoardId: string,
  groupId: string,
  leadId: string,
  byUserId: string,
  now: Date,
): Promise<{ customerId: string; alreadyMember: boolean; statusChanged: boolean }> {
  return db.transaction(async (tx) => {
    const group = await tx.query("SELECT 1 FROM groups WHERE id = $1 AND removed_at IS NULL", [groupId]);
    if (!group.rows[0]) throw new NotFoundError("Group");
    const found = await tx.query<{ name: string; phone: string; source: string; customer_id: string | null }>(
      "SELECT name, phone, source, customer_id FROM leads WHERE id = $1 AND removed_at IS NULL FOR UPDATE",
      [leadId],
    );
    const lead = found.rows[0];
    if (!lead) throw new NotFoundError("Lead");

    let customerId = lead.customer_id;
    if (customerId) {
      const kept = await tx.query("SELECT 1 FROM customers WHERE id = $1", [customerId]);
      if (!kept.rows[0]) customerId = null;
    }
    if (!customerId && lead.phone) {
      const { firstName, lastName } = splitName(lead.name);
      const same = await tx.query<{ id: string }>(
        `SELECT id FROM customers WHERE phone = $1 AND ${SAME_NAME} = $2 ORDER BY created_at DESC, id LIMIT 1`,
        [lead.phone, [firstName, lastName].filter(Boolean).join(" ")],
      );
      customerId = same.rows[0]?.id ?? null;
    }
    if (!customerId) {
      const split = splitName(lead.name);
      const firstName = split.firstName || lead.name || lead.phone || "";
      const lastName = split.lastName;
      const made = await tx.query<{ id: string }>(
        `INSERT INTO customers (first_name, last_name, phone, source, from_monday, created_at, updated_at)
         VALUES ($1, $2, $3, $4, false, $5, $5) RETURNING id`,
        [firstName, lastName, lead.phone || null, lead.source, now],
      );
      customerId = made.rows[0].id;
    }

    const inserted = await tx.query(
      "INSERT INTO group_members (group_id, customer_id, added_at) VALUES ($1, $2, $3) ON CONFLICT (group_id, customer_id) WHERE monday_item_id IS NULL DO NOTHING RETURNING id",
      [groupId, customerId, now],
    );
    const alreadyMember = inserted.rows.length === 0;
    await tx.query("UPDATE leads SET customer_id = $2 WHERE id = $1", [leadId, customerId]);
    const status = await applyStatusChange(tx, crmBoardId, { leadId, status: "registered", byUserId }, now);
    await tx.query("INSERT INTO audit_log (at, by_user_id, action, customer_id, details) VALUES ($1, $2, 'lead-joined-group', $3, $4::text::jsonb)", [
      now,
      byUserId,
      customerId,
      JSON.stringify({ leadId, groupId }),
    ]);
    return { customerId, alreadyMember, statusChanged: status === "changed" };
  });
}

export async function removeMember(db: Queryable, groupId: string, memberId: string): Promise<void> {
  const { rows } = await db.query<{ monday_item_id: string | null }>("SELECT monday_item_id FROM group_members WHERE id = $1 AND group_id = $2", [memberId, groupId]);
  if (!rows[0]) throw new NotFoundError("Member");
  if (rows[0].monday_item_id !== null) throw new AppError(409, "This participant comes from Monday", "MONDAY_MEMBER");
  await db.query("DELETE FROM group_members WHERE id = $1", [memberId]);
}
