import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { UnauthorizedError } from "../../lib/errors.js";
import { checkAndPromptHoliday, broadcastHolidayCampaign } from "./holiday.service.js";
import { checkAndSendFollowups } from "./followup.service.js";
import { handleInboundWhatsApp, type InboundWhatsApp } from "./wa-inbound.service.js";
import type { FollowupTestInjectSchema } from "./whatsapp.validator.js";
import type { z } from "zod";

type FollowupTestBody = z.infer<typeof FollowupTestInjectSchema>;

// Backwards-compatible secret gate for the inbound webhook. Disabled (open) when
// WA_WEBHOOK_SECRET is empty. When set, every inbound POST must carry ?token=<secret>
// in the URL (the gateway can only add a query param, not a custom header). The
// token is redacted from request logs — see config/logger.ts.
export function verifyWhatsAppSecret(req: Request, _res: Response, next: NextFunction): void {
  const secret = env.WA_WEBHOOK_SECRET;
  if (!secret) return next();
  const raw = req.query.token;
  const provided = typeof raw === "string" ? raw : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    logger.warn({ ip: req.ip }, "WhatsApp webhook token mismatch — rejected");
    throw new UnauthorizedError("Invalid WhatsApp webhook token");
  }
  next();
}

// Inbound receiver. The gateway forwards EVERY WhatsApp event, but only an
// INCOMING PRIVATE message is a potential lead. We distinguish by payload shape:
//   - chatType: "private" | "group"  (the definitive flag)
//   - participant: present ONLY on group messages (the sender inside the group)
//   - from: a phone (~12 digits) for private; a long group-id (~18 digits) for group
//   - type: "incoming" | "outgoing"  (outgoing = the account's own sent echoes)
// Group messages and outgoing echoes are logged and ignored; private inbound is
// logged as before (the new gateway's lead handling will build on this).
export async function receiveWebhook(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as {
    type?: string;
    chatType?: string;
    participant?: string;
    from?: string;
    messageType?: string;
  };

  const isGroup = body.chatType === "group" || typeof body.participant === "string";
  const isOutgoing = body.type === "outgoing";

  if (isGroup || isOutgoing) {
    logger.info(
      { kind: isGroup ? "group" : "outgoing", type: body.type, chatType: body.chatType, from: body.from },
      "WhatsApp non-lead event — ignored",
    );
    res.sendStatus(200);
    return;
  }

  logger.info({ webhookBody: JSON.stringify(req.body) }, "Inbound webhook received");

  // Lead handling (phone match → activity tracking → negative-intent routing) runs
  // only when the follow-up feature is switched on. While off, this stays a plain
  // logger (the pre-feature behavior). Fire-and-forget so the 200 is never delayed.
  if (env.WA_FOLLOWUP_ENABLED) {
    void handleInboundWhatsApp(req.body as InboundWhatsApp).catch((err) =>
      logger.error({ err }, "handleInboundWhatsApp failed"),
    );
  }

  res.sendStatus(200);
}

export async function testHolidayCheck(_req: Request, res: Response): Promise<void> {
  await checkAndPromptHoliday();
  res.json({ status: "ok" });
}

export async function testBroadcast(_req: Request, res: Response): Promise<void> {
  await broadcastHolidayCampaign();
  res.json({ status: "ok" });
}

export async function testFollowup(req: Request, res: Response): Promise<void> {
  const { daysThreshold } = req.body as FollowupTestBody;
  await checkAndSendFollowups(daysThreshold);
  res.json({ status: "ok" });
}
