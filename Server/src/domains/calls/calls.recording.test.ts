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
  saveRecordingSummary: vi.fn(),
}));

vi.mock("./salestrail.client.js", () => ({
  salestrailClient: {
    tryDownloadOnce: vi.fn().mockResolvedValue({ status: "ok", buffer: Buffer.from("audio") }),
  },
}));
vi.mock("../../lib/transcribe.js", () => ({
  transcribeAudio: vi.fn().mockResolvedValue({
    summary: "סיכום שיחה",
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
import { salestrailClient } from "./salestrail.client.js";
import { transcribeAudio } from "../../lib/transcribe.js";
import { deletePendingRecording, bumpPendingRecording } from "../../config/db.js";
import type { PendingRecording } from "../../config/db.js";

function job(callId: string, itemId: string, callTime: string, summary: string | null = null): PendingRecording {
  return { id: 1, call_id: callId, item_id: itemId, call_time: callTime, summary, attempt_count: 0, created_at: "" };
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
    expect(toEpochMs("garbage")).toBeNull();
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

describe("uncertain timestamp fallback", () => {
  it("a job with an unparseable call_time still writes the summary (Date.now fallback + < guard)", async () => {
    // Seed a prior marker so the < guard is exercised; Date.now() >> any reasonable shownMs
    settings.set("last_summary_call_time:item3", String(Date.parse("2026-06-17T09:00:00Z")));

    await processRecordingJob(job("callGarbage", "item3", "garbage"));

    expect(vi.mocked(addNoteToItem)).toHaveBeenCalledOnce();
    expect(vi.mocked(deletePendingRecording)).toHaveBeenCalled();
  });
});

describe("Monday write failure", () => {
  it("bumps the row and does not delete it or update the marker", async () => {
    vi.mocked(addNoteToItem).mockRejectedValueOnce(new Error("Monday API 500"));

    await processRecordingJob(job("callFail", "item4", "2026-06-17T12:00:00Z"));

    expect(vi.mocked(bumpPendingRecording)).toHaveBeenCalled();
    expect(vi.mocked(deletePendingRecording)).not.toHaveBeenCalled();
    expect(settings.get("last_summary_call_time:item4")).toBeUndefined();
  });
});

describe("older call does not overwrite a newer summary (latest-call-wins)", () => {
  it("skips addNoteToItem and deletes the row when a newer summary marker is already set", async () => {
    const newerMs = Date.parse("2026-06-17T12:00:00Z");
    settings.set("last_summary_call_time:item1", String(newerMs));

    vi.mocked(salestrailClient.tryDownloadOnce).mockResolvedValueOnce({ status: "ok", buffer: Buffer.from("audio") });
    vi.mocked(transcribeAudio).mockResolvedValueOnce({
      summary: "old call summary",
    });

    await processRecordingJob(job("callOld", "item1", "2026-06-17T11:00:00Z"));

    expect(vi.mocked(addNoteToItem)).not.toHaveBeenCalled();
    expect(vi.mocked(deletePendingRecording)).toHaveBeenCalled();
    expect(settings.get("last_summary_call_time:item1")).toBe(String(newerMs));
  });
});

describe("cached summary reuse", () => {
  it("skips download and transcription when summary is already stored", async () => {
    await processRecordingJob(job("callCached", "item5", "2026-06-17T13:00:00Z", "כבר תומלל"));

    expect(vi.mocked(salestrailClient.tryDownloadOnce)).not.toHaveBeenCalled();
    expect(vi.mocked(transcribeAudio)).not.toHaveBeenCalled();
    expect(vi.mocked(addNoteToItem)).toHaveBeenCalledWith("item5", "כבר תומלל");
    expect(vi.mocked(deletePendingRecording)).toHaveBeenCalled();
  });
});
