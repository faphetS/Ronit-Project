import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/db.js", () => ({
  getDueQueuedLeads: vi.fn().mockReturnValue([]),
  deleteQueuedLead: vi.fn(),
  bumpQueuedLead: vi.fn(),
  expireOldQueuedLeads: vi.fn().mockReturnValue([]),
}));

vi.mock("../../lib/dedup.js", () => ({
  findKnownSender: vi.fn().mockReturnValue(null),
  upsertKnownSender: vi.fn(),
  deleteKnownSenderByItemId: vi.fn(),
}));

vi.mock("../../lib/conversation.js", () => ({
  upsertPendingClarification: vi.fn(),
}));

vi.mock("./monday.service.js", () => ({
  createLeadRow: vi.fn().mockResolvedValue({ itemId: "new-item-1" }),
  updateLastIgMessage: vi.fn().mockResolvedValue(undefined),
  updateItemPhone: vi.fn().mockResolvedValue(undefined),
  getItemBoardAndGroup: vi.fn().mockResolvedValue(null),
  findLeadByPhone: vi.fn().mockResolvedValue(null),
}));

vi.mock("./monday.webhook.service.js", () => ({
  findLeadOnActiveServiceBoards: vi.fn().mockResolvedValue(null),
}));

vi.mock("../website/website.service.js", () => ({
  submitWebsiteLeadToMonday: vi.fn().mockResolvedValue({
    itemId: "web-item-1",
    action: "created_new",
    boardId: "board-1",
  }),
}));

import { drainMondayLeadQueue } from "./monday.queue.service.js";
import { env } from "../../config/env.js";
import * as db from "../../config/db.js";
import * as dedup from "../../lib/dedup.js";
import * as conversation from "../../lib/conversation.js";
import * as monday from "./monday.service.js";
import * as webhook from "./monday.webhook.service.js";
import * as website from "../website/website.service.js";
import { MondayRateLimitError } from "./monday.client.js";
import type { QueuedLead } from "../../config/db.js";

function queuedLead(overrides: Partial<QueuedLead> = {}): QueuedLead {
  return {
    id: 1,
    platform: "instagram",
    sender_id: "sender-1",
    sender_username: "sender_user",
    display_name: "Sender User",
    phone: "0501234567",
    service: "uman",
    message_text: "אני רוצה טיסה לאומן",
    source: "instagram",
    payload: null,
    open_clarification: 0,
    attempt_count: 0,
    last_error: null,
    next_attempt_at: "2026-01-01 00:00:00",
    created_at: "2026-01-01 00:00:00",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getDueQueuedLeads).mockReturnValue([]);
  vi.mocked(db.expireOldQueuedLeads).mockReturnValue([]);
  vi.mocked(dedup.findKnownSender).mockReturnValue(null);
  vi.mocked(monday.createLeadRow).mockResolvedValue({ itemId: "new-item-1" });
  vi.mocked(monday.getItemBoardAndGroup).mockResolvedValue(null);
  vi.mocked(monday.updateItemPhone).mockResolvedValue(undefined);
  vi.mocked(monday.findLeadByPhone).mockResolvedValue(null);
  vi.mocked(webhook.findLeadOnActiveServiceBoards).mockResolvedValue(null);
  vi.mocked(website.submitWebsiteLeadToMonday).mockResolvedValue({
    itemId: "web-item-1",
    action: "created_new",
    boardId: "board-1",
  });
});

describe("drainMondayLeadQueue — happy path", () => {
  it("creates the lead, upserts known_sender, updates last IG message, deletes the row", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([queuedLead()]);

    await drainMondayLeadQueue();

    expect(monday.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Sender User", phone: "0501234567", service: "uman" }),
    );
    expect(dedup.upsertKnownSender).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "instagram", senderId: "sender-1", mondayItemId: "new-item-1" }),
    );
    expect(monday.updateLastIgMessage).toHaveBeenCalledWith("new-item-1", "אני רוצה טיסה לאומן");
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(1);
  });
});

