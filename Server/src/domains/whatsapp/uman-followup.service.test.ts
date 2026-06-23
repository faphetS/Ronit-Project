import { describe, it, expect, vi, beforeEach } from "vitest";

const ENV = vi.hoisted(() => ({
  WA_FOLLOWUP_ENABLED: true,
  WA_FOLLOWUP_3D: "3d {name}",
  WA_FOLLOWUP_10D: "10d {name}",
  WA_FOLLOWUP_FLIGHT: "flight {flight_date}",
  WA_FOLLOWUP_PACING_MS: 0,
  WA_FOLLOWUP_UNIT_MS: 86_400_000, // 1 day, so sqliteDaysAgo(n) → n units
  WA_FOLLOWUP_MAX_PER_RUN: 0, // unlimited by default; override per-test
}));
vi.mock("../../config/env.js", () => ({ env: ENV }));
vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../config/db.js", () => ({
  getWaFollowupState: vi.fn(),
  markSeenInFollowupGroup: vi.fn(),
  markFollowupStageSent: vi.fn(),
  resetFollowupState: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));
vi.mock("../monday/monday.service.js", () => ({ getUmanFollowupLeads: vi.fn() }));
vi.mock("./uman-welcome.service.js", () => ({ isAllowed: vi.fn().mockReturnValue(true) }));
// Keep real toMsisdn + isValidMsisdn; mock only the network send.
vi.mock("./whatsapp.gateway.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./whatsapp.gateway.js")>()),
  sendGatewayMessage: vi.fn().mockResolvedValue(true),
}));
vi.mock("./whatsapp.history.js", () => ({
  getLastWaActivityMs: vi.fn().mockResolvedValue(null),
}));

import {
  runUmanFollowups,
  parseFlightDate,
  ymdMinusDays,
  flightReminderDue,
  sqliteUtcToMs,
} from "./uman-followup.service.js";
import * as db from "../../config/db.js";
import * as monday from "../monday/monday.service.js";
import * as welcome from "./uman-welcome.service.js";
import * as gateway from "./whatsapp.gateway.js";
import * as history from "./whatsapp.history.js";
import type { WaFollowupState } from "../../config/db.js";

const sqliteDaysAgo = (n: number): string =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 19).replace("T", " ");

