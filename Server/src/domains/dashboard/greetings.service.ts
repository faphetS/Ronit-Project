import type { Queryable } from "../../config/pg.js";
import { ValidationError } from "../../lib/errors.js";
import { addDays, birthdayIn, birthdaySlot, israelDay, weekdayOf, type ShabbatRule } from "../../lib/israel-time.js";
import type { DeliveryStatus } from "./customers.service.js";

/**
 * Holiday greetings and birthdays, read from the automations' tables. Nothing drafts a holiday
 * greeting yet, so `currentCampaign` is null until the greetings step adds that.
 */

export type CampaignStatus = "draft" | "awaiting-approval" | "scheduled" | "sending" | "completed";
export type CampaignStage = "write" | "review" | "approve" | "track";

export interface CampaignDto {
  id: string;
  holiday: string;
  hebrewYear: number;
  stage: CampaignStage;
  status: CampaignStatus;
  eve: string;
  sendAt: string;
  message: string;
  audienceId: string;
  recipients: number;
  rate: { messages: number; everyMinutes: number };
  estimatedMinutes: number;
  preview: null;
  savedAt: string;
  savedByUserId: string;
  approvedAt: string | null;
  approvedByUserId: string | null;
  lastTest: null;
  stats: { sent: number; delivered: number; read: number; failed: number } | null;
}

export interface AudienceOptionDto {
  /** "all", or a trip's id. */
  id: string;
  kind: "all" | "groups";
  name: string | null;
  shortName: string | null;
  groupIds: string[];
  recipients: number;
}

const STAGE: Record<CampaignStatus, CampaignStage> = {
  draft: "write",
  "awaiting-approval": "approve",
  scheduled: "track",
  sending: "track",
  completed: "track",
};

