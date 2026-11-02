import type { Queryable } from "../../config/pg.js";
import { addDays, israelDay, weekdayOf } from "../../lib/israel-time.js";
import type { LeadSource, Service } from "../monday-copy/monday-copy.mapping.js";
import type { IntakeResult } from "./customers.service.js";

/** The overview screen: key numbers and what happened lately. */

export interface WeeklyCount {
  /** The Sunday the week starts on (Israeli weeks). */
  weekStart: string;
  count: number;
}

export interface OverviewStatsDto {
  openLeads: number;
  customers: number;
  /** Trips and events not over yet, and undated trips. */
  activeGroups: number;
  newLeadsThisWeek: number;
  newLeadsLastWeek: number;
  thisWeekByStatus: { new: number; talking: number; registered: number };
  /** Oldest first, ending with this week. */
  weeklyLeads: WeeklyCount[];
}

const WEEKS_SHOWN = 8;
/** Leads come from the live CRM board; days are Israel days. */
const LEAD_DAY = "(l.created_at AT TIME ZONE 'Asia/Jerusalem')::date";

export async function overviewStats(db: Queryable, now: Date): Promise<OverviewStatsDto> {
  const today = israelDay(now);
  const thisWeek = addDays(today, -weekdayOf(today));
  const firstWeek = addDays(thisWeek, -7 * (WEEKS_SHOWN - 1));

  const weekly = await db.query<{ week: string; n: number }>(
    `SELECT to_char(${LEAD_DAY} - (EXTRACT(DOW FROM ${LEAD_DAY})::int), 'YYYY-MM-DD') AS week, count(*)::int AS n
     FROM leads l WHERE l.removed_at IS NULL AND NOT l.archived AND ${LEAD_DAY} >= $1::date
     GROUP BY 1`,
    [firstWeek],
  );
  const byWeek = new Map(weekly.rows.map((row) => [row.week, row.n]));
  const weeklyLeads = Array.from({ length: WEEKS_SHOWN }, (_, index) => {
    const weekStart = addDays(firstWeek, 7 * index);
    return { weekStart, count: byWeek.get(weekStart) ?? 0 };
  });

  const thisWeekStatus = await db.query<{ status: string; n: number }>(
    `SELECT l.status, count(*)::int AS n FROM leads l
     WHERE l.removed_at IS NULL AND NOT l.archived AND ${LEAD_DAY} >= $1::date GROUP BY l.status`,
    [thisWeek],
  );
  const status = (name: string) => thisWeekStatus.rows.find((row) => row.status === name)?.n ?? 0;

  const totals = await db.query<{ open_leads: number; customers: number; active_groups: number }>(
    `SELECT
       (SELECT count(*)::int FROM leads WHERE removed_at IS NULL AND NOT archived AND status <> 'not-relevant') AS open_leads,
       (SELECT count(*)::int FROM customers) AS customers,
       (SELECT count(*)::int FROM groups WHERE removed_at IS NULL
          AND (COALESCE(ends_on, starts_on) IS NULL OR COALESCE(ends_on, starts_on) >= $1::date)) AS active_groups`,
    [today],
  );
  const { open_leads: openLeads, customers, active_groups: activeGroups } = totals.rows[0];

  return {
    openLeads,
    customers,
    activeGroups,
    newLeadsThisWeek: weeklyLeads[WEEKS_SHOWN - 1].count,
    newLeadsLastWeek: weeklyLeads[WEEKS_SHOWN - 2].count,
    thisWeekByStatus: { new: status("new"), talking: status("talking"), registered: status("registered") },
    weeklyLeads,
  };
}

/** One line of the activity feed. The dashboard words each kind in Hebrew or English. */
export type ActivityDto = { id: string; at: string } & (
  | { kind: "lead"; name: string; source: LeadSource; service: Service | null }
  | { kind: "registration"; name: string; group: string }
  | { kind: "passport"; name: string; result: IntakeResult }
  | { kind: "import"; leads: number; customers: number }
);

const ACTIVITY_DAYS = 14;
const ACTIVITY_SHOWN = 20;

/** New leads, people joining a trip or event, passports and the latest copy, from the last two weeks, newest first. */
export async function recentActivity(db: Queryable, now: Date): Promise<ActivityDto[]> {
  const since = new Date(now.getTime() - ACTIVITY_DAYS * 86_400_000);
  const items: ActivityDto[] = [];

  const leads = await db.query<{ id: string; created_at: Date; name: string; source: LeadSource; service: Service | null }>(
    `SELECT id, created_at, name, source, service FROM leads
     WHERE removed_at IS NULL AND NOT archived AND created_at >= $1 AND created_at <= $2
     ORDER BY created_at DESC LIMIT ${ACTIVITY_SHOWN}`,
    [since, now],
  );
  for (const lead of leads.rows) {
    items.push({ id: `lead-${lead.id}`, at: lead.created_at.toISOString(), kind: "lead", name: lead.name, source: lead.source, service: lead.service });
  }

  const joined = await db.query<{ group_id: string; customer_id: string; added_at: Date; name: string; group_name: string }>(
    `SELECT m.group_id, m.customer_id, m.added_at, c.first_name || ' ' || c.last_name AS name, COALESCE(g.short_name, g.name) AS group_name
     FROM group_members m JOIN customers c ON c.id = m.customer_id JOIN groups g ON g.id = m.group_id
     WHERE g.removed_at IS NULL AND m.added_at >= $1 AND m.added_at <= $2
     ORDER BY m.added_at DESC LIMIT ${ACTIVITY_SHOWN}`,
    [since, now],
  );
  for (const row of joined.rows) {
    items.push({ id: `joined-${row.group_id}-${row.customer_id}`, at: row.added_at.toISOString(), kind: "registration", name: row.name.trim(), group: row.group_name });
  }

  const passports = await db.query<{ id: string; received_at: Date; status: string; name: string | null }>(
    `SELECT i.id, i.received_at, i.status, COALESCE(c.first_name || ' ' || c.last_name, i.sender_name) AS name
     FROM passport_intakes i LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.received_at >= $1 AND i.received_at <= $2 AND i.status IN ('matched', 'new-card', 'needs-review')
     ORDER BY i.received_at DESC LIMIT ${ACTIVITY_SHOWN}`,
    [since, now],
  );
  for (const row of passports.rows) {
    items.push({ id: `passport-${row.id}`, at: row.received_at.toISOString(), kind: "passport", name: (row.name ?? "").trim(), result: row.status as IntakeResult });
  }

  const copy = await db.query<{ id: string; finished_at: Date; totals: { leads?: number; customers?: number } }>(
    `SELECT id, finished_at, totals FROM monday_copy_runs
     WHERE status = 'completed' AND finished_at >= $1 AND finished_at <= $2 ORDER BY finished_at DESC LIMIT 1`,
    [since, now],
  );
  for (const row of copy.rows) {
    items.push({ id: `import-${row.id}`, at: row.finished_at.toISOString(), kind: "import", leads: row.totals.leads ?? 0, customers: row.totals.customers ?? 0 });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, ACTIVITY_SHOWN);
}
