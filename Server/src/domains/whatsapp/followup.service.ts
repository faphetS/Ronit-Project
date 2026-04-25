import { logger } from "../../config/logger.js";
import { supabase } from "../../config/supabase.js";
import { getAllLeadsForFollowup } from "../monday/monday.service.js";
import { sendWhatsApp } from "./whatsapp.service.js";

export async function checkAndSendFollowups(daysThreshold = 7): Promise<void> {
  const leads = await getAllLeadsForFollowup();

  if (leads.length === 0) {
    logger.info("No contacted leads found — skipping follow-up");
    return;
  }

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - daysThreshold);
  const cutoffStr = cutoff.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

  const qualifying = leads.filter((l) => l.lastCallDate <= cutoffStr);

  logger.info(
    { total: leads.length, qualifying: qualifying.length, cutoffStr },
    "Follow-up eligibility computed",
  );

  const db = supabase();
  let sent = 0;
  let skipped = 0;

  for (const lead of qualifying) {
    const { data: existing } = await db
      .from("followup_log")
      .select("id")
      .eq("monday_item_id", lead.itemId)
      .eq("last_call_date", lead.lastCallDate)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const message = `שלום ${lead.name}, דיברנו לפני כמה ימים - רציתי לבדוק אם זה עדיין רלוונטי עבורך?`;

    try {
      await sendWhatsApp(lead.phone, message);

      await db.from("followup_log").insert({
        monday_item_id: lead.itemId,
        phone: lead.phone,
        lead_name: lead.name,
        last_call_date: lead.lastCallDate,
        sent_at: new Date().toISOString(),
      });

      sent++;
    } catch (err) {
      logger.error({ err, itemId: lead.itemId }, "Follow-up send failed");
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  logger.info({ sent, skipped }, "Follow-up check complete");
}