interface CampaignRow {
  id: string;
  holiday: string;
  hebrew_year: number;
  eve: string;
  send_at: Date;
  message: string;
  audience_kind: "all" | "groups";
  audience_group_ids: string[];
  rate_messages: number;
  rate_every_minutes: number;
  status: CampaignStatus;
  approved_at: Date | null;
  approved_by: string | null;
  updated_at: Date;
  recipients: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

const CAMPAIGN_SELECT = `
  SELECT c.id, c.holiday, c.hebrew_year, c.eve, c.send_at, c.message, c.audience_kind, c.audience_group_ids::text[] AS audience_group_ids,
    c.rate_messages, c.rate_every_minutes, c.status, c.approved_at, c.approved_by, c.updated_at,
    CASE WHEN c.audience_kind = 'all' THEN (SELECT count(*)::int FROM customers WHERE NOT greetings_opt_out)
         ELSE (SELECT count(DISTINCT m.customer_id)::int FROM group_members m JOIN customers x ON x.id = m.customer_id
               WHERE m.group_id = ANY(c.audience_group_ids) AND NOT x.greetings_opt_out) END AS recipients,
    (SELECT count(*)::int FROM messages m WHERE m.campaign_id = c.id AND m.status IN ('sent', 'delivered', 'read')) AS sent,
    (SELECT count(*)::int FROM messages m WHERE m.campaign_id = c.id AND m.status IN ('delivered', 'read')) AS delivered,
    (SELECT count(*)::int FROM messages m WHERE m.campaign_id = c.id AND m.status = 'read') AS read,
    (SELECT count(*)::int FROM messages m WHERE m.campaign_id = c.id AND m.status = 'failed') AS failed
  FROM campaigns c`;

function toCampaign(row: CampaignRow): CampaignDto {
  const rate = { messages: row.rate_messages, everyMinutes: row.rate_every_minutes };
  const started = row.status === "sending" || row.status === "completed";
  return {
    id: row.id,
    holiday: row.holiday,
    hebrewYear: row.hebrew_year,
    stage: STAGE[row.status],
    status: row.status,
    eve: row.eve,
    sendAt: row.send_at.toISOString(),
    message: row.message,
    audienceId: row.audience_kind === "all" ? "all" : (row.audience_group_ids[0] ?? "all"),
    recipients: row.recipients,
    rate,
    estimatedMinutes: Math.ceil(row.recipients / rate.messages) * rate.everyMinutes,
    preview: null,
    savedAt: row.updated_at.toISOString(),
    savedByUserId: "",
    approvedAt: row.approved_at?.toISOString() ?? null,
    approvedByUserId: row.approved_by,
    lastTest: null,
    stats: started ? { sent: row.sent, delivered: row.delivered, read: row.read, failed: row.failed } : null,
  };
}

/** The next greeting that hasn't finished going out, or null. */
export async function currentCampaign(db: Queryable): Promise<CampaignDto | null> {
  const { rows } = await db.query<CampaignRow>(`${CAMPAIGN_SELECT} WHERE c.status <> 'completed' ORDER BY c.send_at LIMIT 1`);
  return rows[0] ? toCampaign(rows[0]) : null;
}

/** Every greeting, newest first. */
export async function campaignHistory(db: Queryable): Promise<CampaignDto[]> {
  const { rows } = await db.query<CampaignRow>(`${CAMPAIGN_SELECT} ORDER BY c.send_at DESC LIMIT 100`);
  return rows.map(toCampaign);
}

/** Who a greeting can go to: every customer, or the people on one trip or event that isn't over. */
export async function audiences(db: Queryable, now: Date): Promise<AudienceOptionDto[]> {
  const all = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM customers WHERE NOT greetings_opt_out");
  const groups = await db.query<{ id: string; name: string; short_name: string | null; n: number }>(
    `SELECT g.id, g.name, g.short_name,
       (SELECT count(*)::int FROM group_members m JOIN customers c ON c.id = m.customer_id WHERE m.group_id = g.id AND NOT c.greetings_opt_out) AS n
     FROM groups g
     WHERE g.removed_at IS NULL AND (COALESCE(g.ends_on, g.starts_on) IS NULL OR COALESCE(g.ends_on, g.starts_on) >= $1::date)
     ORDER BY g.starts_on NULLS FIRST, g.name`,
    [israelDay(now)],
  );
  return [
    { id: "all", kind: "all", name: null, shortName: null, groupIds: [], recipients: all.rows[0].n },
    ...groups.rows.map((group) => ({
      id: group.id,
      kind: "groups" as const,
      name: group.name,
      shortName: group.short_name ?? group.name,
      groupIds: [group.id],
      recipients: group.n,
    })),
  ];
}

// ---- Birthdays ----

export interface BirthdaySettingsDto {
  enabled: boolean;
  sendTime: string;
  channel: "whatsapp";
  birthDateSource: "passport";
  shabbatRule: ShabbatRule;
  template: string;
  templateUpdatedAt: string;
}

export interface BirthdaySettingsPatch {
  enabled?: boolean;
  sendTime?: string;
  shabbatRule?: ShabbatRule;
  template?: string;
}

export async function birthdaySettings(db: Queryable): Promise<BirthdaySettingsDto> {
  const { rows } = await db.query<{ enabled: boolean; send_time: string; shabbat_rule: ShabbatRule; template: string; updated_at: Date }>(
    "SELECT enabled, to_char(send_time, 'HH24:MI') AS send_time, shabbat_rule, template, updated_at FROM birthday_settings",
  );
  const row = rows[0];
  return {
    enabled: row.enabled,
    sendTime: row.send_time,
    channel: "whatsapp",
    birthDateSource: "passport",
    shabbatRule: row.shabbat_rule,
    template: row.template,
    templateUpdatedAt: row.updated_at.toISOString(),
  };
}

export async function updateBirthdaySettings(db: Queryable, patch: BirthdaySettingsPatch, now: Date): Promise<BirthdaySettingsDto> {
  if (patch.template !== undefined && !patch.template.trim()) throw new ValidationError("The birthday greeting needs some text");
  await db.query(
    `UPDATE birthday_settings SET
       enabled = COALESCE($1, enabled),
       send_time = COALESCE($2::time, send_time),
       shabbat_rule = COALESCE($3, shabbat_rule),
       template = COALESCE($4, template),
       updated_at = $5`,
    [patch.enabled ?? null, patch.sendTime ?? null, patch.shabbatRule ?? null, patch.template ?? null, now],
  );
  return birthdaySettings(db);
}

export interface BirthdayEntryDto {
  customerId: string;
  firstName: string;
  lastName: string;
  day: string;
  age: number;
  sendAt: string;
  onShabbat: boolean;
  status: DeliveryStatus;
  failure: string | null;
}

export interface BirthdaysOverviewDto {
  today: BirthdayEntryDto[];
  upcoming: BirthdayEntryDto[];
  recent: BirthdayEntryDto[];
  sentThisYear: number;
}

const UPCOMING_DAYS = 7;
const RECENT_SENDS = 5;
const WENT_OUT: Record<string, DeliveryStatus> = { sent: "sent", delivered: "delivered", read: "read", failed: "failed" };

/** Birthdays come from passports (the birth date on file): today, the next week, and recent sends. */
export async function birthdaysOverview(db: Queryable, now: Date): Promise<BirthdaysOverviewDto> {
  const settings = await birthdaySettings(db);
  const today = israelDay(now);
  const people = await db.query<{ id: string; first_name: string; last_name: string; birth_date: string }>(
    `SELECT c.id, c.first_name, c.last_name, p.birth_date FROM customers c JOIN passports p ON p.customer_id = c.id
     WHERE p.birth_date IS NOT NULL AND NOT c.greetings_opt_out`,
  );
  const sends = await db.query<{ customer_id: string; send_at: Date; sent_at: Date | null; status: string; failure: string | null }>(
    "SELECT customer_id, send_at, sent_at, status, failure FROM messages WHERE kind = 'birthday' AND customer_id IS NOT NULL ORDER BY send_at DESC LIMIT 500",
  );

  const entry = (person: (typeof people.rows)[number], day: string): BirthdayEntryDto => {
    const slot = birthdaySlot(day, settings);
    // The greeting for that birthday: due that day, or on the Friday before.
    const send = sends.rows.find((m) => m.customer_id === person.id && [day, addDays(day, -1)].includes(israelDay(m.send_at)));
    return {
      customerId: person.id,
      firstName: person.first_name,
      lastName: person.last_name,
      day,
      age: Number(day.slice(0, 4)) - Number(person.birth_date.slice(0, 4)),
      sendAt: (send?.sent_at ?? send?.send_at ?? slot).toISOString(),
      onShabbat: weekdayOf(day) === 6,
      status: send ? (WENT_OUT[send.status] ?? "scheduled") : settings.enabled ? "scheduled" : "paused",
      failure: send?.failure === "invalid-number" || send?.failure === "blocked" ? send.failure : null,
    };
  };
  const on = (day: string) =>
    people.rows.filter((person) => birthdayIn(Number(day.slice(0, 4)), person.birth_date) === day).map((person) => entry(person, day));

  const wentOut = sends.rows.filter((m) => m.status in WENT_OUT && (m.sent_at ?? m.send_at) <= now);
  const recent: BirthdayEntryDto[] = [];
  for (const send of wentOut) {
    if (recent.length === RECENT_SENDS) break;
    const person = people.rows.find((p) => p.id === send.customer_id);
    if (person) recent.push(entry(person, birthdayIn(Number(israelDay(send.send_at).slice(0, 4)), person.birth_date)));
  }
  return {
    today: on(today),
    upcoming: Array.from({ length: UPCOMING_DAYS }, (_, index) => addDays(today, index + 1)).flatMap(on),
    recent,
    sentThisYear: wentOut.filter((m) => m.status !== "failed" && israelDay(m.sent_at ?? m.send_at).slice(0, 4) === today.slice(0, 4)).length,
  };
}
