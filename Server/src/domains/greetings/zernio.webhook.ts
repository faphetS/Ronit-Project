import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Request, type Response, type Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { Db, Queryable } from "../../config/pg.js";
import { crmDatabase } from "../../db/startup.js";
import { applyTemplateStatus } from "./whatsapp-templates.js";
import { isTemplateStatus } from "./zernio.client.js";

/**
 * Zernio's webhook (POST /api/zernio/webhook): Meta's verdicts on greeting templates, and the
 * delivered / read / failed receipts of greetings sent. Every delivery is signed: X-Zernio-Signature
 * is the hex HMAC-SHA256 of the raw body with the secret it was registered with.
 * Docs: https://docs.zernio.com/webhooks, /webhooks/whatsapp and /webhooks/inbox.
 */

export function validSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const given = Buffer.from(signature.trim().toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Meta's codes that mean something to the screens; anything else is kept as meta:<code>. */
const META_FAILURES: Record<string, string> = {
  // Message undeliverable: not on WhatsApp, or can't receive it.
  "131026": "invalid-number",
  // The person stopped marketing messages from the business.
  "131050": "blocked",
};

interface ZernioEvent {
  id?: string;
  event?: string;
  test?: boolean;
  account?: { accountId?: string };
  template?: { name?: string; status?: string; reason?: string };
  message?: { platformMessageId?: string };
  error?: { code?: string | number } | null;
}

/** Applies one event. Receipts only move a message forward: a late "delivered" never undoes "read". */
export async function applyZernioEvent(db: Queryable, event: ZernioEvent, now: Date): Promise<void> {
  if (event.event === "whatsapp.template.status_updated") {
    const { name, status, reason } = event.template ?? {};
    if (name && isTemplateStatus(status)) await applyTemplateStatus(db, name, status, reason ?? null, now);
    return;
  }
  const messageId = event.message?.platformMessageId;
  if (!messageId) return;
  switch (event.event) {
    case "message.delivered":
      await db.query("UPDATE messages SET status = 'delivered', updated_at = $2 WHERE provider_message_id = $1 AND status = 'sent'", [messageId, now]);
      return;
    case "message.read":
      await db.query("UPDATE messages SET status = 'read', updated_at = $2 WHERE provider_message_id = $1 AND status IN ('sent', 'delivered')", [
        messageId,
        now,
      ]);
      return;
    case "message.failed": {
      const code = event.error?.code === undefined ? "" : String(event.error.code);
      const failure = META_FAILURES[code] ?? (code ? `meta:${code}` : "failed");
      const { rows } = await db.query<{ customer_id: string | null }>(
        `UPDATE messages SET status = 'failed', failure = $2, updated_at = $3
         WHERE provider_message_id = $1 AND status IN ('sent', 'delivered')
         RETURNING customer_id`,
        [messageId, failure, now],
      );
      // They asked WhatsApp to stop the business's marketing messages: no more greetings.
      if (failure === "blocked" && rows[0]?.customer_id) {
        await db.query("UPDATE customers SET greetings_opt_out = true, updated_at = $2 WHERE id = $1", [rows[0].customer_id, now]);
      }
      return;
    }
  }
}

export interface ZernioWebhookDeps {
  db: () => Promise<Db | null>;
  secret: () => string | undefined;
  /** Events of other accounts on the same Zernio key are ignored. */
  accountId: () => string | undefined;
  now: () => Date;
}

const envDeps: ZernioWebhookDeps = {
  db: crmDatabase,
  secret: () => env.ZERNIO_WEBHOOK_SECRET,
  accountId: () => env.ZERNIO_WHATSAPP_ACCOUNT_ID,
  now: () => new Date(),
};

/** Zernio sends about one receipt per greeting; this is far above that, and keeps a flood of junk off the database. */
export const WEBHOOK_REQUESTS_PER_MINUTE = 300;

/** Needs the raw body: server.ts mounts express.raw on this path before express.json. */
export function createZernioWebhookRouter(deps: ZernioWebhookDeps = envDeps, requestsPerMinute = WEBHOOK_REQUESTS_PER_MINUTE): Router {
  const router = express.Router();
  router.use(
    rateLimit({
      windowMs: 60_000,
      limit: requestsPerMinute,
      standardHeaders: true,
      legacyHeaders: false,
      message: { status: "error", code: "RATE_LIMITED", message: "Too many requests" },
    }),
  );
  router.post("/webhook", async (req: Request, res: Response) => {
    const secret = deps.secret();
    const db = await deps.db();
    if (!secret || !db) {
      res.status(503).json({ status: "error", code: "WEBHOOK_OFF", message: "The Zernio webhook isn't set up on this server" });
      return;
    }
    // The signature first: nothing unsigned is read.
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    if (!validSignature(raw, req.get("x-zernio-signature"), secret)) {
      res.status(401).json({ status: "error", code: "BAD_SIGNATURE", message: "Invalid signature" });
      return;
    }
    let event: ZernioEvent;
    try {
      event = JSON.parse(raw.toString("utf8")) as ZernioEvent;
    } catch {
      res.status(400).json({ status: "error", code: "BAD_BODY", message: "Not JSON" });
      return;
    }
    // Every Zernio event carries a stable id, the same on every retry: it's how one is applied only once.
    if (typeof event.id !== "string" || !event.id || event.id.length > 200 || typeof event.event !== "string") {
      res.status(400).json({ status: "error", code: "BAD_BODY", message: "Not a Zernio event" });
      return;
    }
    const eventId = event.id;
    const accountId = deps.accountId();
    const ours = !accountId || !event.account?.accountId || event.account.accountId === accountId;
    if (!event.test && ours) {
      try {
        await db.transaction(async (tx) => {
          // A retried delivery, or a replay of a captured one, changes nothing the second time.
          const { rows } = await tx.query(
            "INSERT INTO zernio_webhook_events (id, event, received_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING id",
            [eventId, event.event, deps.now()],
          );
          if (rows.length > 0) await applyZernioEvent(tx, event, deps.now());
        });
      } catch (err) {
        // A 500 makes Zernio retry the delivery later.
        logger.error({ err, eventId: event.id, event: event.event }, "Zernio webhook failed");
        res.status(500).json({ status: "error", code: "WEBHOOK_FAILED", message: "Try again later" });
        return;
      }
    }
    res.json({ status: "ok" });
  });
  return router;
}

export default createZernioWebhookRouter();
