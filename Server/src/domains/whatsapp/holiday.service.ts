import { randomBytes } from "node:crypto";
import { getDb } from "../../config/db.js";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../config/logger.js";
import { getAllLeadsWithPhones } from "../monday/monday.service.js";
import { getHolidayInDays } from "./hebcal.client.js";
import { sendWhatsApp } from "./whatsapp.service.js";

interface HolidayCampaignRow {
  id: number;
  holiday_date: string;
  holiday_name: string;
  holiday_hebrew: string | null;
  status: string;
  form_token: string | null;
  send_date: string | null;
  reply_text: string | null;
  total_sent: number | null;
  total_failed: number | null;
}

export async function checkAndPromptHoliday(): Promise<void> {
  const holiday = await getHolidayInDays(3);

  if (!holiday) {
    logger.info("No holiday in 3 days — skipping prompt");
    return;
  }

  if (!env.RONIT_OWNER_WA_NUMBER) {
    logger.warn("RONIT_OWNER_WA_NUMBER not set — skipping holiday prompt");
    return;
  }

  const db = getDb();

  const existing = db
    .prepare("SELECT id, status FROM holiday_campaigns WHERE holiday_date = ?")
    .get(holiday.date) as { id: number; status: string } | undefined;

  if (existing && existing.status !== "pending_reply") {
    logger.info(
      { holidayDate: holiday.date, status: existing.status },
      "Holiday campaign already in progress — skipping prompt",
    );
    return;
  }

  const formToken = randomBytes(32).toString("hex");

  const upserted = db
    .prepare(
      `INSERT INTO holiday_campaigns (holiday_date, holiday_name, holiday_hebrew, status, form_token)
       VALUES (?, ?, ?, 'pending_reply', ?)
       ON CONFLICT(holiday_date) DO UPDATE SET
         holiday_name = excluded.holiday_name,
         holiday_hebrew = excluded.holiday_hebrew,
         status = 'pending_reply',
         form_token = excluded.form_token
       RETURNING id`,
    )
    .get(holiday.date, holiday.title, holiday.hebrew, formToken) as { id: number };

  const formUrl = `${env.BACKEND_URL}/api/whatsapp/holiday-form?token=${formToken}`;
  const prompt = `שלום, בעוד 3 ימים חל ${holiday.hebrew}.\nמה תרצי לשלוח לכל הלקוחות שלך?\n\nלחצי על הקישור למילוי הטופס:\n${formUrl}`;
  const idMessage = await sendWhatsApp(env.RONIT_OWNER_WA_NUMBER, prompt);

  db.prepare(
    "UPDATE holiday_campaigns SET prompt_sent_at = datetime('now'), prompt_message_id = ? WHERE id = ?",
  ).run(idMessage, upserted.id);

  logger.info(
    { campaignId: upserted.id, holiday: holiday.hebrew, idMessage },
    "Holiday form link sent to owner",
  );
}

export interface HolidayFormData {
  campaignId: number;
  holidayName: string;
  holidayHebrew: string;
  holidayDate: string;
  status: string;
}

export function getFormData(token: string): HolidayFormData {
  const data = getDb()
    .prepare(
      "SELECT id, holiday_name, holiday_hebrew, holiday_date, status FROM holiday_campaigns WHERE form_token = ?",
    )
    .get(token) as
    | {
        id: number;
        holiday_name: string;
        holiday_hebrew: string;
        holiday_date: string;
        status: string;
      }
    | undefined;

  if (!data) {
    throw new AppError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");
  }

  return {
    campaignId: data.id,
    holidayName: data.holiday_name,
    holidayHebrew: data.holiday_hebrew,
    holidayDate: data.holiday_date,
    status: data.status,
  };
}

export function submitHolidayForm(
  token: string,
  greeting: string,
): { holidayHebrew: string; holidayDate: string } {
  const db = getDb();

  const campaign = db
    .prepare(
      "SELECT id, holiday_date, holiday_hebrew, status FROM holiday_campaigns WHERE form_token = ?",
    )
    .get(token) as
    | { id: number; holiday_date: string; holiday_hebrew: string; status: string }
    | undefined;

  if (!campaign) {
    throw new AppError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");
  }

  if (campaign.status !== "pending_reply") {
    throw new AppError(400, "Campaign already submitted or expired", "CAMPAIGN_NOT_PENDING");
  }

  db.prepare(
    `UPDATE holiday_campaigns
     SET reply_text = ?, send_date = ?, status = 'reply_received', reply_received_at = datetime('now')
     WHERE id = ?`,
  ).run(greeting, campaign.holiday_date, campaign.id);

  logger.info({ campaignId: campaign.id, sendDate: campaign.holiday_date }, "Holiday form submitted");

  return { holidayHebrew: campaign.holiday_hebrew, holidayDate: campaign.holiday_date };
}

export async function broadcastHolidayCampaign(): Promise<void> {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const db = getDb();

  // Expire stale campaigns where the holiday has passed
  db.prepare(
    "UPDATE holiday_campaigns SET status = 'expired' WHERE status = 'pending_reply' AND holiday_date < ?",
  ).run(todayStr);

  const campaign = db
    .prepare(
      "SELECT id, reply_text FROM holiday_campaigns WHERE send_date = ? AND status = 'reply_received'",
    )
    .get(todayStr) as Pick<HolidayCampaignRow, "id" | "reply_text"> | undefined;

  if (!campaign) {
    logger.info({ todayStr }, "No reply_received campaign for today — skipping broadcast");
    return;
  }

  if (!campaign.reply_text) {
    logger.warn({ campaignId: campaign.id }, "Campaign has no reply text — skipping broadcast");
    return;
  }

  db.prepare(
    "UPDATE holiday_campaigns SET status = 'broadcasting', broadcast_started_at = datetime('now') WHERE id = ?",
  ).run(campaign.id);

  const leads = await getAllLeadsWithPhones();

  const insertSendStmt = db.prepare(
    `INSERT INTO holiday_campaign_sends (campaign_id, monday_item_id, phone, lead_name, status)
     VALUES (?, ?, ?, ?, 'pending')
     RETURNING id`,
  );
  const markSentStmt = db.prepare(
    "UPDATE holiday_campaign_sends SET status = 'sent', sent_at = datetime('now') WHERE id = ?",
  );
  const markFailedStmt = db.prepare(
    "UPDATE holiday_campaign_sends SET status = 'failed' WHERE id = ?",
  );

  let sent = 0;
  let failed = 0;

  for (const lead of leads) {
    const sendRow = insertSendStmt.get(campaign.id, lead.itemId, lead.phone, lead.name) as
      | { id: number }
      | undefined;

    try {
      await sendWhatsApp(lead.phone, campaign.reply_text);
      sent++;
      if (sendRow) markSentStmt.run(sendRow.id);
    } catch (err) {
      failed++;
      logger.error({ err, itemId: lead.itemId }, "Holiday broadcast send failed");
      if (sendRow) markFailedStmt.run(sendRow.id);
    }

    if (leads.indexOf(lead) < leads.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  db.prepare(
    `UPDATE holiday_campaigns
     SET status = 'sent', broadcast_finished_at = datetime('now'),
         total_recipients = ?, total_sent = ?, total_failed = ?
     WHERE id = ?`,
  ).run(leads.length, sent, failed, campaign.id);

  logger.info({ campaignId: campaign.id, sent, failed }, "Holiday broadcast complete");
}
