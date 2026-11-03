import { logger } from "../../config/logger.js";
import type { Db, Queryable } from "../../config/pg.js";
import { AppError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { holidaySendAt, upcomingHolidays, type HolidayKey } from "../../lib/hebrew-holidays.js";
import { addDays, birthdayIn, birthdaySlot, israelDay, weekdayOf, type ShabbatRule } from "../../lib/israel-time.js";
import type { SignedInDto } from "../auth/auth.service.js";
import { MESSAGE_TOKENS, type MessageToken } from "../greetings/greetings.tokens.js";
import { discardTemplate, submitTemplate, TEMPLATE_EXAMPLES, templateParams, templateProblem } from "../greetings/whatsapp-templates.js";
import { ZernioError, type TemplateStatus, type ZernioClient } from "../greetings/zernio.client.js";
import type { DeliveryStatus } from "./customers.service.js";

/**
 * Holiday greetings and birthdays on the dashboard. A holiday greeting is written, sent to
 * WhatsApp for review (Meta approves every template), tested and approved by Ronit, then goes
 * out on the eve. The birthday text goes for review when it's saved; the approved one keeps
 * going out meanwhile. Spec: docs/superpowers/specs/2026-11-03-greetings-zernio-design.md
 */

export type CampaignStatus = "draft" | "in-review" | "awaiting-approval" | "scheduled" | "sending" | "completed";
export type CampaignStage = "write" | "review" | "approve" | "track";

/** Meta's verdict on the text, and its reason when it refused. */
export interface TemplateReviewDto {
  status: TemplateStatus;
  reason: string | null;
}

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
  preview: { customerId: string; firstName: string; lastName: string; groupName: string | null } | null;
  savedAt: string;
  savedByUserId: string;
  approvedAt: string | null;
  approvedByUserId: string | null;
  lastTest: { at: string; toUserId: string } | null;
  /** The text's WhatsApp template, once it went for review. */
  template: TemplateReviewDto | null;
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
  "in-review": "review",
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
  saved_by: string | null;
  last_test_at: Date | null;
  last_test_by: string | null;
  template_name: string | null;
  template_status: TemplateStatus | null;
  template_reason: string | null;
  recipients: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

const CAMPAIGN_SELECT = `
  SELECT c.id, c.holiday, c.hebrew_year, c.eve, c.send_at, c.message, c.audience_kind, c.audience_group_ids::text[] AS audience_group_ids,
    c.rate_messages, c.rate_every_minutes, c.status, c.approved_at, c.approved_by, c.updated_at, c.saved_by, c.last_test_at, c.last_test_by,
    c.template_name, t.status AS template_status, t.reason AS template_reason,
    CASE WHEN c.audience_kind = 'all' THEN (SELECT count(*)::int FROM customers WHERE phone IS NOT NULL AND NOT greetings_opt_out)
         ELSE (SELECT count(DISTINCT m.customer_id)::int FROM group_members m JOIN customers x ON x.id = m.customer_id
               WHERE m.group_id = ANY(c.audience_group_ids) AND x.phone IS NOT NULL AND NOT x.greetings_opt_out) END AS recipients,
    (SELECT count(*)::int FROM messages m WHERE m.campaign_id = c.id AND m.status IN ('sent', 'delivered', 'read')) AS sent,
    (SELECT count(*)::int FROM messages m WHERE m.campaign_id = c.id AND m.status IN ('delivered', 'read')) AS delivered,
    (SELECT count(*)::int FROM messages m WHERE m.campaign_id = c.id AND m.status = 'read') AS read,
    (SELECT count(*)::int FROM messages m WHERE m.campaign_id = c.id AND m.status = 'failed') AS failed
  FROM campaigns c LEFT JOIN whatsapp_templates t ON t.name = c.template_name`;

function toCampaign(row: CampaignRow, preview: CampaignDto["preview"] = null): CampaignDto {
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
    preview,
    savedAt: row.updated_at.toISOString(),
    savedByUserId: row.saved_by ?? "",
    approvedAt: row.approved_at?.toISOString() ?? null,
    approvedByUserId: row.approved_by,
    lastTest: row.last_test_at && row.last_test_by ? { at: row.last_test_at.toISOString(), toUserId: row.last_test_by } : null,
    template: row.template_name && row.template_status ? { status: row.template_status, reason: row.template_reason } : null,
    stats: started ? { sent: row.sent, delivered: row.delivered, read: row.read, failed: row.failed } : null,
  };
}