describe("drainMondayLeadQueue — known-sender LIVE (F1 + F5c)", () => {
  it("live mapping → skips create/board-dedup, updates last IG message AND phone, deletes the row", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([queuedLead()]);
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: "existing-item", phone: null });
    vi.mocked(monday.getItemBoardAndGroup).mockResolvedValue({
      boardId: "crm-board",
      groupId: "g",
      service: null,
    });

    await drainMondayLeadQueue();

    expect(webhook.findLeadOnActiveServiceBoards).not.toHaveBeenCalled();
    expect(monday.createLeadRow).not.toHaveBeenCalled();
    expect(monday.updateLastIgMessage).toHaveBeenCalledWith("existing-item", "אני רוצה טיסה לאומן");
    expect(monday.updateItemPhone).toHaveBeenCalledWith("existing-item", "0501234567");
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(1);
  });

  it("no phone on the row → updateItemPhone is not called", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([queuedLead({ phone: null })]);
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: "existing-item", phone: null });
    vi.mocked(monday.getItemBoardAndGroup).mockResolvedValue({
      boardId: "crm-board",
      groupId: "g",
      service: null,
    });

    await drainMondayLeadQueue();

    expect(monday.updateItemPhone).not.toHaveBeenCalled();
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(1);
  });

  it("a MondayRateLimitError from updateItemPhone propagates (bumps, does not delete)", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([queuedLead()]);
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: "existing-item", phone: null });
    vi.mocked(monday.getItemBoardAndGroup).mockResolvedValue({
      boardId: "crm-board",
      groupId: "g",
      service: null,
    });
    vi.mocked(monday.updateItemPhone).mockRejectedValue(
      new MondayRateLimitError("minute", 30, "minute cap"),
    );

    await drainMondayLeadQueue();

    expect(db.bumpQueuedLead).toHaveBeenCalledWith(1, expect.any(String), expect.any(Number));
    expect(db.deleteQueuedLead).not.toHaveBeenCalled();
  });

  it("a non-rate-limit error from updateLastIgMessage is swallowed (best-effort) — row still resolved", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([queuedLead()]);
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: "existing-item", phone: null });
    vi.mocked(monday.getItemBoardAndGroup).mockResolvedValue({
      boardId: "crm-board",
      groupId: "g",
      service: null,
    });
    vi.mocked(monday.updateLastIgMessage).mockRejectedValue(new Error("transient"));

    await drainMondayLeadQueue();

    expect(monday.updateItemPhone).toHaveBeenCalledWith("existing-item", "0501234567");
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(1);
  });
});

describe("drainMondayLeadQueue — stale known_senders mapping (F1 self-heal)", () => {
  it("stale (getItemBoardAndGroup → null) → drops the mapping and falls through to create", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([queuedLead()]);
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: "stale-item", phone: null });
    vi.mocked(monday.getItemBoardAndGroup).mockResolvedValue(null);

    await drainMondayLeadQueue();

    expect(dedup.deleteKnownSenderByItemId).toHaveBeenCalledWith("stale-item");
    expect(monday.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Sender User", phone: "0501234567", service: "uman" }),
    );
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(1);
  });

  it("the liveness check itself throwing MondayRateLimitError propagates (bumps, no delete, no self-heal)", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([queuedLead()]);
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: "existing-item", phone: null });
    vi.mocked(monday.getItemBoardAndGroup).mockRejectedValue(
      new MondayRateLimitError("minute", 30, "minute cap"),
    );

    await drainMondayLeadQueue();

    expect(dedup.deleteKnownSenderByItemId).not.toHaveBeenCalled();
    expect(monday.createLeadRow).not.toHaveBeenCalled();
    expect(db.bumpQueuedLead).toHaveBeenCalledWith(1, expect.any(String), expect.any(Number));
    expect(db.deleteQueuedLead).not.toHaveBeenCalled();
  });
});

describe("drainMondayLeadQueue — paid-board dedup hit", () => {
  it("deletes the queue row without creating a CRM row", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([queuedLead()]);
    vi.mocked(webhook.findLeadOnActiveServiceBoards).mockResolvedValue({
      itemId: "service-item-1",
      boardId: "service-board-1",
    });

    await drainMondayLeadQueue();

    expect(monday.createLeadRow).not.toHaveBeenCalled();
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(1);
  });
});

