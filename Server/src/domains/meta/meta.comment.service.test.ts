import { describe, it, expect, vi, beforeEach } from "vitest";

const ENV = vi.hoisted(() => ({
  IG_COMMENT_HANDLER_ENABLED: true,
  IG_PROFESSIONAL_ACCOUNT_ID: "ownerself",
  IG_COMMENT_REPLY_MAX_PER_HOUR: 30,
}));
vi.mock("../../config/env.js", () => ({ env: ENV }));

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../lib/dedup.js", () => ({
  isMessageProcessed: vi.fn().mockReturnValue(false),
  markMessageProcessed: vi.fn(),
  findKnownSender: vi.fn().mockReturnValue(null),
  upsertKnownSender: vi.fn(),
  deleteKnownSenderByItemId: vi.fn(),
}));

vi.mock("../../config/db.js", () => ({
  enqueueComment: vi.fn(),
  isCommentQueued: vi.fn().mockReturnValue(false),
  getQueuedComments: vi.fn().mockReturnValue([]),
  deleteQueuedComment: vi.fn(),
  bumpQueuedComment: vi.fn(),
  countCommentDmsSentLastHour: vi.fn().mockReturnValue(0),
  expireOldQueuedComments: vi.fn().mockReturnValue([]),
}));

vi.mock("../monday/monday.service.js", () => ({
  createLeadRow: vi.fn().mockResolvedValue({ itemId: "item-1" }),
  updateLastIgMessage: vi.fn().mockResolvedValue(undefined),
  getItemBoardAndGroup: vi.fn().mockResolvedValue(null),
}));

vi.mock("./meta.outbound.service.js", () => ({
  sendCommentPrivateReply: vi.fn().mockResolvedValue(true),
}));

import { handleIncomingComment, drainCommentQueue } from "./meta.comment.service.js";
import * as outbound from "./meta.outbound.service.js";
import * as monday from "../monday/monday.service.js";
import * as dedup from "../../lib/dedup.js";
import * as db from "../../config/db.js";

function comment(overrides: Record<string, unknown> = {}) {
  return {
    commentId: "c-1",
    commentText: "אומן",
    commenterId: "commenter-1",
    commenterUsername: "tester",
    mediaId: "m-1",
    recipientId: "ig-account",
    ...overrides,
  };
}

function queued(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    comment_id: "c-1",
    commenter_id: "commenter-1",
    commenter_username: "tester",
    recipient_id: "ig-account",
    comment_text: "אומן",
    attempt_count: 0,
    created_at: "2026-06-28 10:00:00",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ENV.IG_COMMENT_HANDLER_ENABLED = true;
  ENV.IG_PROFESSIONAL_ACCOUNT_ID = "ownerself";
  ENV.IG_COMMENT_REPLY_MAX_PER_HOUR = 30;
  vi.mocked(dedup.isMessageProcessed).mockReturnValue(false);
  vi.mocked(dedup.findKnownSender).mockReturnValue(null);
  vi.mocked(db.isCommentQueued).mockReturnValue(false);
  vi.mocked(db.getQueuedComments).mockReturnValue([]);
  vi.mocked(db.countCommentDmsSentLastHour).mockReturnValue(0);
  vi.mocked(db.expireOldQueuedComments).mockReturnValue([]);
  vi.mocked(monday.getItemBoardAndGroup).mockResolvedValue(null);
  vi.mocked(monday.createLeadRow).mockResolvedValue({ itemId: "item-1" });
  vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue(true);
});

describe("handleIncomingComment — ingest/enqueue", () => {
  it("master gate off → not enqueued, no DM", async () => {
    ENV.IG_COMMENT_HANDLER_ENABLED = false;
    await handleIncomingComment(comment());
    expect(db.enqueueComment).not.toHaveBeenCalled();
    expect(outbound.sendCommentPrivateReply).not.toHaveBeenCalled();
  });

  it("'אומן' comment → enqueued; no DM sent inline (deferred to the drainer)", async () => {
    await handleIncomingComment(comment());
    expect(db.enqueueComment).toHaveBeenCalledWith(
      expect.objectContaining({
        commentId: "c-1",
        commenterId: "commenter-1",
        commenterUsername: "tester",
        recipientId: "ig-account",
        commentText: "אומן",
      }),
    );
    expect(outbound.sendCommentPrivateReply).not.toHaveBeenCalled();
    expect(monday.createLeadRow).not.toHaveBeenCalled();
  });

  it("non-'אומן' comment → not enqueued", async () => {
    await handleIncomingComment(comment({ commentText: "מתי הטיסה?" }));
    expect(db.enqueueComment).not.toHaveBeenCalled();
  });

  it("self-comment (env account id) → not enqueued", async () => {
    await handleIncomingComment(comment({ commenterId: "ownerself" }));
    expect(db.enqueueComment).not.toHaveBeenCalled();
  });

  it("self-comment (from.id === entry.id) → not enqueued", async () => {
    await handleIncomingComment(comment({ commenterId: "ig-account", recipientId: "ig-account" }));
    expect(db.enqueueComment).not.toHaveBeenCalled();
  });

  it("already-sent comment (dedup) → not enqueued", async () => {
    vi.mocked(dedup.isMessageProcessed).mockReturnValue(true);
    await handleIncomingComment(comment());
    expect(db.enqueueComment).not.toHaveBeenCalled();
  });

  it("already-queued comment → not enqueued again", async () => {
    vi.mocked(db.isCommentQueued).mockReturnValue(true);
    await handleIncomingComment(comment());
    expect(db.enqueueComment).not.toHaveBeenCalled();
  });
});