/** The first person the greeting goes to, as the preview shows it: in the order it's sent. */
async function previewFor(db: Queryable, row: CampaignRow): Promise<CampaignDto["preview"]> {
  const { rows } = await db.query<{ id: string; first_name: string; last_name: string; group_name: string | null }>(
    `SELECT c.id, c.first_name, c.last_name,
       (SELECT g.name FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE gm.customer_id = c.id AND ($1 = 'all' OR gm.group_id = ANY($2::uuid[]))
        ORDER BY g.starts_on DESC NULLS LAST LIMIT 1) AS group_name
     FROM customers c
     WHERE c.phone IS NOT NULL AND NOT c.greetings_opt_out AND c.first_name <> ''
       AND ($1 = 'all' OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.customer_id = c.id AND gm.group_id = ANY($2::uuid[])))
     ORDER BY c.created_at, c.id LIMIT 1`,
    [row.audience_kind, row.audience_group_ids],
  );
  const person = rows[0];
  return person ? { customerId: person.id, firstName: person.first_name, lastName: person.last_name, groupName: person.group_name } : null;
}

async function campaignRow(db: Queryable, id: string): Promise<CampaignRow> {
  const { rows } = await db.query<CampaignRow>(`${CAMPAIGN_SELECT} WHERE c.id = $1`, [id]);
  if (!rows[0]) throw new NotFoundError("Campaign");
  return rows[0];
}

/** The preview names a customer: only for people whose role shows customers. */
async function campaignWithPreview(db: Queryable, id: string, showsCustomers: boolean): Promise<CampaignDto> {
  const row = await campaignRow(db, id);
  return toCampaign(row, showsCustomers ? await previewFor(db, row) : null);
}

/** The next greeting that hasn't finished going out, or null. */
export async function currentCampaign(db: Queryable, showsCustomers: boolean): Promise<CampaignDto | null> {
  const { rows } = await db.query<CampaignRow>(`${CAMPAIGN_SELECT} WHERE c.status <> 'completed' ORDER BY c.send_at LIMIT 1`);
  if (!rows[0]) return null;
  return toCampaign(rows[0], showsCustomers ? await previewFor(db, rows[0]) : null);
}

/** Every greeting, newest first. */
export async function campaignHistory(db: Queryable): Promise<CampaignDto[]> {
  const { rows } = await db.query<CampaignRow>(`${CAMPAIGN_SELECT} ORDER BY c.send_at DESC LIMIT 100`);
  return rows.map((row) => toCampaign(row));
}

