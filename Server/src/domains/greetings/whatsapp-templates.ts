import { randomBytes } from "node:crypto";
import { logger } from "../../config/logger.js";
import type { Queryable } from "../../config/pg.js";
import { MESSAGE_TOKENS, type MessageToken } from "./greetings.tokens.js";
import { isTemplateStatus, type TemplateStatus, type ZernioClient } from "./zernio.client.js";

/**
 * A greeting's text as a WhatsApp template: Meta reviews every text a business sends outside
 * the 24 hours after a customer wrote. The dashboard's placeholders ({שם פרטי}) become Meta's
 * numbered ones ({{1}}), and each message fills them in order.
 */

/** Meta's limit for a template's body. */
export const TEMPLATE_BODY_LIMIT = 1024;

export type TemplatePurpose = "holiday" | "birthday";

const TOKEN_KEYS = Object.keys(MESSAGE_TOKENS) as MessageToken[];
const TOKEN_PATTERN = new RegExp(TOKEN_KEYS.map((key) => MESSAGE_TOKENS[key].replace(/[{}]/g, "\\$&")).join("|"), "g");
const KEY_OF = new Map<string, MessageToken>(TOKEN_KEYS.map((key) => [MESSAGE_TOKENS[key], key]));

/** Every placeholder becomes the next {{n}}, so a name used twice is two values. */
export function toTemplate(text: string): { body: string; tokens: MessageToken[] } {
  const tokens: MessageToken[] = [];
  const body = text.trim().replace(TOKEN_PATTERN, (match) => {
    tokens.push(KEY_OF.get(match)!);
    return `{{${tokens.length}}}`;
  });
  return { body, tokens };
}

export type TemplateProblem = "empty-message" | "too-long" | "starts-with-placeholder" | "ends-with-placeholder" | "placeholder-not-allowed";

/** What Meta would refuse in this text, checked before it's sent for review. */
export function templateProblem(text: string, allowed: readonly MessageToken[]): TemplateProblem | null {
  const { body, tokens } = toTemplate(text);
  if (!body) return "empty-message";
  if (body.length > TEMPLATE_BODY_LIMIT) return "too-long";
  if (tokens.some((token) => !allowed.includes(token))) return "placeholder-not-allowed";
  if (/^\{\{\d+\}\}/.test(body)) return "starts-with-placeholder";
  if (/\{\{\d+\}\}$/.test(body)) return "ends-with-placeholder";
  return null;
}

/** Sample values Meta's reviewers see, and a test shows when there's no customer to show. */
export const TEMPLATE_EXAMPLES: Record<MessageToken, string> = { firstName: "שרה", groupName: "טיסה לאומן", age: "30" };

/**
 * A value as Meta takes it: no line breaks or tabs, no runs of four spaces. Null for an empty one,
 * which Meta refuses.
 */
export function templateValue(value: string | number | null | undefined): string | null {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {4,}/g, "   ")
    .trim();
  return text || null;
}

/** The values for one recipient, in the template's order. Null when one is missing. */
export function templateParams(tokens: readonly MessageToken[], values: Partial<Record<MessageToken, string | number | null>>): string[] | null {
  const params = tokens.map((token) => templateValue(values[token]));
  return params.every((param): param is string => param !== null) ? params : null;
}

export interface TemplateRow {
  name: string;
  language: string;
  purpose: TemplatePurpose;
  source_text: string;
  body: string;
  tokens: MessageToken[];
  status: TemplateStatus;
  reason: string | null;
}

export const TEMPLATE_COLUMNS = "name, language, purpose, source_text, body, tokens, status, reason";

export interface TemplateDeps {
  db: Queryable;
  zernio: ZernioClient;
  language: string;
  now: () => Date;
}

/**
 * Sends a greeting's text to Meta for review and records it. `nameBase` starts the name
 * ("hanukkah_5787"); a random ending keeps every version apart, since Meta never reuses a name.
 */
export async function submitTemplate(
  deps: TemplateDeps,
  input: { purpose: TemplatePurpose; sourceText: string; nameBase: string; createdBy: string | null },
): Promise<TemplateRow> {
  const { body, tokens } = toTemplate(input.sourceText);
  const name = `${input.nameBase.toLowerCase().replace(/[^a-z0-9_]/g, "_")}_${randomBytes(3).toString("hex")}`;
  const { status } = await deps.zernio.createTemplate({ name, language: deps.language, body, examples: tokens.map((token) => TEMPLATE_EXAMPLES[token]) });
  const now = deps.now();
  const { rows } = await deps.db.query<TemplateRow>(
    `INSERT INTO whatsapp_templates (name, language, purpose, source_text, body, tokens, status, created_by, created_at, status_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     RETURNING ${TEMPLATE_COLUMNS}`,
    [name, deps.language, input.purpose, input.sourceText.trim(), body, tokens, status, input.createdBy, now],
  );
  return rows[0];
}

