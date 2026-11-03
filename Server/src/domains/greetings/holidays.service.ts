import { logger } from "../../config/logger.js";
import type { Db, Queryable } from "../../config/pg.js";
import { fillMessage, type MessageToken } from "./greetings.tokens.js";
import { templateParams } from "./whatsapp-templates.js";

interface CampaignRow {
  id: string;
  message: string;
  audience_kind: "all" | "groups";
  audience_group_ids: string[];
  rate_messages: number;
  rate_every_minutes: number;
  /** The approved WhatsApp template of its text; null when there's none (the queue then puts it back to writing). */
  template_name: string | null;
  template_language: string | null;
  template_tokens: MessageToken[] | null;
}

interface RecipientRow {
  id: string;
  first_name: string;
  phone: string;
  group_name: string | null;
}

/**
 * Queues every scheduled holiday greeting whose send time has come: one message per
 * recipient, staggered at the campaign's rate (50 every 10 minutes by default), then moves
 * the campaign to 'sending'. Returns how many messages it queued.
 */
export async function queueDueCampaigns(db: Db, now: Date): Promise<number> {
  const { rows: due } = await db.query<{ id: string }>(
    "SELECT id FROM campaigns WHERE status = 'scheduled' AND send_at <= $1 ORDER BY send_at",
    [now],
  );
  let queued = 0;
  for (const { id } of due) queued += await db.transaction((tx) => queueCampaign(tx, id, now));
  return queued;
}

async function queueCampaign(tx: Queryable, campaignId: string, now: Date): Promise<number> {
  // Re-read under a row lock: another run may have queued it in the meantime.
  const { rows: campaigns } = await tx.query<CampaignRow>(
    `SELECT c.id, c.message, c.audience_kind, c.audience_group_ids, c.rate_messages, c.rate_every_minutes,
       t.name AS template_name, t.language AS template_language, t.tokens AS template_tokens
     FROM campaigns c
     LEFT JOIN whatsapp_templates t ON t.name = c.template_name AND t.status = 'APPROVED' AND t.source_text = c.message
     WHERE c.id = $1 AND c.status = 'scheduled' FOR UPDATE OF c`,
    [campaignId],
  );
  const campaign = campaigns[0];
  if (!campaign) return 0;
  // Only the text WhatsApp approved goes out. A scheduled greeting without it (Meta paused or
  // disabled the template since) goes back to writing, to be reviewed again.
  if (!campaign.template_name) {
    await tx.query("UPDATE campaigns SET status = 'draft', approved_at = NULL, approved_by = NULL, updated_at = now() WHERE id = $1", [campaign.id]);
    logger.warn({ campaignId: campaign.id }, "A scheduled greeting's text isn't approved on WhatsApp now: back to writing");
    return 0;
  }

  // Everyone with a phone who hasn't opted out ("all"), or those registered to the chosen
  // groups. {שם הקבוצה} is their latest trip among the audience's groups (any trip for "all").
  const { rows: recipients } = await tx.query<RecipientRow>(
    `SELECT c.id, c.first_name, c.phone,
       (SELECT g.name FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE gm.customer_id = c.id AND ($1 = 'all' OR gm.group_id = ANY($2::uuid[]))
        ORDER BY g.starts_on DESC NULLS LAST LIMIT 1) AS group_name
     FROM customers c
     WHERE c.phone IS NOT NULL AND NOT c.greetings_opt_out
       AND ($1 = 'all' OR EXISTS (
         SELECT 1 FROM group_members gm WHERE gm.customer_id = c.id AND gm.group_id = ANY($2::uuid[])))
     ORDER BY c.created_at, c.id`,
    [campaign.audience_kind, campaign.audience_group_ids],
  );

  let queued = 0;
  for (const [index, recipient] of recipients.entries()) {
    const batch = Math.floor(index / campaign.rate_messages);
    const sendAt = new Date(now.getTime() + batch * campaign.rate_every_minutes * 60_000);
    const values = { firstName: recipient.first_name, groupName: recipient.group_name ?? "" };
    const body = fillMessage(campaign.message, values);
    // A template needs every value: someone without one (no first name) is skipped, not sent a gap.
    const params = templateParams(campaign.template_tokens ?? [], values);
    const missing = params === null;
    const { rows } = await tx.query(
      `INSERT INTO messages (kind, dedup_key, customer_id, campaign_id, to_phone, body, send_at, template_name, template_language, template_params, status, failure)
       VALUES ('holiday', $1, $2, $3, $4, $5, $6, $7, $8, $9::text::jsonb, $10, $11)
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING id`,
      [
        `holiday:${campaign.id}:${recipient.id}`,
        recipient.id,
        campaign.id,
        recipient.phone,
        body,
        sendAt,
        campaign.template_name,
        campaign.template_language,
        params ? JSON.stringify(params) : null,
        missing ? "skipped" : "queued",
        missing ? "missing-value" : null,
      ],
    );
    queued += rows.length;
  }

  await tx.query(
    "UPDATE campaigns SET status = 'sending', queued_at = $2, updated_at = now() WHERE id = $1",
    [campaign.id, now],
  );
  return queued;
}

/** Moves campaigns with nothing left to send to 'completed'. Returns how many. */
export async function completeFinishedCampaigns(db: Db, now: Date): Promise<number> {
  const { rows } = await db.query(
    `UPDATE campaigns c SET status = 'completed', completed_at = $1, updated_at = now()
     WHERE c.status = 'sending'
       AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.campaign_id = c.id AND m.status IN ('queued', 'sending'))
     RETURNING c.id`,
    [now],
  );
  return rows.length;
}
