import type { Db } from "../../config/pg.js";
import { addDays, birthdayIn, birthdaySlot, israelDay, type ShabbatRule } from "../../lib/israel-time.js";
import { fillMessage } from "./greetings.tokens.js";

interface BirthdaySettingsRow {
  enabled: boolean;
  send_time: string;
  shabbat_rule: ShabbatRule;
  template: string;
}

interface BirthdayCustomerRow {
  id: string;
  first_name: string;
  phone: string;
  birth_date: string;
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
export async function queueBirthdayGreetings(db: Db, now: Date): Promise<number> {
  const { rows: settingsRows } = await db.query<BirthdaySettingsRow>(
    "SELECT enabled, send_time::text AS send_time, shabbat_rule, template FROM birthday_settings",
  );
  const settings = settingsRows[0];
  if (!settings?.enabled || !settings.template.trim()) return 0;

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
      const body = fillMessage(settings.template, { firstName: customer.first_name, age });
      const { rows } = await db.query(
        `INSERT INTO messages (kind, dedup_key, customer_id, to_phone, body, send_at)
         VALUES ('birthday', $1, $2, $3, $4, $5)
         ON CONFLICT (dedup_key) DO NOTHING
         RETURNING id`,
        [`birthday:${customer.id}:${year}`, customer.id, customer.phone, body, sendAt],
      );
      queued += rows.length;
    }
  }
  return queued;
}