describe("drainMondayLeadQueue — daily rate limit mid-drain", () => {
  it("bumps with retryInSeconds + 60 and breaks the batch (second row untouched)", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([
      queuedLead({ id: 1, sender_id: "sender-1" }),
      queuedLead({ id: 2, sender_id: "sender-2" }),
    ]);
    vi.mocked(monday.createLeadRow).mockRejectedValue(
      new MondayRateLimitError("daily", 9000, "daily cap"),
    );

    await drainMondayLeadQueue();

    expect(db.bumpQueuedLead).toHaveBeenCalledWith(1, expect.any(String), 9060);
    expect(db.bumpQueuedLead).toHaveBeenCalledTimes(1);
    expect(db.deleteQueuedLead).not.toHaveBeenCalled();
  });
});

describe("drainMondayLeadQueue — other error", () => {
  it("bumps with exponential backoff and continues the batch", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([
      queuedLead({ id: 1, sender_id: "sender-1", attempt_count: 2 }),
      queuedLead({ id: 2, sender_id: "sender-2" }),
    ]);
    vi.mocked(monday.createLeadRow)
      .mockRejectedValueOnce(new Error("transient failure"))
      .mockResolvedValueOnce({ itemId: "new-item-2" });

    await drainMondayLeadQueue();

    expect(db.bumpQueuedLead).toHaveBeenCalledWith(1, expect.any(String), 240); // 60 * 2^2
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(2);
  });
});

describe("drainMondayLeadQueue — open_clarification", () => {
  it("opens a pending clarification when service is still null after create", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([
      queuedLead({ service: null, open_clarification: 1 }),
    ]);

    await drainMondayLeadQueue();

    expect(conversation.upsertPendingClarification).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "instagram", senderId: "sender-1", mondayItemId: "new-item-1" }),
    );
  });

  it("does NOT open a clarification when a service is present", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([
      queuedLead({ service: "uman", open_clarification: 1 }),
    ]);

    await drainMondayLeadQueue();

    expect(conversation.upsertPendingClarification).not.toHaveBeenCalled();
  });
});

describe("drainMondayLeadQueue — website rows", () => {
  it("replays the payload through submitWebsiteLeadToMonday and skips IG-specific steps", async () => {
    const payload = JSON.stringify({ name: "Web Lead", phone: "0501234567" });
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([
      queuedLead({ id: 5, platform: "website", payload }),
    ]);

    await drainMondayLeadQueue();

    expect(website.submitWebsiteLeadToMonday).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Web Lead", phone: "0501234567" }),
    );
    expect(monday.createLeadRow).not.toHaveBeenCalled();
    expect(monday.updateLastIgMessage).not.toHaveBeenCalled();
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(5);
  });

  it("missing payload (F10 poison row) → logs error, deletes immediately, never replays", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([
      queuedLead({ id: 6, platform: "website", payload: null }),
    ]);

    await drainMondayLeadQueue();

    expect(website.submitWebsiteLeadToMonday).not.toHaveBeenCalled();
    expect(db.bumpQueuedLead).not.toHaveBeenCalled();
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(6);
  });

  it("corrupt JSON payload (F10 poison row) → logs error, deletes immediately, never replays", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([
      queuedLead({ id: 7, platform: "website", payload: "{not json" }),
    ]);

    await drainMondayLeadQueue();

    expect(website.submitWebsiteLeadToMonday).not.toHaveBeenCalled();
    expect(db.bumpQueuedLead).not.toHaveBeenCalled();
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(7);
  });
});

