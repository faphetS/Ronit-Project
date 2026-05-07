import { randomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../config/logger.js";
import { supabase } from "../../config/supabase.js";
import { getAllLeadsWithPhones } from "../monday/monday.service.js";
import { getHolidayInDays } from "./hebcal.client.js";
import { sendWhatsApp } from "./whatsapp.service.js";

interface HolidayCampaign {
  id: number;
  holiday_date: string;
  holiday_name: string;
  holiday_hebrew: string;
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

  const db = supabase();

  const { data: existing, error: fetchError } = await db
    .from("holiday_campaigns")
    .select("id, status")
    .eq("holiday_date", holiday.date)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (existing && existing.status !== "pending_reply") {
    logger.info(
      { holidayDate: holiday.date, status: existing.status },
      "Holiday campaign already in progress — skipping prompt",
    );
    return;
  }

  const formToken = randomBytes(32).toString("hex");

  const { data: upserted, error: upsertError } = await db
    .from("holiday_campaigns")
    .upsert(
      {
        holiday_date: holiday.date,
        holiday_name: holiday.title,
        holiday_hebrew: holiday.hebrew,
        status: "pending_reply",
        form_token: formToken,
      },
      { onConflict: "holiday_date" },
    )
    .select("id")
    .single();

  if (upsertError) {
    throw upsertError;
  }

  const formUrl = `${env.BACKEND_URL}/api/whatsapp/holiday-form?token=${formToken}`;
  const prompt = `שלום, בעוד 3 ימים חל ${holiday.hebrew}.\nמה תרצי לשלוח לכל הלקוחות שלך?\n\nלחצי על הקישור למילוי הטופס:\n${formUrl}`;
  const idMessage = await sendWhatsApp(env.RONIT_OWNER_WA_NUMBER, prompt);

  await db
    .from("holiday_campaigns")
    .update({
      prompt_sent_at: new Date().toISOString(),
      prompt_message_id: idMessage,
    })
    .eq("id", upserted.id);

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

export async function getFormData(token: string): Promise<HolidayFormData> {
  const db = supabase();

  const { data, error } = await db
    .from("holiday_campaigns")
    .select("id, holiday_name, holiday_hebrew, holiday_date, status")
    .eq("form_token", token)
    .maybeSingle();

  if (error) throw error;

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

export async function submitHolidayForm(
  token: string,
  greeting: string,
): Promise<{ holidayHebrew: string; holidayDate: string }> {
  const db = supabase();

  const { data: campaign, error } = await db
    .from("holiday_campaigns")
    .select("id, holiday_date, holiday_hebrew, status")
    .eq("form_token", token)
    .maybeSingle();

  if (error) throw error;

  if (!campaign) {
    throw new AppError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");
  }

  if (campaign.status !== "pending_reply") {
    throw new AppError(400, "Campaign already submitted or expired", "CAMPAIGN_NOT_PENDING");
  }

  await db
    .from("holiday_campaigns")
    .update({
      reply_text: greeting,
      send_date: campaign.holiday_date,
      status: "reply_received",
      reply_received_at: new Date().toISOString(),
    })
    .eq("id", campaign.id);

  logger.info({ campaignId: campaign.id, sendDate: campaign.holiday_date }, "Holiday form submitted");

  return { holidayHebrew: campaign.holiday_hebrew, holidayDate: campaign.holiday_date };
}

export async function broadcastHolidayCampaign(): Promise<void> {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const db = supabase();

  // Expire stale campaigns where the holiday has passed
  const { error: expireError } = await db
    .from("holiday_campaigns")
    .update({ status: "expired" })
    .eq("status", "pending_reply")
    .lt("holiday_date", todayStr);

  if (expireError) {
    logger.error({ err: expireError }, "Failed to expire stale campaigns");
  }

  const { data: campaign, error } = await db
    .from("holiday_campaigns")
    .select("id, reply_text")
    .eq("send_date", todayStr)
    .eq("status", "reply_received")
    .maybeSingle() as { data: Pick<HolidayCampaign, "id" | "reply_text"> | null; error: unknown };

  if (error) {
    throw error;
  }

  if (!campaign) {
    logger.info({ todayStr }, "No reply_received campaign for today — skipping broadcast");
    return;
  }

  if (!campaign.reply_text) {
    logger.warn({ campaignId: campaign.id }, "Campaign has no reply text — skipping broadcast");
    return;
  }

  await db
    .from("holiday_campaigns")
    .update({ status: "broadcasting", broadcast_started_at: new Date().toISOString() })
    .eq("id", campaign.id);

  const leads = await getAllLeadsWithPhones();

  let sent = 0;
  let failed = 0;

  for (const lead of leads) {
    const { data: sendRow } = await db
      .from("holiday_campaign_sends")
      .insert({ campaign_id: campaign.id, monday_item_id: lead.itemId, phone: lead.phone, lead_name: lead.name, status: "pending" })
      .select("id")
      .single();

    try {
      await sendWhatsApp(lead.phone, campaign.reply_text);
      sent++;

      if (sendRow) {
        await db
          .from("holiday_campaign_sends")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", sendRow.id);
      }
    } catch (err) {
      failed++;
      logger.error({ err, itemId: lead.itemId }, "Holiday broadcast send failed");

      if (sendRow) {
        await db
          .from("holiday_campaign_sends")
          .update({ status: "failed" })
          .eq("id", sendRow.id);
      }
    }

    if (leads.indexOf(lead) < leads.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  await db
    .from("holiday_campaigns")
    .update({
      status: "sent",
      broadcast_finished_at: new Date().toISOString(),
      total_recipients: leads.length,
      total_sent: sent,
      total_failed: failed,
    })
    .eq("id", campaign.id);

  logger.info({ campaignId: campaign.id, sent, failed }, "Holiday broadcast complete");
}