/** Who a greeting can go to: every customer, or the people on one trip or event that isn't over. */
export async function audiences(db: Queryable, now: Date): Promise<AudienceOptionDto[]> {
  const all = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM customers WHERE phone IS NOT NULL AND NOT greetings_opt_out");
  const groups = await db.query<{ id: string; name: string; short_name: string | null; n: number }>(
    `SELECT g.id, g.name, g.short_name,
       (SELECT count(DISTINCT m.customer_id)::int FROM group_members m JOIN customers c ON c.id = m.customer_id
        WHERE m.group_id = g.id AND c.phone IS NOT NULL AND NOT c.greetings_opt_out) AS n
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

// ---- Changing a holiday greeting ----

export interface GreetingsDeps {
  db: Db;
  /** Null while WhatsApp isn't connected (no Zernio key): greetings can be written, not sent for review. */
  zernio: ZernioClient | null;
  /** The templates' language as Meta knows it. */
  language: string;
  /** Whether a staff number may get WhatsApp messages (RONIT_WA_ALLOWED_NUMBERS). */
  isAllowed: (msisdn: string) => boolean;
  /** The signed-in person's role shows customers: the preview may name one. */
  showsCustomers: boolean;
  now: () => Date;
}

/** How the WhatsApp connection stands, for the screens. */
export interface WhatsAppStatusDto {
  /** Zernio is set up: greetings can go for review, and tests go out. */
  connected: boolean;
  /** Approved greetings actually go out (GREETINGS_ENABLED on the Zernio channel). */
  sending: boolean;
}

/** The placeholders a holiday greeting may hold: the trip's name only when it goes to one trip. */
function holidayTokens(audienceKind: "all" | "groups"): MessageToken[] {
  return audienceKind === "groups" ? ["firstName", "groupName"] : ["firstName"];
}

const BIRTHDAY_TOKENS: MessageToken[] = ["firstName", "age"];

function problemError(problem: string): AppError {
  return new AppError(400, `The greeting can't go to WhatsApp as it is: ${problem}`, problem.toUpperCase().replace(/-/g, "_"));
}

function whatsappOff(): AppError {
  return new AppError(503, "WhatsApp isn't connected on this server yet", "WHATSAPP_NOT_CONNECTED");
}

/** Zernio's answer stays in the server's log; the screen gets its code only. */
function whatsappFailed(err: unknown): AppError {
  logger.warn({ err }, "Zernio refused a greeting call");
  const code = err instanceof ZernioError ? err.code : "UNKNOWN";
  return new AppError(502, `WhatsApp didn't take it (${code})`, "WHATSAPP_ERROR");
}

/**
 * Each test is a real WhatsApp message from Ronit's number, and Meta charges for it: one per greeting
 * every 30 seconds, and ten a day per person.
 */
const TEST_COOLDOWN_MS = 30_000;
const TESTS_PER_DAY = 10;

async function recordCampaignAudit(db: Queryable, at: Date, action: string, byUserId: string, campaignId: string, details: Record<string, unknown> = {}) {
  await db.query("INSERT INTO audit_log (at, by_user_id, action, campaign_id, details) VALUES ($1, $2, $3, $4, $5::text::jsonb)", [
    at,
    byUserId,
    action,
    campaignId,
    JSON.stringify(details),
  ]);
}

/**
 * Starts the greeting for the next holiday that has none yet, as an empty draft for every
 * customer. One greeting is prepared at a time.
 */
export async function createCampaign(deps: GreetingsDeps, viewer: SignedInDto): Promise<CampaignDto> {
  const now = deps.now();
  const { rows: open } = await deps.db.query("SELECT 1 FROM campaigns WHERE status <> 'completed' LIMIT 1");
  if (open.length > 0) throw new AppError(409, "A greeting is already being prepared", "CAMPAIGN_IN_PROGRESS");
  const { rows: existing } = await deps.db.query<{ holiday: string; hebrew_year: number }>("SELECT holiday, hebrew_year FROM campaigns");
  const taken = new Set(existing.map((row) => `${row.holiday}:${row.hebrew_year}`));
  const next = upcomingHolidays(israelDay(now)).find((holiday) => !taken.has(`${holiday.key}:${holiday.hebrewYear}`) && holidaySendAt(holiday.eve) > now);
  if (!next) throw new AppError(409, "No holiday ahead without a greeting", "NO_HOLIDAY_AHEAD");
  const { rows } = await deps.db.query<{ id: string }>(
    `INSERT INTO campaigns (holiday, hebrew_year, eve, send_at, message, saved_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, '', $5, $6, $6) RETURNING id`,
    [next.key satisfies HolidayKey, next.hebrewYear, next.eve, holidaySendAt(next.eve), viewer.user.id, now],
  );
  return campaignWithPreview(deps.db, rows[0].id, deps.showsCustomers);
}

export interface CampaignPatch {
  message?: string;
  /** "all", or a trip's id. */
  audienceId?: string;
}

/**
 * Saves the text or the audience. A new text goes back to writing (WhatsApp reviews it again);
 * a new audience after Ronit's approval goes back to her approval. Nothing changes once sending starts.
 */
export async function updateCampaign(deps: GreetingsDeps, viewer: SignedInDto, id: string, patch: CampaignPatch): Promise<CampaignDto> {
  const now = deps.now();
  const replaced = await deps.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ status: CampaignStatus; message: string; audience_kind: "all" | "groups"; template_name: string | null }>(
      "SELECT status, message, audience_kind, template_name FROM campaigns WHERE id = $1 FOR UPDATE",
      [id],
    );
    const campaign = rows[0];
    if (!campaign) throw new NotFoundError("Campaign");
    if (campaign.status === "sending" || campaign.status === "completed") throw new AppError(409, "This greeting already went out", "CAMPAIGN_SENT");

    const message = patch.message?.trim();
    if (patch.message !== undefined && !message) throw new AppError(400, "A greeting needs some text", "EMPTY_MESSAGE");
    const textChanged = message !== undefined && message !== campaign.message;

    let audience: { kind: "all" | "groups"; ids: string[] } | null = null;
    if (patch.audienceId !== undefined) {
      if (patch.audienceId === "all") audience = { kind: "all", ids: [] };
      else {
        const { rows: groups } = await tx.query("SELECT 1 FROM groups WHERE id = $1 AND removed_at IS NULL", [patch.audienceId]);
        if (groups.length === 0) throw new NotFoundError("Audience");
        audience = { kind: "groups", ids: [patch.audienceId] };
      }
    }
    // The trip's name can't be filled for everyone: a text that uses it stays with one trip once it's in review.
    const text = message ?? campaign.message;
    if (audience?.kind === "all" && !textChanged && campaign.status !== "draft" && text.includes(MESSAGE_TOKENS.groupName)) {
      throw new AppError(400, "The trip's name needs a greeting to one trip", "PLACEHOLDER_NOT_ALLOWED");
    }

    const status: CampaignStatus = textChanged ? "draft" : audience && campaign.status === "scheduled" ? "awaiting-approval" : campaign.status;
    await tx.query(
      `UPDATE campaigns SET
         message = COALESCE($2, message),
         audience_kind = COALESCE($3, audience_kind),
         audience_group_ids = COALESCE($4::uuid[], audience_group_ids),
         status = $5,
         template_name = CASE WHEN $6 THEN NULL ELSE template_name END,
         approved_at = CASE WHEN $5 IN ('draft', 'in-review', 'awaiting-approval') THEN NULL ELSE approved_at END,
         approved_by = CASE WHEN $5 IN ('draft', 'in-review', 'awaiting-approval') THEN NULL ELSE approved_by END,
         saved_by = $7, updated_at = $8
       WHERE id = $1`,
      [id, message ?? null, audience?.kind ?? null, audience?.ids ?? null, status, textChanged, viewer.user.id, now],
    );
    await recordCampaignAudit(tx, now, "greeting-edit", viewer.user.id, id, { text: textChanged, audience: audience !== null });
    return textChanged ? campaign.template_name : null;
  });
  // The old text's template is no use now.
  if (replaced && deps.zernio) await discardTemplate({ db: deps.db, zernio: deps.zernio, now: deps.now }, replaced);
  return campaignWithPreview(deps.db, id, deps.showsCustomers);
}

