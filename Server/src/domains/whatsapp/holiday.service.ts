import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { supabase } from "../../config/supabase.js";
import { getAllLeadsWithPhones } from "../monday/monday.service.js";
import { getTomorrowHoliday } from "./hebcal.client.js";
import { sendWhatsApp } from "./whatsapp.service.js";

interface HolidayCampaign {
  id: number;
  holiday_date: string;
  holiday_name: string;
  holiday_hebrew: string;
  status: string;
  prompt_message_id: string | null;
  prompt_sent_at: string | null;
  reply_text: string | null;
  reply_received_at: string | null;
  broadcast_started_at: string | null;
  broadcast_finished_at: string | null;
  total_sent: number | null;
  total_failed: number | null;
}

export async function checkAndPromptHoliday(): Promise<void> {
  const holiday = await getTomorrowHoliday();

  if (!holiday) {
    logger.info("No holiday tomorrow — skipping prompt");
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

  const { data: upserted, error: upsertError } = await db
    .from("holiday_campaigns")
    .upsert(
      {
        holiday_date: holiday.date,
        holiday_name: holiday.title,
        holiday_hebrew: holiday.hebrew,
        status: "pending_reply",
      },
      { onConflict: "holiday_date" },
    )
    .select("id")
    .single();

  if (upsertError) {
    throw upsertError;
  }

  const prompt = `שלום, מחר חל ${holiday.hebrew}. מה ההודעה שתרצי לשלוח לכל הלידים שלך? השיבי רק עם הודעת החג.`;
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
    "Holiday prompt sent to owner",
  );
}

export async function handleOwnerReply(replyText: string): Promise<void> {
  const db = supabase();

  const { data: campaign, error } = await db
    .from("holiday_campaigns")
    .select("id")
    .eq("status", "pending_reply")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!campaign) {
    logger.warn("Owner replied but no pending_reply campaign found — ignoring");
    return;
  }

  await db
    .from("holiday_campaigns")
    .update({
      reply_text: replyText,
      status: "reply_received",
      reply_received_at: new Date().toISOString(),
    })
    .eq("id", campaign.id);

  logger.info({ campaignId: campaign.id }, "Owner holiday reply recorded");
}

export async function broadcastHolidayCampaign(): Promise<void> {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const db = supabase();

  const { data: campaign, error } = await db
    .from("holiday_campaigns")
    .select("id, reply_text")
    .eq("holiday_date", todayStr)
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
    const sendStatus = { campaign_id: campaign.id, monday_item_id: lead.itemId, status: "" };

    const { data: sendRow } = await db
      .from("holiday_campaign_sends")
      .insert({ campaign_id: campaign.id, monday_item_id: lead.itemId, phone: lead.phone, lead_name: lead.name, status: "pending" })
      .select("id")
      .single();

    try {
      await sendWhatsApp(lead.phone, campaign.reply_text);
      sendStatus.status = "sent";
      sent++;

      if (sendRow) {
        await db
          .from("holiday_campaign_sends")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", sendRow.id);
      }
    } catch (err) {
      sendStatus.status = "failed";
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
