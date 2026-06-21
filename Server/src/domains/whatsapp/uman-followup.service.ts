import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  getWaFollowupState,
  markSeenInFollowupGroup,
  markFollowupStageSent,
  resetFollowupState,
  getSetting,
  setSetting,
} from "../../config/db.js";
import { getUmanFollowupLeads, type UmanFollowupLead } from "../monday/monday.service.js";
import { isAllowed } from "./uman-welcome.service.js";
import { sendGatewayMessage, toMsisdn, isValidMsisdn } from "./whatsapp.gateway.js";
import { getLastWaActivityMs } from "./whatsapp.history.js";

// Inactivity thresholds in UNITS. One unit = env.WA_FOLLOWUP_UNIT_MS (1 day in prod,
// so 3 days / 10 days; set the unit to 1 minute for a fast test → 3 min / 10 min).
const INACTIVITY_3D = 3;
const INACTIVITY_10D = 10;
const FLIGHT_LEAD_DAYS = 14; // send the flight reminder once we're within 2 weeks

type Stage = "3d" | "10d" | "flight";

// --- pure date helpers (exported for unit tests) --------------------------------

/** Today's calendar date in Asia/Jerusalem as YYYY-MM-DD. */
export function todayYmdJerusalem(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

/** Parse a SQLite UTC timestamp ("YYYY-MM-DD HH:MM:SS") to epoch ms (0 if junk). */
export function sqliteUtcToMs(s: string | null | undefined): number {
  if (!s) return 0;
  const ms = Date.parse(`${s.replace(" ", "T")}Z`);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Format epoch ms as a SQLite UTC timestamp ("YYYY-MM-DD HH:MM:SS") — inverse of sqliteUtcToMs. */
export function msToSqliteUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

/** Parse a DD/MM/YYYY flight-date string to YYYY-MM-DD, or null if absent/invalid
 *  (rejects impossible dates like 31/02/2026 via a round-trip check). Lenient about
 *  real-world data entry: strips unicode direction marks (Hebrew Monday text columns
 *  often carry RTL marks) and stray whitespace, accepts "/", ".", or "-" separators,
 *  and a 2- or 4-digit year. */
export function parseFlightDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\u200e\u200f\u202a-\u202e]/g, "").replace(/\s+/g, "").trim();
  const m = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000; // 2-digit year → 20YY
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Subtract `days` from a YYYY-MM-DD date, returning YYYY-MM-DD. */
export function ymdMinusDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

/** The flight reminder is due when today is within [flightDate-14, flightDate].
 *  A window (not exact equality) survives cron gaps and late group additions;
 *  the `<= flightDate` bound stops it firing after the flight has passed. */
export function flightReminderDue(flightDateRaw: string | null, todayStr: string): boolean {
  const flightStr = parseFlightDate(flightDateRaw);
  if (!flightStr) return false;
  const windowStart = ymdMinusDays(flightStr, FLIGHT_LEAD_DAYS);
  return todayStr >= windowStart && todayStr <= flightStr;
}

// --- send + engine --------------------------------------------------------------

function renderTemplate(stage: Stage, lead: UmanFollowupLead): string {
  const template =
    stage === "3d"
      ? env.WA_FOLLOWUP_3D
      : stage === "10d"
        ? env.WA_FOLLOWUP_10D
        : env.WA_FOLLOWUP_FLIGHT;
  return template
    .replace(/\\n/g, "\n")
    .replace(/\{name\}/g, lead.name ?? "")
    .replace(/\{flight_date\}/g, lead.flightDateRaw ?? "");
}

/** Send one follow-up stage. Returns true only on a confirmed gateway send (caller
 *  marks the stage). Every send passes msisdn validation + the allowlist, so while
 *  RONIT_WA_ALLOWED_NUMBERS is gated nothing reaches real leads. A blocked or failed
 *  send is NOT marked, so it retries on the next cron run. */
async function sendFollowup(lead: UmanFollowupLead, stage: Stage): Promise<boolean> {
  if (!lead.phone) return false;
  const to = toMsisdn(lead.phone);
  if (!isValidMsisdn(to)) {
    logger.warn(
      { itemId: lead.itemId, rawPhone: lead.phone, to, stage },
      "Uman follow-up skipped — invalid msisdn (not an IL/PH mobile)",
    );
    return false;
  }
  if (!isAllowed(to)) {
    logger.info({ itemId: lead.itemId, to, stage }, "Uman follow-up skipped — not allowlisted");
    return false;
  }

  const ok = await sendGatewayMessage(to, renderTemplate(stage, lead));
  if (ok) {
    logger.info({ itemId: lead.itemId, to, stage }, "Uman follow-up sent");
  } else {
    logger.error(
      { itemId: lead.itemId, to, stage },
      "Uman follow-up send failed — not marking (retries next run)",
    );
  }
  return ok;
}

const MEMBERS_SETTING_KEY = "uman_followup_group_members";

// In-process re-entrancy guard. A run can take minutes (paced sends); this stops a
// manual trigger from overlapping the scheduled run and double-sending a stage.
let isRunning = false;

/**
 * Daily engine for the Uman follow-up group. The funnel chases SILENT leads only:
 *   - When Ronit (re)adds a lead to the group, a FRESH cycle starts — the clock
 *     restarts and any prior halt/sent flags clear (detected by diffing this run's
 *     members against the previous run's).
 *   - A lead who has replied is engaged → the funnel halts; nothing more fires.
 *   - Within 2 weeks of the flight the reminder fires ALONE (top priority, preempts
 *     the inactivity nudges) and, once sent, ends the funnel.
 *   - Otherwise, at most one inactivity nudge per run (3d then 10d), counted from
 *     group (re)entry.
 * Sends are spaced WA_FOLLOWUP_PACING_MS apart. Self-guards on WA_FOLLOWUP_ENABLED.
 */