describe("drainMondayLeadQueue — n8n rows", () => {
  const n8nPayload = {
    full_name: "פני אלקסלסי",
    phone972: "972523730451",
    email: "fanielkas77@gmail.com",
    inquiryDate: "2026-07-06",
  };

  function n8nLead(overrides: Partial<QueuedLead> = {}): QueuedLead {
    return queuedLead({
      id: 10,
      platform: "n8n",
      sender_id: "n8n:972523730451",
      sender_username: null,
      display_name: "פני אלקסלסי",
      phone: "972523730451",
      service: "uman",
      source: "n8n",
      payload: JSON.stringify(n8nPayload),
      ...overrides,
    });
  }

  it("happy path → creates the row with paid sourceLabel + original inquiryDate, deletes the queue row", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([n8nLead()]);

    await drainMondayLeadQueue();

    expect(monday.findLeadByPhone).toHaveBeenCalledWith("972523730451");
    expect(monday.createLeadRow).toHaveBeenCalledWith({
      name: "פני אלקסלסי",
      phone: "972523730451",
      service: "uman",
      source: "n8n",
      email: "fanielkas77@gmail.com",
      inquiryDate: "2026-07-06",
      sourceLabel: env.MONDAY_SOURCE_LABEL_PAID,
    });
    expect(monday.updateLastIgMessage).not.toHaveBeenCalled();
    expect(dedup.upsertKnownSender).not.toHaveBeenCalled();
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(10);
  });

  it("phone-dedup hit → no create, queue row still resolved (deleted)", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([n8nLead()]);
    vi.mocked(monday.findLeadByPhone).mockResolvedValue({
      itemId: "already-there",
      name: "פני אלקסלסי",
    });

    await drainMondayLeadQueue();

    expect(monday.createLeadRow).not.toHaveBeenCalled();
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(10);
  });

  it("email-only payload → dedup skipped entirely, creates with phone null", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([
      n8nLead({
        sender_id: "n8n:lead@example.com",
        phone: null,
        payload: JSON.stringify({
          full_name: "ליד חדש",
          phone972: null,
          email: "lead@example.com",
        }),
      }),
    ]);

    await drainMondayLeadQueue();

    expect(monday.findLeadByPhone).not.toHaveBeenCalled();
    expect(monday.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ליד חדש",
        phone: null,
        email: "lead@example.com",
        sourceLabel: env.MONDAY_SOURCE_LABEL_PAID,
      }),
    );
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(10);
  });

  it("missing payload (poison row) → logs error, deletes immediately, never creates", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([n8nLead({ payload: null })]);

    await drainMondayLeadQueue();

    expect(monday.findLeadByPhone).not.toHaveBeenCalled();
    expect(monday.createLeadRow).not.toHaveBeenCalled();
    expect(db.bumpQueuedLead).not.toHaveBeenCalled();
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(10);
  });

  it("corrupt JSON payload (poison row) → logs error, deletes immediately, never creates", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([n8nLead({ payload: "{not json" })]);

    await drainMondayLeadQueue();

    expect(monday.createLeadRow).not.toHaveBeenCalled();
    expect(db.bumpQueuedLead).not.toHaveBeenCalled();
    expect(db.deleteQueuedLead).toHaveBeenCalledWith(10);
  });

  it("daily rate limit from createLeadRow → bumps with retryInSeconds + 60 and breaks the batch", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([
      n8nLead({ id: 10 }),
      queuedLead({ id: 11, sender_id: "sender-after" }),
    ]);
    vi.mocked(monday.createLeadRow).mockRejectedValue(
      new MondayRateLimitError("daily", 9000, "daily cap"),
    );

    await drainMondayLeadQueue();

    expect(db.bumpQueuedLead).toHaveBeenCalledWith(10, expect.any(String), 9060);
    expect(db.bumpQueuedLead).toHaveBeenCalledTimes(1);
    expect(db.deleteQueuedLead).not.toHaveBeenCalled();
  });

  it("minute rate limit from findLeadByPhone → propagates (bumps, no delete)", async () => {
    vi.mocked(db.getDueQueuedLeads).mockReturnValue([n8nLead()]);
    vi.mocked(monday.findLeadByPhone).mockRejectedValue(
      new MondayRateLimitError("minute", 30, "minute cap"),
    );

    await drainMondayLeadQueue();

    expect(monday.createLeadRow).not.toHaveBeenCalled();
    expect(db.bumpQueuedLead).toHaveBeenCalledWith(10, expect.any(String), expect.any(Number));
    expect(db.deleteQueuedLead).not.toHaveBeenCalled();
  });
});

describe("drainMondayLeadQueue — expiry logging", () => {
  it("logs each permanently-abandoned lead (no throw)", async () => {
    vi.mocked(db.expireOldQueuedLeads).mockReturnValue([queuedLead({ id: 99 })]);

    await expect(drainMondayLeadQueue()).resolves.toBeUndefined();
    expect(db.getDueQueuedLeads).toHaveBeenCalled();
  });
});
