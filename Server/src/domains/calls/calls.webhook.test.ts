import { describe, it, expect, vi, beforeEach } from "vitest";

// Same convention as calls.recording.test.ts: mock the db-backed layers (the
// better-sqlite3 native binding isn't built for the local runner).
vi.mock("../../config/db.js", () => ({
  enqueuePendingRecording: vi.fn(),
  deletePendingRecording: vi.fn(),
  bumpPendingRecording: vi.fn(),
  getPendingRecordingByCallId: vi.fn(),
  saveRecordingSummary: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));
vi.mock("../../lib/dedup.js", () => ({
  isMessageProcessed: vi.fn().mockReturnValue(false),
  markMessageProcessed: vi.fn(),
}));
vi.mock("../monday/monday.service.js", () => ({
  addNoteToItem: vi.fn(),
  findLeadByPhone: vi.fn(),
  incrementCallsColumn: vi.fn(),
  updateLastCallDate: vi.fn(),
}));

import { handleSalestrailCall } from "./calls.service.js";
import { findLeadByPhone, incrementCallsColumn } from "../monday/monday.service.js";
import { enqueuePendingRecording } from "../../config/db.js";
import type { SalestrailWebhookPayload } from "./calls.validator.js";

const hoursAgo = (h: number): string => new Date(Date.now() - h * 3_600_000).toISOString();

function payload(overrides: Partial<SalestrailWebhookPayload> = {}): SalestrailWebhookPayload {
  return {
    userId: "user-2",
    userName: "ortal",
    userEmail: "user2@example.com",
    userPhone: "+972500000002",
    callId: "call-1",
    source: "android",
    sourceDetail: "SIM",
    startTime: hoursAgo(1),
    duration: 120,
    answered: true,
    inbound: false,
    number: "0501234567",
    formattedNumber: "+972501234567",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleSalestrailCall — stale call guard (Salestrail backsync)", () => {
  it("skips Monday entirely for a call older than SALESTRAIL_MAX_CALL_AGE_HOURS", async () => {
    const result = await handleSalestrailCall(payload({ startTime: hoursAgo(12 * 24) }));

    expect(result).toEqual({ matched: false, reason: "stale", phone: "+972501234567" });
    expect(vi.mocked(findLeadByPhone)).not.toHaveBeenCalled();
    expect(vi.mocked(enqueuePendingRecording)).not.toHaveBeenCalled();
  });

  it("processes a recent call normally", async () => {
    vi.mocked(findLeadByPhone).mockResolvedValueOnce({ itemId: "item1", name: "lead" } as never);

    const result = await handleSalestrailCall(payload({ startTime: hoursAgo(5) }));

    expect(result.matched).toBe(true);
    expect(vi.mocked(incrementCallsColumn)).toHaveBeenCalledWith("item1");
    expect(vi.mocked(enqueuePendingRecording)).toHaveBeenCalledWith("call-1", "item1", expect.any(String));
  });

  it("fails open when startTime is unparseable", async () => {
    vi.mocked(findLeadByPhone).mockResolvedValueOnce(null as never);

    const result = await handleSalestrailCall(payload({ startTime: "garbage" }));

    expect(result.reason).toBe("no_match");
    expect(vi.mocked(findLeadByPhone)).toHaveBeenCalledWith("+972501234567");
  });
});