/** Sends the text to WhatsApp for review. Meta usually answers within minutes, at most a day. */
export async function submitCampaign(deps: GreetingsDeps, viewer: SignedInDto, id: string): Promise<CampaignDto> {
  if (!deps.zernio) throw whatsappOff();
  const now = deps.now();
  const row = await campaignRow(deps.db, id);
  if (row.status !== "draft") throw new AppError(409, "This greeting isn't being written", "WRONG_STAGE");
  if (row.eve < israelDay(now)) throw new AppError(409, "This holiday has passed", "HOLIDAY_PASSED");
  const problem = templateProblem(row.message, holidayTokens(row.audience_kind));
  if (problem) throw problemError(problem);

  let template;
  try {
    template = await submitTemplate(
      { db: deps.db, zernio: deps.zernio, language: deps.language, now: deps.now },
      { purpose: "holiday", sourceText: row.message, nameBase: `${row.holiday}_${row.hebrew_year}`, createdBy: viewer.user.id },
    );
  } catch (err) {
    throw whatsappFailed(err);
  }
  const templates = { db: deps.db, zernio: deps.zernio, now: deps.now };
  // Only if the greeting is still the one that went for review: an edit while Meta was being asked
  // makes this template no use, and it must never end up beside another text.
  const { rows: claimed } = await deps.db.query(
    "UPDATE campaigns SET template_name = $2, status = $3, updated_at = $4 WHERE id = $1 AND status = 'draft' AND message = $5 RETURNING id",
    [id, template.name, template.status === "APPROVED" ? "awaiting-approval" : template.status === "REJECTED" ? "draft" : "in-review", now, row.message],
  );
  if (claimed.length === 0) {
    await discardTemplate(templates, template.name);
    throw new AppError(409, "The greeting changed while it went for review; send it again", "CHANGED_MEANWHILE");
  }
  await discardTemplate(templates, row.template_name);
  return campaignWithPreview(deps.db, id, deps.showsCustomers);
}

/** Ronit's approval: the greeting goes out at its send time. Only a text WhatsApp approved. */
export async function approveCampaign(deps: GreetingsDeps, viewer: SignedInDto, id: string): Promise<CampaignDto> {
  const now = deps.now();
  const row = await campaignRow(deps.db, id);
  if (row.status !== "awaiting-approval" || row.template_status !== "APPROVED") {
    throw new AppError(409, "WhatsApp hasn't approved this text yet", "NOT_REVIEWED");
  }
  if (row.eve < israelDay(now)) throw new AppError(409, "This holiday has passed", "HOLIDAY_PASSED");
  // Only the text WhatsApp approved, checked in the same statement that schedules it: an edit
  // landing in between can't leave an unreviewed text scheduled.
  const { rows } = await deps.db.query(
    `UPDATE campaigns c SET status = 'scheduled', approved_at = $2, approved_by = $3, updated_at = $2
     FROM whatsapp_templates t
     WHERE c.id = $1 AND c.status = 'awaiting-approval'
       AND t.name = c.template_name AND t.status = 'APPROVED' AND t.source_text = c.message
     RETURNING c.id`,
    [id, now, viewer.user.id],
  );
  if (rows.length === 0) throw new AppError(409, "WhatsApp hasn't approved this text yet", "NOT_REVIEWED");
  await recordCampaignAudit(deps.db, now, "greeting-approve", viewer.user.id, id);
  return campaignWithPreview(deps.db, id, deps.showsCustomers);
}

