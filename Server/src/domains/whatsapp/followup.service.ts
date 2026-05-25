import { getDb } from "../../config/db.js";
import { logger } from "../../config/logger.js";
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

  const db = getDb();
  const existsStmt = db.prepare(
    "SELECT id FROM followup_log WHERE monday_item_id = ? AND last_call_date = ?",
  );
  const insertStmt = db.prepare(
    `INSERT INTO followup_log (monday_item_id, phone, lead_name, last_call_date)
     VALUES (?, ?, ?, ?)`,
  );

  let sent = 0;
  let skipped = 0;

  for (const lead of qualifying) {
    const existing = existsStmt.get(lead.itemId, lead.lastCallDate);

    if (existing) {
      skipped++;
      continue;
    }

    const message = `שלום ${lead.name}, דיברנו לפני כמה ימים - רציתי לבדוק אם זה עדיין רלוונטי עבורך?`;

    try {
      await sendWhatsApp(lead.phone, message);
      insertStmt.run(lead.itemId, lead.phone, lead.name, lead.lastCallDate);
      sent++;
    } catch (err) {
      logger.error({ err, itemId: lead.itemId }, "Follow-up send failed");
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  logger.info({ sent, skipped }, "Follow-up check complete");
}
