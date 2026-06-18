import type { Request, Response } from "express";
import { logger } from "../../config/logger.js";
import { checkAndPromptHoliday, broadcastHolidayCampaign } from "./holiday.service.js";
import { checkAndSendFollowups } from "./followup.service.js";
import type { FollowupTestInjectSchema } from "./whatsapp.validator.js";
import type { z } from "zod";

type FollowupTestBody = z.infer<typeof FollowupTestInjectSchema>;

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