/** The signed-in person's WhatsApp number for tests, or an error saying what's missing. */
async function testNumber(deps: GreetingsDeps, viewer: SignedInDto): Promise<string> {
  const { rows } = await deps.db.query<{ whatsapp_phone: string | null }>("SELECT whatsapp_phone FROM staff_users WHERE id = $1", [viewer.user.id]);
  const phone = rows[0]?.whatsapp_phone;
  if (!phone) throw new AppError(400, "Add your WhatsApp number to your details first", "NO_TEST_NUMBER");
  if (!deps.isAllowed(phone)) throw new AppError(400, "Your number isn't open for WhatsApp sends on this server", "NUMBER_NOT_ALLOWED");
  return phone;
}

/**
 * Sends the greeting, as approved, to the signed-in person's own WhatsApp, exactly as its first
 * recipient gets it: their name and trip, never text the person typed. Only while the greeting waits
 * to go out.
 */
export async function sendCampaignTest(deps: GreetingsDeps, viewer: SignedInDto, id: string): Promise<CampaignDto> {
  if (!deps.zernio) throw whatsappOff();
  const row = await campaignRow(deps.db, id);
  if (row.status !== "awaiting-approval" && row.status !== "scheduled") {
    throw new AppError(409, "Tests go out while a greeting waits to be sent", "WRONG_STAGE");
  }
  if (row.template_status !== "APPROVED" || !row.template_name) throw new AppError(409, "WhatsApp hasn't approved this text yet", "NOT_REVIEWED");
  const phone = await testNumber(deps, viewer);
  const now = deps.now();
  const { rows: sentToday } = await deps.db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM audit_log WHERE action = 'greeting-test' AND by_user_id = $1 AND at > $2",
    [viewer.user.id, new Date(now.getTime() - 86_400_000)],
  );
  if (sentToday[0].n >= TESTS_PER_DAY) throw new AppError(429, "That's today's tests", "TEST_LIMIT");
  // Claimed before it's sent, so two at once can't both go out.
  const { rows: claimed } = await deps.db.query(
    "UPDATE campaigns SET last_test_at = $2, last_test_by = $3 WHERE id = $1 AND (last_test_at IS NULL OR last_test_at <= $4) RETURNING id",
    [id, now, viewer.user.id, new Date(now.getTime() - TEST_COOLDOWN_MS)],
  );
  if (claimed.length === 0) throw new AppError(429, "A test just went out; wait a moment", "TEST_TOO_SOON");

  const preview = deps.showsCustomers ? await previewFor(deps.db, row) : null;
  const { rows } = await deps.db.query<{ language: string; tokens: MessageToken[]; group_name: string | null }>(
    `SELECT t.language, t.tokens, (SELECT g.name FROM groups g WHERE g.id = ANY($2::uuid[]) LIMIT 1) AS group_name
     FROM whatsapp_templates t WHERE t.name = $1`,
    [row.template_name, row.audience_group_ids],
  );
  const template = rows[0];
  const params = templateParams(template.tokens, {
    firstName: preview?.firstName ?? TEMPLATE_EXAMPLES.firstName,
    groupName: preview?.groupName ?? template.group_name ?? TEMPLATE_EXAMPLES.groupName,
  });
  try {
    if (!params) throw new AppError(400, "A value for the test is missing", "MISSING_VALUE");
    await deps.zernio.sendTemplate({ to: phone, name: row.template_name, language: template.language, params });
  } catch (err) {
    // Nothing went out: it doesn't count against the next test.
    await deps.db.query("UPDATE campaigns SET last_test_at = $2, last_test_by = $3 WHERE id = $1 AND last_test_at = $4", [
      id,
      row.last_test_at,
      row.last_test_by,
      now,
    ]);
    if (err instanceof AppError) throw err;
    throw whatsappFailed(err);
  }
  await recordCampaignAudit(deps.db, now, "greeting-test", viewer.user.id, id);
  return campaignWithPreview(deps.db, id, deps.showsCustomers);
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
  /** The text WhatsApp approved, which is what goes out; null until one is approved. */
  approvedTemplate: string | null;
  /** A newer text in WhatsApp's review, or refused there. */
  templateReview: TemplateReviewDto | null;
}

