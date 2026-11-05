import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { crmDatabase } from "../../db/startup.js";
import { scheduleExclusive } from "../../lib/cron-job.js";
import { AppError } from "../../lib/errors.js";
import { israelDay } from "../../lib/israel-time.js";
import { isMessageProcessed, markMessageProcessed } from "../../lib/dedup.js";
import { gql } from "../monday/monday.client.js";
import { createLeadRow, findLeadByPhone } from "../monday/monday.service.js";
import { forEachSheet, syncLeadSheet } from "./lead-sheet.service.js";

/** Every 10 minutes, all day: form leads come at any hour. */
export const LEAD_SHEET_SCHEDULE = "*/10 * * * *";

/** The sheet as CSV ("anyone with the link can view", so no sign-in). */
async function fetchSheet(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new AppError(502, `The lead sheet answered ${res.status}`, "LEAD_SHEET_UNREADABLE");
  return res.text();
}

async function postUpdate(itemId: string, body: string): Promise<void> {
  await gql<{ create_update: { id: string } }>("mutation ($item: ID!, $body: String!) { create_update(item_id: $item, body: $body) { id } }", {
    item: itemId,
    body,
  });
}

/** Copies new form leads from the lead sheets into Monday every 10 minutes (LEAD_SHEET_ENABLED, LEAD_SHEET_CSV_URL). */
export function startLeadSheetSync(): void {
  const urls = env.LEAD_SHEET_CSV_URL;
  if (!env.LEAD_SHEET_ENABLED || urls.length === 0) {
    logger.info("Lead sheet sync off (LEAD_SHEET_ENABLED / LEAD_SHEET_CSV_URL)");
    return;
  }
  scheduleExclusive(LEAD_SHEET_SCHEDULE, "Lead sheet sync", async () => {
    const db = await crmDatabase();
    // Meta's lead ids are the same in every sheet, so a lead that shows up in two sheets is still handled once.
    await forEachSheet(urls, async (url, sheet) => {
      const result = await syncLeadSheet({
        fetchCsv: () => fetchSheet(url),
        db,
        monday: {
          findOnLiveBoard: async (phone) => (await findLeadByPhone(phone))?.itemId ?? null,
          createLead: async (lead) =>
            (
              await createLeadRow({
                name: lead.fullName || lead.phone || "ליד מטופס מטא",
                phone: lead.phone,
                service: env.LEAD_SHEET_SERVICE,
                source: "lead-sheet",
                email: lead.email ?? undefined,
                inquiryDate: israelDay(lead.createdAt),
                sourceLabel: lead.organic ? env.MONDAY_SOURCE_LABEL_ORGANIC : env.MONDAY_SOURCE_LABEL_PAID,
              })
            ).itemId,
          addNote: postUpdate,
        },
        handled: { has: (id) => isMessageProcessed("lead_sheet", id), mark: (id) => markMessageProcessed("lead_sheet", id) },
        now: () => new Date(),
      });
      if (result.added.length > 0) {
        logger.info({ sheet, added: result.added, alreadyInMonday: result.alreadyInMonday }, "Lead sheet: new form leads added to Monday");
      }
    });
  });
  logger.info({ schedule: LEAD_SHEET_SCHEDULE, sheets: urls.length }, "Lead sheet sync scheduled");
}
