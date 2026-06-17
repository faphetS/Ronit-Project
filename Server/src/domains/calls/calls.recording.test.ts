import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirror the project convention: mock the db layer (better-sqlite3 native binding
// isn't built for the local runner). An in-memory settings map simulates the
// latest-call-time marker persisting across calls.
const { settings } = vi.hoisted(() => ({ settings: new Map<string, string>() }));

vi.mock("../../config/db.js", () => ({
  getSetting: vi.fn((k: string) => settings.get(k) ?? null),
  setSetting: vi.fn((k: string, v: string) => {
    settings.set(k, v);
  }),
  enqueuePendingRecording: vi.fn(),
  deletePendingRecording: vi.fn(),
  bumpPendingRecording: vi.fn(),
  getPendingRecordingByCallId: vi.fn(),
}));

vi.mock("./salestrail.client.js", () => ({
  salestrailClient: {
    tryDownloadOnce: vi.fn().mockResolvedValue({ status: "ok", buffer: Buffer.from("audio") }),
  },
}));
vi.mock("../../lib/transcribe.js", () => ({
  transcribeAudio: vi.fn().mockResolvedValue({
    summary: "סיכום שיחה",
    customer_name: null,
    service_interest: "uman",
    key_points: [],
    follow_up_needed: false,
  }),
}));
vi.mock("../monday/monday.service.js", () => ({
  addNoteToItem: vi.fn().mockResolvedValue(undefined),
  findLeadByPhone: vi.fn(),
  incrementCallsColumn: vi.fn(),
  updateLastCallDate: vi.fn(),
}));

import { processRecordingJob, toEpochMs } from "./calls.service.js";
import { addNoteToItem } from "../monday/monday.service.js";
import { deletePendingRecording } from "../../config/db.js";
import type { PendingRecording } from "../../config/db.js";

function job(callId: string, itemId: string, callTime: string): PendingRecording {
  return { id: 1, call_id: callId, item_id: itemId, call_time: callTime, attempt_count: 0, created_at: "" };
}

beforeEach(() => {
  settings.clear();
  vi.clearAllMocks();
});

describe("toEpochMs", () => {
  it("parses ISO strings, epoch-seconds, and epoch-millis", () => {
    expect(toEpochMs("2026-06-17T11:00:00Z")).toBe(Date.parse("2026-06-17T11:00:00Z"));
    expect(toEpochMs("1750000000")).toBe(1750000000 * 1000); // 10-digit = seconds
    expect(toEpochMs("1750000000000")).toBe(1750000000000); // 13-digit = millis
    expect(toEpochMs("garbage")).toBe(0);
  });
});

describe("latest-call-wins ordering guard", () => {
  it("an older call's late recording does not overwrite a newer call's summary", async () => {
    await processRecordingJob(job("callB", "item1", "2026-06-17T11:00:00Z")); // newer first
    expect(vi.mocked(addNoteToItem)).toHaveBeenCalledTimes(1);
    expect(settings.get("last_summary_call_time:item1")).toBe(String(Date.parse("2026-06-17T11:00:00Z")));

    await processRecordingJob(job("callA", "item1", "2026-06-17T10:00:00Z")); // older, late
    // Not written again, marker unchanged, but row still cleaned up.
    expect(vi.mocked(addNoteToItem)).toHaveBeenCalledTimes(1);
    expect(settings.get("last_summary_call_time:item1")).toBe(String(Date.parse("2026-06-17T11:00:00Z")));
    expect(vi.mocked(deletePendingRecording)).toHaveBeenCalled();
  });

  it("a newer call overwrites an older summary", async () => {
    await processRecordingJob(job("callA", "item2", "2026-06-17T10:00:00Z"));
    await processRecordingJob(job("callB", "item2", "2026-06-17T11:00:00Z"));
    expect(vi.mocked(addNoteToItem)).toHaveBeenCalledTimes(2);
    expect(settings.get("last_summary_call_time:item2")).toBe(String(Date.parse("2026-06-17T11:00:00Z")));
  });
});