export interface BirthdaySettingsPatch {
  enabled?: boolean;
  sendTime?: string;
  shabbatRule?: ShabbatRule;
  template?: string;
}

export async function birthdaySettings(db: Queryable): Promise<BirthdaySettingsDto> {
  const { rows } = await db.query<{
    enabled: boolean;
    send_time: string;
    shabbat_rule: ShabbatRule;
    template: string;
    updated_at: Date;
    approved_text: string | null;
    pending_status: TemplateStatus | null;
    pending_reason: string | null;
  }>(
    `SELECT b.enabled, to_char(b.send_time, 'HH24:MI') AS send_time, b.shabbat_rule, b.template, b.updated_at,
       live.source_text AS approved_text, pending.status AS pending_status, pending.reason AS pending_reason
     FROM birthday_settings b
     LEFT JOIN whatsapp_templates live ON live.name = b.template_name AND live.status = 'APPROVED'
     LEFT JOIN whatsapp_templates pending ON pending.name = b.pending_template_name`,
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
    approvedTemplate: row.approved_text,
    templateReview: row.pending_status ? { status: row.pending_status, reason: row.pending_reason } : null,
  };
}

/**
 * Saves the birthday settings. A new text also goes to WhatsApp for review when WhatsApp is
 * connected; until it's approved, the approved text keeps going out.
 */
export async function updateBirthdaySettings(deps: GreetingsDeps, viewer: SignedInDto, patch: BirthdaySettingsPatch): Promise<BirthdaySettingsDto> {
  const now = deps.now();
  const text = patch.template?.trim();
  if (patch.template !== undefined && !text) throw new ValidationError("The birthday greeting needs some text");

  const { rows } = await deps.db.query<{ template: string; approved_text: string | null; pending_name: string | null; pending_text: string | null }>(
    `SELECT b.template, live.source_text AS approved_text, b.pending_template_name AS pending_name, pending.source_text AS pending_text
     FROM birthday_settings b
     LEFT JOIN whatsapp_templates live ON live.name = b.template_name AND live.status = 'APPROVED'
     LEFT JOIN whatsapp_templates pending ON pending.name = b.pending_template_name`,
  );
  const current = rows[0];
  const textChanged = text !== undefined && text !== current.template;
  // The text WhatsApp should have: none needed when it's the approved one, or the one already in review.
  const review = deps.zernio && text !== undefined && text !== current.approved_text && text !== current.pending_text;
  if (review) {
    const problem = templateProblem(text, BIRTHDAY_TOKENS);
    if (problem) throw problemError(problem);
  }

  await deps.db.query(
    `UPDATE birthday_settings SET
       enabled = COALESCE($1, enabled),
       send_time = COALESCE($2::time, send_time),
       shabbat_rule = COALESCE($3, shabbat_rule),
       template = COALESCE($4, template),
       updated_at = $5`,
    [patch.enabled ?? null, patch.sendTime ?? null, patch.shabbatRule ?? null, text ?? null, now],
  );

  if (deps.zernio && text !== undefined) {
    const templates = { db: deps.db, zernio: deps.zernio, now: deps.now };
    if (review) {
      let template;
      try {
        template = await submitTemplate({ ...templates, language: deps.language }, { purpose: "birthday", sourceText: text, nameBase: "birthday", createdBy: viewer.user.id });
      } catch (err) {
        // The text is saved; it goes for review with the next save.
        throw whatsappFailed(err);
      }
      if (template.status === "APPROVED") {
        await deps.db.query("UPDATE birthday_settings SET template_name = $1, pending_template_name = NULL", [template.name]);
      } else {
        await deps.db.query("UPDATE birthday_settings SET pending_template_name = $1", [template.name]);
      }
      await discardTemplate(templates, current.pending_name);
    } else if (textChanged && text === current.approved_text && current.pending_name) {
      // Back to the approved text: the newer one in review isn't needed.
      await deps.db.query("UPDATE birthday_settings SET pending_template_name = NULL");
      await discardTemplate(templates, current.pending_name);
    }
  }
  return birthdaySettings(deps.db);
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
