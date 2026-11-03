import type { Db } from "../../config/pg.js";
import { addDays, birthdayIn, birthdaySlot, israelDay, type ShabbatRule } from "../../lib/israel-time.js";
import { fillMessage, type MessageToken } from "./greetings.tokens.js";
import { templateParams } from "./whatsapp-templates.js";

interface BirthdaySettingsRow {
  enabled: boolean;
  send_time: string;
  shabbat_rule: ShabbatRule;
  template: string;
  /** The approved WhatsApp template in use: its name, language, placeholders and the text it was made from. */
  template_name: string | null;
  template_language: string | null;
  template_tokens: MessageToken[] | null;
  template_text: string | null;
}

interface BirthdayCustomerRow {
  id: string;
  first_name: string;
  phone: string;
  birth_date: string;
}

export interface BirthdayQueueOptions {
  /**
   * WhatsApp's own API: greetings go out as the approved birthday template, its text and not a
   * newer one still in review, and none are queued while no template is approved.
   */
  templates: boolean;
}

/**
 * Queues the birthday greetings that go out today (Israel time), from the birth dates on
 * passports. Runs hourly and is idempotent: one greeting per customer per year.
 *
 * Tomorrow's birthdays are looked at too, because "before Shabbat" sends a Saturday
 * birthday on Friday. A greeting whose time already passed today goes out now; one whose
 * day has passed (a Friday send missed while the server was down) is skipped rather than
 * sent on Shabbat. Returns how many it queued.
 */
export async function queueBirthdayGreetings(db: Db, now: Date, options: BirthdayQueueOptions = { templates: false }): Promise<number> {
  const { rows: settingsRows } = await db.query<BirthdaySettingsRow>(
    `SELECT b.enabled, b.send_time::text AS send_time, b.shabbat_rule, b.template,
       t.name AS template_name, t.language AS template_language, t.tokens AS template_tokens, t.source_text AS template_text
     FROM birthday_settings b LEFT JOIN whatsapp_templates t ON t.name = b.template_name AND t.status = 'APPROVED'`,
  );
  const settings = settingsRows[0];
  if (!settings?.enabled) return 0;
  const template = options.templates ? settings.template_name : null;
  if (options.templates && !template) return 0;
  const text = options.templates ? (settings.template_text ?? "") : settings.template;
  if (!text.trim()) return 0;

  const slotSettings = { sendTime: settings.send_time.slice(0, 5), shabbatRule: settings.shabbat_rule };
  const today = israelDay(now);
  const days = [today, addDays(today, 1)];

  const { rows: customers } = await db.query<BirthdayCustomerRow>(
    `SELECT c.id, c.first_name, c.phone, p.birth_date
     FROM customers c JOIN passports p ON p.customer_id = c.id
     WHERE p.birth_date IS NOT NULL AND c.phone IS NOT NULL AND NOT c.greetings_opt_out`,
  );

  let queued = 0;
  for (const customer of customers) {
    for (const day of days) {
      const year = Number(day.slice(0, 4));
      if (birthdayIn(year, customer.birth_date) !== day) continue;

      const slot = birthdaySlot(day, slotSettings);
      if (israelDay(slot) !== today) continue;
      const sendAt = slot < now ? now : slot;

      const age = year - Number(customer.birth_date.slice(0, 4));
      const values = { firstName: customer.first_name, age };
      const body = fillMessage(text, values);
      const params = template ? templateParams(settings.template_tokens ?? [], values) : null;
      const missing = template !== null && params === null;
      const { rows } = await db.query(
        `INSERT INTO messages (kind, dedup_key, customer_id, to_phone, body, send_at, template_name, template_language, template_params, status, failure)
         VALUES ('birthday', $1, $2, $3, $4, $5, $6, $7, $8::text::jsonb, $9, $10)
         ON CONFLICT (dedup_key) DO NOTHING
         RETURNING id`,
        [
          `birthday:${customer.id}:${year}`,
          customer.id,
          customer.phone,
          body,
          sendAt,
          template,
          template ? settings.template_language : null,
          params ? JSON.stringify(params) : null,
          missing ? "skipped" : "queued",
          missing ? "missing-value" : null,
        ],
      );
      queued += rows.length;
    }
  }
  return queued;
}
