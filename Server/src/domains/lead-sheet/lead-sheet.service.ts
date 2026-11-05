import { logger } from "../../config/logger.js";
import type { Queryable } from "../../config/pg.js";
import { MondayRateLimitError } from "../monday/monday.client.js";
import { toMsisdn } from "../whatsapp/whatsapp.gateway.js";
import { leadNoteHtml, type OldCard } from "./lead-sheet.note.js";
import { sheetLeads, type SheetLead } from "./lead-sheet.parse.js";

/**
 * Copies Meta lead-form leads from Google Sheets (a tab per form) into Monday's CRM board, for forms that
 * have no route into Monday of their own (Ronit's Hanukkah forms, 2026-11). Each lead is added once, to the
 * new-leads group, unless the CRM board already has her phone (the Instagram chat flow brings
 * many of the Instagram ones by itself). Monday stays the source; the dashboard copies it from there.
 */

export interface LeadSheetDeps {
  fetchCsv(): Promise<string>;
  /** The dashboard's copy of Monday: a free first look before asking Monday. Null when it's off. */
  db: Queryable | null;
  monday: {
    /** The live CRM board's item with this phone, or null. */
    findOnLiveBoard(phone: string): Promise<string | null>;
    /** Adds her to the new-leads group; returns the item id. */
    createLead(lead: SheetLead): Promise<string>;
    /** Posts a Monday update (HTML) on the item. */
    addNote(itemId: string, html: string): Promise<void>;
  };
  /** Meta lead ids already dealt with, so a lead is never looked at twice. */
  handled: { has(leadId: string): boolean; mark(leadId: string): void };
  now: () => Date;
}

/**
 * How long a lead waits before it's looked at: the Instagram chat flow adds many Instagram form
 * leads to Monday within minutes, and adding them again would make a second row.
 */
export const SETTLE_MS = 15 * 60_000;

export interface SheetSyncResult {
  leads: number;
  added: Array<{ leadId: string; itemId: string }>;
  alreadyInMonday: number;
  /** Meta's test lead and rows without a phone. */
  skipped: number;
  /** Too new: looked at on a later run. */
  waiting: number;
}

async function liveLeadInCopy(db: Queryable, phone: string): Promise<boolean> {
  const { rows } = await db.query("SELECT 1 FROM leads WHERE phone = $1 AND NOT archived AND removed_at IS NULL LIMIT 1", [toMsisdn(phone)]);
  return rows.length > 0;
}

/** Her card on the old CRM board, when she's a returning person. */
async function oldCardInCopy(db: Queryable, phone: string): Promise<OldCard | null> {
  const { rows } = await db.query<{ board: string; since: Date }>(
    `SELECT b.name AS board, min(l.created_at) AS since FROM leads l JOIN monday_boards b ON b.id = l.monday_board_id
     WHERE l.phone = $1 AND l.archived AND l.removed_at IS NULL GROUP BY b.name ORDER BY since LIMIT 1`,
    [toMsisdn(phone)],
  );
  return rows[0] ? { board: rows[0].board.trim(), since: rows[0].since } : null;
}

/**
 * Runs `sync` for each sheet (one per lead form), in order. A sheet that fails, say one nobody can open any more,
 * doesn't stop the others; the first failure is thrown once they're done, so the job still reports it. A Monday rate
 * limit stops at once, since every sheet after it would hit the same limit.
 */
export async function forEachSheet(urls: readonly string[], sync: (url: string, sheet: number) => Promise<void>): Promise<void> {
  const failures: unknown[] = [];
  for (const [index, url] of urls.entries()) {
    try {
      await sync(url, index + 1);
    } catch (err) {
      if (err instanceof MondayRateLimitError) throw err;
      logger.warn({ err, sheet: index + 1 }, "Lead sheet: one sheet failed; the others still ran");
      failures.push(err);
    }
  }
  if (failures.length > 0) throw failures[0];
}

/** One pass over a sheet. Stops at the first Monday error (a rate limit): the rest wait for the next run. */
export async function syncLeadSheet(deps: LeadSheetDeps): Promise<SheetSyncResult> {
  const leads = sheetLeads(await deps.fetchCsv());
  const result: SheetSyncResult = { leads: leads.length, added: [], alreadyInMonday: 0, skipped: 0, waiting: 0 };
  const now = deps.now().getTime();

  for (const lead of leads) {
    if (deps.handled.has(lead.leadId)) continue;
    if (lead.test || !lead.phone) {
      deps.handled.mark(lead.leadId);
      result.skipped += 1;
      continue;
    }
    if (now - lead.createdAt.getTime() < SETTLE_MS) {
      result.waiting += 1;
      continue;
    }
    // The copy is up to 2 hours old, so a miss there is checked in Monday itself.
    if ((deps.db && (await liveLeadInCopy(deps.db, lead.phone))) || (await deps.monday.findOnLiveBoard(lead.phone))) {
      deps.handled.mark(lead.leadId);
      result.alreadyInMonday += 1;
      continue;
    }
    const oldCard = deps.db ? await oldCardInCopy(deps.db, lead.phone) : null;
    const itemId = await deps.monday.createLead(lead);
    // Marked before the note: a failed note must never add her a second time.
    deps.handled.mark(lead.leadId);
    result.added.push({ leadId: lead.leadId, itemId });
    try {
      await deps.monday.addNote(itemId, leadNoteHtml(lead, oldCard));
    } catch (err) {
      logger.warn({ err, itemId }, "Lead sheet: lead added to Monday, but its note failed");
    }
  }
  return result;
}