describe("drainCommentQueue — paced send", () => {
  it("gate off → no-op", async () => {
    ENV.IG_COMMENT_HANDLER_ENABLED = false;
    await drainCommentQueue();
    expect(db.getQueuedComments).not.toHaveBeenCalled();
    expect(db.expireOldQueuedComments).not.toHaveBeenCalled();
  });

  it("under cap → DM first, then Uman lead + known_sender + mark + dequeue", async () => {
    vi.mocked(db.getQueuedComments).mockReturnValue([queued()]);
    await drainCommentQueue();

    expect(outbound.sendCommentPrivateReply).toHaveBeenCalledWith("c-1", "commenter-1");
    expect(monday.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ name: "tester", phone: null, service: "uman", source: "instagram" }),
    );
    expect(dedup.upsertKnownSender).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "instagram", senderId: "commenter-1", mondayItemId: "item-1" }),
    );
    expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1");
    expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);

    const dmOrder = vi.mocked(outbound.sendCommentPrivateReply).mock.invocationCallOrder[0];
    const rowOrder = vi.mocked(monday.createLeadRow).mock.invocationCallOrder[0];
    expect(dmOrder).toBeLessThan(rowOrder);
  });

  it("DM not sent → bumped, kept in queue, no row", async () => {
    vi.mocked(db.getQueuedComments).mockReturnValue([queued()]);
    vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue(false);
    await drainCommentQueue();
    expect(db.bumpQueuedComment).toHaveBeenCalledWith(1, expect.any(String));
    expect(monday.createLeadRow).not.toHaveBeenCalled();
    expect(db.deleteQueuedComment).not.toHaveBeenCalled();
  });

  it("commenter already a live lead → skip DM, dequeue", async () => {
    vi.mocked(db.getQueuedComments).mockReturnValue([queued()]);
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: "existing", phone: null });
    vi.mocked(monday.getItemBoardAndGroup).mockResolvedValue({ boardId: "b", groupId: "g", service: "אומן" });
    await drainCommentQueue();
    expect(outbound.sendCommentPrivateReply).not.toHaveBeenCalled();
    expect(monday.createLeadRow).not.toHaveBeenCalled();
    expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
  });

  it("at hourly cap → sends nothing (overflow stays queued)", async () => {
    vi.mocked(db.countCommentDmsSentLastHour).mockReturnValue(30);
    vi.mocked(db.getQueuedComments).mockReturnValue([queued()]);
    await drainCommentQueue();
    expect(outbound.sendCommentPrivateReply).not.toHaveBeenCalled();
    expect(db.deleteQueuedComment).not.toHaveBeenCalled();
  });

  it("never sends more than DRAIN_PER_TICK (5) in one tick even when far under cap", async () => {
    vi.mocked(db.countCommentDmsSentLastHour).mockReturnValue(0); // remaining = 30
    await drainCommentQueue();
    // remaining(30) is capped to DRAIN_PER_TICK(5) when fetching the batch.
    expect(db.getQueuedComments).toHaveBeenCalledWith(5);
  });

  it("expires stale queued comments (>6d)", async () => {
    vi.mocked(db.expireOldQueuedComments).mockReturnValue(["old-1"]);
    await drainCommentQueue();
    expect(db.expireOldQueuedComments).toHaveBeenCalled();
  });

  it("row creation fails after DM sent → still dequeued, sender not registered", async () => {
    vi.mocked(db.getQueuedComments).mockReturnValue([queued()]);
    vi.mocked(monday.createLeadRow).mockRejectedValue(new Error("monday down"));
    await drainCommentQueue();
    expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1"); // marked after send
    expect(dedup.upsertKnownSender).not.toHaveBeenCalled();
    expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
  });
});