/** Meta's reason, as stored: "NONE" on approval means none. */
function reasonOf(reason: string | null | undefined): string | null {
  const text = reason?.trim();
  return text && text.toUpperCase() !== "NONE" ? text.slice(0, 500) : null;
}

/**
 * Records Meta's verdict on a template, and moves what uses it along: a holiday greeting in
 * review goes on to Ronit's approval when approved, or back to writing when rejected; an
 * approved birthday text replaces the one in use. `reason` is undefined when it isn't known
 * (a status read back from Meta), which keeps the one stored. Returns whether anything changed.
 */
export async function applyTemplateStatus(db: Queryable, name: string, status: TemplateStatus, reason: string | null | undefined, at: Date): Promise<boolean> {
  const known = reason === undefined ? null : (reasonOf(reason) ?? "");
  const { rows } = await db.query<{ name: string }>(
    `UPDATE whatsapp_templates
     SET status = $2, reason = CASE WHEN $2 = 'REJECTED' THEN COALESCE($3, reason, '') END, status_at = $4, checked_at = $4
     WHERE name = $1 AND (status IS DISTINCT FROM $2 OR ($2 = 'REJECTED' AND $3::text IS NOT NULL AND reason IS DISTINCT FROM $3))
     RETURNING name`,
    [name, status, known, at],
  );
  if (rows.length === 0) return false;

  if (status === "APPROVED") {
    await db.query("UPDATE campaigns SET status = 'awaiting-approval', updated_at = $2 WHERE template_name = $1 AND status = 'in-review'", [name, at]);
    await db.query(
      "UPDATE birthday_settings SET template_name = pending_template_name, pending_template_name = NULL WHERE pending_template_name = $1",
      [name],
    );
  } else if (status === "REJECTED") {
    await db.query("UPDATE campaigns SET status = 'draft', updated_at = $2 WHERE template_name = $1 AND status IN ('in-review', 'awaiting-approval')", [
      name,
      at,
    ]);
  }
  logger.info({ template: name, status }, "WhatsApp template status");
  return true;
}

/** Asks Meta (through Zernio) how the templates still in review stand. The webhook usually says first. */
export async function refreshWaitingTemplates(deps: Omit<TemplateDeps, "language">, limit = 20): Promise<number> {
  const { rows } = await deps.db.query<{ name: string; language: string }>(
    `SELECT name, language FROM whatsapp_templates WHERE status IN ('PENDING', 'IN_APPEAL')
     ORDER BY checked_at NULLS FIRST, created_at LIMIT $1`,
    [limit],
  );
  let changed = 0;
  for (const template of rows) {
    const now = deps.now();
    try {
      const status = await deps.zernio.templateStatus(template.name, template.language);
      if (status && isTemplateStatus(status) && (await applyTemplateStatus(deps.db, template.name, status, undefined, now))) changed += 1;
      else await deps.db.query("UPDATE whatsapp_templates SET checked_at = $2 WHERE name = $1", [template.name, now]);
    } catch (err) {
      logger.warn({ err, template: template.name }, "Couldn't check a WhatsApp template");
    }
  }
  return changed;
}

/** Deletes a template nothing uses any more, at Meta too. Best effort: a leftover template costs nothing. */
export async function discardTemplate(deps: Omit<TemplateDeps, "language">, name: string | null): Promise<void> {
  if (!name) return;
  const { rows } = await deps.db.query<{ language: string }>(
    `SELECT t.language FROM whatsapp_templates t
     WHERE t.name = $1
       AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.template_name = t.name)
       AND NOT EXISTS (SELECT 1 FROM birthday_settings b WHERE t.name IN (b.template_name, b.pending_template_name))
       AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.template_name = t.name)`,
    [name],
  );
  if (!rows[0]) return;
  try {
    await deps.zernio.deleteTemplate(name, rows[0].language);
    await deps.db.query("DELETE FROM whatsapp_templates WHERE name = $1", [name]);
  } catch (err) {
    logger.warn({ err, template: name }, "Couldn't delete a WhatsApp template");
  }
}
