import { logger } from "../../config/logger.js";
import type { Db } from "../../config/pg.js";
import { claimDueMessages, markFailed, markSent, markSkipped } from "./outbox.repository.js";

export type SendResult = { ok: true; providerMessageId: string | null } | { ok: false; error: string };

/** How a greeting leaves. The WhatsApp connection is still open, so this is the seam it plugs into. */
export interface WhatsAppChannel {
  name: string;
  /** A dry-run channel sends nothing: its messages are logged and marked skipped. */
  dryRun: boolean;
  sendText(to: string, text: string): Promise<SendResult>;
}

export interface SenderDeps {
  db: Db;
  channel: WhatsAppChannel;
  /** RONIT_WA_ALLOWED_NUMBERS: the one switch for every real WhatsApp send. */
  isAllowed: (msisdn: string) => boolean;
  maxPerRun: number;
  pacingMs: number;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

export interface SendRunResult {
  sent: number;
  failed: number;
  skipped: number;
}

async function birthdaysEnabled(db: Db): Promise<boolean> {
  const { rows } = await db.query<{ enabled: boolean }>("SELECT enabled FROM birthday_settings");
  return rows[0]?.enabled ?? false;
}

/** Sends the messages that are due, at most maxPerRun, pausing pacingMs between real sends. */
export async function sendDueMessages(deps: SenderDeps): Promise<SendRunResult> {
  const claimed = await claimDueMessages(deps.db, deps.now(), deps.maxPerRun);
  const result: SendRunResult = { sent: 0, failed: 0, skipped: 0 };
  if (claimed.length === 0) return result;

  // Birthdays switched off after a greeting was queued: it doesn't go out.
  const birthdaysOn = claimed.some((message) => message.kind === "birthday") ? await birthdaysEnabled(deps.db) : true;

  let sentBefore = false;
  for (const message of claimed) {
    if (message.kind === "birthday" && !birthdaysOn) {
      await markSkipped(deps.db, message.id, "birthdays-off");
      result.skipped += 1;
      continue;
    }
    if (deps.channel.dryRun) {
      logger.info({ messageId: message.id, to: message.to_phone, textLen: message.body.length }, "Greeting dry run — not sent");
      await markSkipped(deps.db, message.id, "dry-run");
      result.skipped += 1;
      continue;
    }
    if (!deps.isAllowed(message.to_phone)) {
      await markSkipped(deps.db, message.id, "not-allowed");
      result.skipped += 1;
      continue;
    }

    if (sentBefore && deps.pacingMs > 0) await deps.sleep(deps.pacingMs);
    sentBefore = true;

    let outcome: SendResult;
    try {
      outcome = await deps.channel.sendText(message.to_phone, message.body);
    } catch (err) {
      outcome = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (outcome.ok) {
      await markSent(deps.db, message.id, outcome.providerMessageId, deps.now());
      result.sent += 1;
    } else {
      await markFailed(deps.db, message.id, outcome.error);
      result.failed += 1;
      logger.warn({ messageId: message.id, channel: deps.channel.name, error: outcome.error }, "Greeting send failed");
    }
  }
  return result;
}