const dmyInDays = (n: number): string => {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

const state = (o: Partial<WaFollowupState> = {}): WaFollowupState => ({
  monday_item_id: "1",
  phone: "0521234567",
  group_first_seen_at: null,
  replied_at: null,
  sent_3d_at: null,
  sent_10d_at: null,
  sent_flight_at: null,
  ...o,
});

const lead = (o: Partial<{ itemId: string; name: string; phone: string | null; flightDateRaw: string | null }> = {}) => ({
  itemId: "1",
  name: "דנה",
  phone: "0521234567" as string | null,
  flightDateRaw: null as string | null,
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  ENV.WA_FOLLOWUP_ENABLED = true;
  ENV.WA_FOLLOWUP_MAX_PER_RUN = 0;
  vi.mocked(welcome.isAllowed).mockReturnValue(true);
  vi.mocked(gateway.sendGatewayMessage).mockResolvedValue(true);
  vi.mocked(history.getLastWaActivityMs).mockResolvedValue(null);
  vi.mocked(monday.getUmanFollowupLeads).mockResolvedValue([lead()]);
  vi.mocked(db.getWaFollowupState).mockReturnValue(state());
  // Default: lead "1" was already in the group last run (continuous member), so the
  // engine keeps its clock instead of resetting it.
  vi.mocked(db.getSetting).mockReturnValue('["1"]');
});

// ---- pure helpers -------------------------------------------------------------

describe("parseFlightDate", () => {
  it("parses DD/MM/YYYY → YYYY-MM-DD and rejects junk", () => {
    expect(parseFlightDate("28/07/2026")).toBe("2026-07-28");
    expect(parseFlightDate("1/3/2026")).toBe("2026-03-01");
    expect(parseFlightDate("31/02/2026")).toBeNull(); // impossible date
    expect(parseFlightDate("2026-07-28")).toBeNull(); // ISO order, not DD-first
    expect(parseFlightDate("")).toBeNull();
    expect(parseFlightDate(null)).toBeNull();
  });

  it("is lenient about real-world entry: dots/dashes, 2-digit year, RTL marks, spaces", () => {
    expect(parseFlightDate("28.07.2026")).toBe("2026-07-28"); // dots
    expect(parseFlightDate("28-07-2026")).toBe("2026-07-28"); // dashes
    expect(parseFlightDate("5/8/26")).toBe("2026-08-05"); // 2-digit year
    expect(parseFlightDate("‏28/07/2026")).toBe("2026-07-28"); // leading RTL mark
    expect(parseFlightDate("28 / 07 / 2026")).toBe("2026-07-28"); // stray spaces
    expect(parseFlightDate("hello")).toBeNull();
  });
});

describe("ymdMinusDays", () => {
  it("subtracts days, crossing months", () => {
    expect(ymdMinusDays("2026-07-28", 14)).toBe("2026-07-14");
    expect(ymdMinusDays("2026-07-10", 14)).toBe("2026-06-26");
  });
});

describe("flightReminderDue (window [flight-14, flight])", () => {
  it("fires inside the window, not before/after, not when empty", () => {
    expect(flightReminderDue("28/07/2026", "2026-07-14")).toBe(true); // == window start
    expect(flightReminderDue("28/07/2026", "2026-07-20")).toBe(true); // mid window
    expect(flightReminderDue("28/07/2026", "2026-07-28")).toBe(true); // == flight day
    expect(flightReminderDue("28/07/2026", "2026-07-13")).toBe(false); // too early
    expect(flightReminderDue("28/07/2026", "2026-07-29")).toBe(false); // after flight
    expect(flightReminderDue(null, "2026-07-20")).toBe(false);
    expect(flightReminderDue("garbage", "2026-07-20")).toBe(false);
  });
});

describe("sqliteUtcToMs", () => {
  it("parses a SQLite UTC string; null/junk → 0", () => {
    expect(sqliteUtcToMs("2026-06-19 10:00:00")).toBe(Date.parse("2026-06-19T10:00:00Z"));
    expect(sqliteUtcToMs(null)).toBe(0);
    expect(sqliteUtcToMs("not-a-date")).toBe(0);
  });
});

// ---- engine: master switch ----------------------------------------------------

describe("runUmanFollowups — master switch", () => {
  it("disabled → does not even scan the group", async () => {
    ENV.WA_FOLLOWUP_ENABLED = false;
    await runUmanFollowups();
    expect(monday.getUmanFollowupLeads).not.toHaveBeenCalled();
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });

  it("a second run while one is in progress is skipped (no overlap)", async () => {
    let release: () => void = () => {};
    vi.mocked(monday.getUmanFollowupLeads).mockReturnValue(
      new Promise((r) => {
        release = () => r([]);
      }),
    );
    const p1 = runUmanFollowups();
    const p2 = runUmanFollowups(); // should early-return because a run is active
    release();
    await Promise.all([p1, p2]);
    expect(monday.getUmanFollowupLeads).toHaveBeenCalledTimes(1);
  });
});

// ---- engine: drag-in / re-entry resets the cycle ------------------------------

describe("runUmanFollowups — reset on (re)entry", () => {
  it("lead absent last run (just dragged in) → state reset, not just 'seen'", async () => {
    vi.mocked(db.getSetting).mockReturnValue("[]"); // previous run had no members
    await runUmanFollowups();
    expect(db.resetFollowupState).toHaveBeenCalledWith("1", "0521234567", expect.any(String));
    expect(db.markSeenInFollowupGroup).not.toHaveBeenCalled();
  });

  it("continuous member (in last run) → seen, NOT reset (keeps its clock)", async () => {
    vi.mocked(db.getSetting).mockReturnValue('["1"]');
    await runUmanFollowups();
    expect(db.markSeenInFollowupGroup).toHaveBeenCalledWith("1", "0521234567");
    expect(db.resetFollowupState).not.toHaveBeenCalled();
  });

  it("saves the current membership snapshot for next run", async () => {
    await runUmanFollowups();
    expect(db.setSetting).toHaveBeenCalledWith("uman_followup_group_members", '["1"]');
  });
});

// ---- engine: history-anchored (re)entry ---------------------------------------

describe("runUmanFollowups — history-anchored (re)entry", () => {
  it("anchors the clock to the lead's last WhatsApp message time (wa_history)", async () => {
    vi.mocked(db.getSetting).mockReturnValue("[]"); // just dragged in → reset branch
    const lastMs = Date.UTC(2026, 5, 18, 9, 30, 0); // 2026-06-18 09:30:00 UTC
    vi.mocked(history.getLastWaActivityMs).mockResolvedValue(lastMs);
    await runUmanFollowups();
    expect(history.getLastWaActivityMs).toHaveBeenCalledWith("0521234567");
    expect(db.resetFollowupState).toHaveBeenCalledWith("1", "0521234567", "2026-06-18 09:30:00");
  });

  it("empty history → anchor falls back to now (reset still called)", async () => {
    vi.mocked(db.getSetting).mockReturnValue("[]");
    vi.mocked(history.getLastWaActivityMs).mockResolvedValue(null);
    await runUmanFollowups();
    expect(history.getLastWaActivityMs).toHaveBeenCalledWith("0521234567");
    expect(db.resetFollowupState).toHaveBeenCalledWith("1", "0521234567", expect.any(String));
  });

  it("not allowlisted → no history call, anchor = now", async () => {
    vi.mocked(db.getSetting).mockReturnValue("[]");
    vi.mocked(welcome.isAllowed).mockReturnValue(false);
    await runUmanFollowups();
    expect(history.getLastWaActivityMs).not.toHaveBeenCalled();
    expect(db.resetFollowupState).toHaveBeenCalledWith("1", "0521234567", expect.any(String));
  });
});

// ---- engine: inactivity nudges (silent leads) ---------------------------------

describe("runUmanFollowups — inactivity nudges", () => {
  it("4 days silent, nothing sent → 3d nudge + mark", async () => {
    vi.mocked(db.getWaFollowupState).mockReturnValue(state({ group_first_seen_at: sqliteDaysAgo(4) }));
    await runUmanFollowups();
    expect(gateway.sendGatewayMessage).toHaveBeenCalledTimes(1);
    expect(gateway.sendGatewayMessage).toHaveBeenCalledWith("972521234567", "3d דנה");
    expect(db.markFollowupStageSent).toHaveBeenCalledWith("1", "3d");
  });

  it("11 days silent, nothing sent → 10d nudge AND retires the un-sent 3d", async () => {
    vi.mocked(db.getWaFollowupState).mockReturnValue(state({ group_first_seen_at: sqliteDaysAgo(11) }));
    await runUmanFollowups();
    expect(gateway.sendGatewayMessage).toHaveBeenCalledTimes(1);
    expect(gateway.sendGatewayMessage).toHaveBeenCalledWith("972521234567", "10d דנה");
    expect(db.markFollowupStageSent).toHaveBeenCalledWith("1", "10d");
    expect(db.markFollowupStageSent).toHaveBeenCalledWith("1", "3d"); // retired
  });

  it("2 days silent → no nudge", async () => {
    vi.mocked(db.getWaFollowupState).mockReturnValue(state({ group_first_seen_at: sqliteDaysAgo(2) }));
    await runUmanFollowups();
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });

  it("4 days but 3d already sent → no nudge", async () => {
    vi.mocked(db.getWaFollowupState).mockReturnValue(
      state({ group_first_seen_at: sqliteDaysAgo(4), sent_3d_at: sqliteDaysAgo(1) }),
    );
    await runUmanFollowups();
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });
});

// ---- engine: reply HALTS the funnel -------------------------------------------

describe("runUmanFollowups — a reply halts the funnel", () => {
  it("replied lead, 4 days 'silent' since entry → no nudge (engaged)", async () => {
    vi.mocked(db.getWaFollowupState).mockReturnValue(
      state({ group_first_seen_at: sqliteDaysAgo(20), replied_at: sqliteDaysAgo(1) }),
    );
    await runUmanFollowups();
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });

  it("replied lead gets NO flight reminder either (reply ends the funnel)", async () => {
    vi.mocked(monday.getUmanFollowupLeads).mockResolvedValue([lead({ flightDateRaw: dmyInDays(10) })]);
    vi.mocked(db.getWaFollowupState).mockReturnValue(
      state({ group_first_seen_at: sqliteDaysAgo(20), replied_at: sqliteDaysAgo(2) }),
    );
    await runUmanFollowups();
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });
});

// ---- engine: flight reminder is terminal + top priority -----------------------

describe("runUmanFollowups — flight reminder (terminal, priority)", () => {
  it("flight within 14 days → reminder sent + marked", async () => {
    const flight = dmyInDays(10);
    vi.mocked(monday.getUmanFollowupLeads).mockResolvedValue([lead({ flightDateRaw: flight })]);
    vi.mocked(db.getWaFollowupState).mockReturnValue(state({ group_first_seen_at: sqliteDaysAgo(0) }));
    await runUmanFollowups();
    expect(gateway.sendGatewayMessage).toHaveBeenCalledWith("972521234567", `flight ${flight}`);
    expect(db.markFollowupStageSent).toHaveBeenCalledWith("1", "flight");
  });

  it("flight window PREEMPTS inactivity — 11d silent + flight due → only flight, not 10d", async () => {
    const flight = dmyInDays(10);
    vi.mocked(monday.getUmanFollowupLeads).mockResolvedValue([lead({ flightDateRaw: flight })]);
    vi.mocked(db.getWaFollowupState).mockReturnValue(state({ group_first_seen_at: sqliteDaysAgo(11) }));
    await runUmanFollowups();
    expect(gateway.sendGatewayMessage).toHaveBeenCalledTimes(1);
    expect(gateway.sendGatewayMessage).toHaveBeenCalledWith("972521234567", `flight ${flight}`);
    expect(db.markFollowupStageSent).toHaveBeenCalledWith("1", "flight");
    expect(db.markFollowupStageSent).not.toHaveBeenCalledWith("1", "10d");
  });

  it("dragged in 13 days before the flight → reminder fires that same run", async () => {
    const flight = dmyInDays(13);
    vi.mocked(db.getSetting).mockReturnValue("[]"); // just dragged in (absent last run)
    vi.mocked(monday.getUmanFollowupLeads).mockResolvedValue([lead({ flightDateRaw: flight })]);
    vi.mocked(db.getWaFollowupState).mockReturnValue(
      state({ group_first_seen_at: sqliteDaysAgo(0), sent_flight_at: null }),
    );
    await runUmanFollowups();
    expect(db.resetFollowupState).toHaveBeenCalledWith("1", "0521234567", expect.any(String));
    expect(gateway.sendGatewayMessage).toHaveBeenCalledWith("972521234567", `flight ${flight}`);
    expect(db.markFollowupStageSent).toHaveBeenCalledWith("1", "flight");
  });

  it("flight already sent → lead is done, nothing fires even with 20d inactivity", async () => {
    vi.mocked(monday.getUmanFollowupLeads).mockResolvedValue([lead({ flightDateRaw: dmyInDays(10) })]);
    vi.mocked(db.getWaFollowupState).mockReturnValue(
      state({ group_first_seen_at: sqliteDaysAgo(20), sent_flight_at: sqliteDaysAgo(1) }),
    );
    await runUmanFollowups();
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });

  it("flight 20 days out → no reminder (and 0d inactivity → nothing)", async () => {
    vi.mocked(monday.getUmanFollowupLeads).mockResolvedValue([lead({ flightDateRaw: dmyInDays(20) })]);
    vi.mocked(db.getWaFollowupState).mockReturnValue(state({ group_first_seen_at: sqliteDaysAgo(0) }));
    await runUmanFollowups();
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });

  it("empty flight date → no reminder (matches 'empty column → no date follow-up')", async () => {
    vi.mocked(monday.getUmanFollowupLeads).mockResolvedValue([lead({ flightDateRaw: null })]);
    vi.mocked(db.getWaFollowupState).mockReturnValue(state({ group_first_seen_at: sqliteDaysAgo(0) }));
    await runUmanFollowups();
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });
});

// ---- engine: gating + send failures -------------------------------------------

describe("runUmanFollowups — gating + send failures", () => {
  it("send fails → stage NOT marked (retries next run)", async () => {
    vi.mocked(gateway.sendGatewayMessage).mockResolvedValue(false);
    vi.mocked(db.getWaFollowupState).mockReturnValue(state({ group_first_seen_at: sqliteDaysAgo(4) }));
    await runUmanFollowups();
    expect(gateway.sendGatewayMessage).toHaveBeenCalledTimes(1);
    expect(db.markFollowupStageSent).not.toHaveBeenCalled();
  });

  it("not allowlisted → no send, no mark", async () => {
    vi.mocked(welcome.isAllowed).mockReturnValue(false);
    vi.mocked(db.getWaFollowupState).mockReturnValue(state({ group_first_seen_at: sqliteDaysAgo(4) }));
    await runUmanFollowups();
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
    expect(db.markFollowupStageSent).not.toHaveBeenCalled();
  });

  it("invalid msisdn (IL landline) → no send", async () => {
    vi.mocked(monday.getUmanFollowupLeads).mockResolvedValue([lead({ phone: "0312345678" })]);
    vi.mocked(db.getWaFollowupState).mockReturnValue(state({ group_first_seen_at: sqliteDaysAgo(4) }));
    await runUmanFollowups();
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });
});

// ---- engine: per-run send cap -------------------------------------------------

describe("runUmanFollowups — per-run cap (WA_FOLLOWUP_MAX_PER_RUN)", () => {
  it("cap=2 with 3 eligible leads → exactly 2 sends, 3rd lead deferred", async () => {
    ENV.WA_FOLLOWUP_MAX_PER_RUN = 2;

    const leads = [
      lead({ itemId: "10", phone: "0521234561", name: "אלה" }),
      lead({ itemId: "11", phone: "0521234562", name: "בת-שבע" }),
      lead({ itemId: "12", phone: "0521234563", name: "גאולה" }),
    ];
    vi.mocked(monday.getUmanFollowupLeads).mockResolvedValue(leads);
    // All three are continuous members (skip the reset branch).
    vi.mocked(db.getSetting).mockReturnValue('["10","11","12"]');
    // All three are 4 days old → due for the 3d nudge, nothing yet sent.
    vi.mocked(db.getWaFollowupState).mockReturnValue(
      state({ group_first_seen_at: sqliteDaysAgo(4) }),
    );

    await runUmanFollowups();

    expect(gateway.sendGatewayMessage).toHaveBeenCalledTimes(2);
  });

  it("cap=0 (unlimited) with 3 eligible leads → all 3 sends", async () => {
    ENV.WA_FOLLOWUP_MAX_PER_RUN = 0;

    const leads = [
      lead({ itemId: "20", phone: "0521234561", name: "דינה" }),
      lead({ itemId: "21", phone: "0521234562", name: "הדס" }),
      lead({ itemId: "22", phone: "0521234563", name: "ורד" }),
    ];
    vi.mocked(monday.getUmanFollowupLeads).mockResolvedValue(leads);
    vi.mocked(db.getSetting).mockReturnValue('["20","21","22"]');
    vi.mocked(db.getWaFollowupState).mockReturnValue(
      state({ group_first_seen_at: sqliteDaysAgo(4) }),
    );

    await runUmanFollowups();

    expect(gateway.sendGatewayMessage).toHaveBeenCalledTimes(3);
  });
});
