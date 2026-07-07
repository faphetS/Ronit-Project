import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/dedup.js", () => ({
  findKnownSender: vi.fn().mockReturnValue(null),
  upsertKnownSender: vi.fn(),
}));

vi.mock("../../config/db.js", () => ({
  enqueueMondayLead: vi.fn(),
}));

vi.mock("../monday/monday.service.js", () => ({
  createLeadRow: vi.fn().mockResolvedValue({ itemId: "item-1" }),
  findLeadByPhoneAllBoards: vi.fn().mockResolvedValue(null),
  updateLeadRow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../whatsapp/uman-welcome.service.js", () => ({
  maybeSendUmanWelcome: vi.fn().mockResolvedValue(undefined),
}));

import {
  handleFormSubmission,
  submitWebsiteLeadToMonday,
} from "./website.service.js";
import { env } from "../../config/env.js";
import * as dedup from "../../lib/dedup.js";
import * as db from "../../config/db.js";
import * as monday from "../monday/monday.service.js";
import { MondayRateLimitError } from "../monday/monday.client.js";
import type { WebsiteLead } from "./website.validator.js";

function lead(overrides: Partial<WebsiteLead> = {}): WebsiteLead {
  return {
    name: "Test Lead",
    phone: "0501234567",
    phone_type: "kosher",
    passport: "yes",
    service: "uman",
    ig_id: null,
    utm_source: "direct",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dedup.findKnownSender).mockReturnValue(null);
  vi.mocked(monday.createLeadRow).mockResolvedValue({ itemId: "item-1" });
  vi.mocked(monday.findLeadByPhoneAllBoards).mockResolvedValue(null);
});

describe("handleFormSubmission — happy path (unchanged behavior)", () => {
  it("creates a new lead when no IG/phone match exists", async () => {
    const result = await handleFormSubmission(lead());

    expect(monday.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test Lead", phone: "0501234567", service: "uman" }),
    );
    expect(result).toEqual({ itemId: "item-1", action: "created_new", boardId: env.MONDAY_BOARD_CRM_ID });
    expect(db.enqueueMondayLead).not.toHaveBeenCalled();
  });
});

describe("handleFormSubmission — Monday rate-limited on create", () => {
  it("enqueues the full payload and resolves success (queued_retry) instead of throwing", async () => {
    vi.mocked(monday.createLeadRow).mockRejectedValue(
      new MondayRateLimitError("daily", 9000, "daily cap"),
    );

    const input = lead({ ig_id: "ig-abc" });
    const result = await handleFormSubmission(input);

    expect(result).toEqual({
      itemId: "",
      action: "queued_retry",
      boardId: env.MONDAY_BOARD_CRM_ID,
    });
    expect(db.enqueueMondayLead).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "website",
        senderId: "ig:ig-abc",
        source: "website",
        payload: JSON.stringify(input),
      }),
    );
  });

  it("rethrows non-rate-limit errors (no enqueue)", async () => {
    vi.mocked(monday.createLeadRow).mockRejectedValue(new Error("boom"));

    await expect(handleFormSubmission(lead())).rejects.toThrow("boom");
    expect(db.enqueueMondayLead).not.toHaveBeenCalled();
  });
});

describe("monday_lead_queue drain replay — website rows", () => {
  it("replays the stored payload through submitWebsiteLeadToMonday and re-runs its own phone dedup", async () => {
    const originalInput = lead({ ig_id: "ig-abc" });
    const payload = JSON.stringify(originalInput);

    const replayed = JSON.parse(payload) as WebsiteLead;
    const result = await submitWebsiteLeadToMonday(replayed);

    expect(monday.findLeadByPhoneAllBoards).toHaveBeenCalledWith("0501234567");
    expect(monday.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test Lead", phone: "0501234567" }),
    );
    expect(result.action).toBe("created_new");
  });
});