export async function runUmanFollowups(): Promise<void> {
  if (!env.WA_FOLLOWUP_ENABLED) {
    logger.info("Uman follow-up cron disabled (WA_FOLLOWUP_ENABLED=false) — skipping");
    return;
  }
  if (isRunning) {
    logger.warn("Uman follow-up already running — skipping overlapping run");
    return;
  }
  isRunning = true;

  try {
    const leads = await getUmanFollowupLeads();
    const todayStr = todayYmdJerusalem();

    // Membership diff: a lead present now but absent on the previous run was just
    // (re)added to the group → start a fresh cycle. Continuous members keep their
    // running clock. First run (no snapshot) → everyone is "new", clocks start now
    // (no big-bang send: ageDays = 0).
    let previousIds: Set<string>;
    try {
      previousIds = new Set(JSON.parse(getSetting(MEMBERS_SETTING_KEY) ?? "[]") as string[]);
    } catch {
      previousIds = new Set();
    }

    // Persist this run's membership BEFORE sending. If the process dies mid-run, the
    // next run sees these leads as continuous (not "new") and won't reset+re-send —
    // critical for the flight reminder, which sends on the same run as a reset.
    setSetting(MEMBERS_SETTING_KEY, JSON.stringify(leads.map((l) => l.itemId)));

    logger.info(
      { count: leads.length, todayStr, knownPrev: previousIds.size },
      "Uman follow-up — scanning group",
    );

    let sent = 0;

    for (const lead of leads) {
      let sentThisLead = false;
      try {
        if (previousIds.has(lead.itemId)) {
          markSeenInFollowupGroup(lead.itemId, lead.phone); // continuous — keep the clock
        } else {
          // (re)entry — fresh cycle. Anchor the clock to the lead's last WhatsApp message
          // (inbound OR outbound, whichever is newest) so the schedule continues from the
          // real conversation instead of "now". Empty history (or not allowlisted) → "now".
          let anchorMs = Date.now();
          let anchorSource = "entry_now";
          if (lead.phone && isAllowed(toMsisdn(lead.phone))) {
            const lastMs = await getLastWaActivityMs(lead.phone);
            if (lastMs !== null) {
              anchorMs = lastMs;
              anchorSource = "wa_history";
            }
          }
          resetFollowupState(lead.itemId, lead.phone, msToSqliteUtc(anchorMs));
          logger.info(
            { itemId: lead.itemId, anchorMs, source: anchorSource },
            "Follow-up clock anchored",
          );
        }

        const state = getWaFollowupState(lead.itemId);

        if (state?.replied_at || state?.sent_flight_at) {
          // Terminal: the lead replied (engaged → handled manually) or already got the
          // final flight reminder. Either way the funnel is over — skip.
        } else {
          // Surface a flight date that's set but unparseable (so a typo / stray RTL
          // mark doesn't silently suppress the business-critical 2-week reminder).
          if (lead.flightDateRaw && !parseFlightDate(lead.flightDateRaw)) {
            logger.warn(
              { itemId: lead.itemId, flightDateRaw: lead.flightDateRaw },
              "Uman follow-up — flight date set but unparseable; no 2-week reminder will fire",
            );
          }

          if (flightReminderDue(lead.flightDateRaw, todayStr)) {
            // Within 2 weeks of the flight: the terminal, top-priority message. It
            // fires ALONE (preempts 3d/10d) and ends the funnel once sent.
            if (await sendFollowup(lead, "flight")) {
              markFollowupStageSent(lead.itemId, "flight");
              sent++;
              sentThisLead = true;
            }
          } else {
            // Inactivity nudges — counted from group (re)entry. At most one per run;
            // if 10d fires we retire an un-sent 3d so it can't fire late later.
            const anchorMs = sqliteUtcToMs(state?.group_first_seen_at);
            const ageUnits =
              anchorMs > 0 ? Math.floor((Date.now() - anchorMs) / env.WA_FOLLOWUP_UNIT_MS) : 0;

            if (ageUnits >= INACTIVITY_10D && !state?.sent_10d_at) {
              if (await sendFollowup(lead, "10d")) {
                markFollowupStageSent(lead.itemId, "10d");
                if (!state?.sent_3d_at) markFollowupStageSent(lead.itemId, "3d");
                sent++;
                sentThisLead = true;
              }
            } else if (ageUnits >= INACTIVITY_3D && !state?.sent_3d_at) {
              if (await sendFollowup(lead, "3d")) {
                markFollowupStageSent(lead.itemId, "3d");
                sent++;
                sentThisLead = true;
              }
            }
          }
        }
      } catch (err) {
        logger.error({ err, itemId: lead.itemId }, "Uman follow-up — lead failed, continuing");
      }

      // Pace only AFTER an actual send so idle leads don't burn the delay.
      if (sentThisLead && env.WA_FOLLOWUP_PACING_MS > 0) {
        await new Promise((r) => setTimeout(r, env.WA_FOLLOWUP_PACING_MS));
      }
    }

    logger.info({ scanned: leads.length, sent }, "Uman follow-up run complete");
  } finally {
    isRunning = false;
  }
}
