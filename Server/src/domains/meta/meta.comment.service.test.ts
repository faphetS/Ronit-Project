import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ENV = vi.hoisted(() => ({
  IG_COMMENT_HANDLER_ENABLED: true,
  IG_COMMENT_UMAN_ENABLED: true,
  IG_COMMENT_TRIP_ENABLED: true,
  IG_COMMENT_BLOCKED_REPLY_ENABLED: true,
  IG_PROFESSIONAL_ACCOUNT_ID: "ownerself",
  IG_COMMENT_REPLY_MAX_PER_HOUR: 30,
  IG_COMMENT_KNIFE_MEDIA_ID: "knife-media-1",
  IG_MSG_COMMENT_REPLY_SENT: "SENT-REPLY",
  IG_MSG_COMMENT_REPLY_BLOCKED: "BLOCKED-REPLY",
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
  enqueueMondayLead: vi.fn(),
  markOwedCommentFlyer: vi.fn(),
  getOwedCommentTrips: vi.fn().mockReturnValue([]),
}));

// The real detector, wrapped so a test can force a verdict and prove the order of
// the knife / trip / אומן checks (no real comment text is both a trigger and a keyword).
vi.mock("../../lib/trip.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/trip.js")>();
  return { ...actual, detectTripTrigger: vi.fn(actual.detectTripTrigger) };
});

vi.mock("../monday/monday.service.js", () => ({
  createLeadRow: vi.fn().mockResolvedValue({ itemId: "item-1" }),
  updateLastIgMessage: vi.fn().mockResolvedValue(undefined),
  getItemBoardAndGroup: vi.fn().mockResolvedValue(null),
}));

vi.mock("./meta.outbound.service.js", () => ({
  sendCommentPrivateReply: vi.fn().mockResolvedValue("sent"),
  postCommentReply: vi.fn().mockResolvedValue(true),
}));

vi.mock("./meta.service.js", () => ({
  recordTripCommentLead: vi.fn().mockResolvedValue(undefined),
}));

import { handleIncomingComment, drainCommentQueue, resetCommentDrainPause } from "./meta.comment.service.js";
import * as outbound from "./meta.outbound.service.js";
import * as metaService from "./meta.service.js";
import * as monday from "../monday/monday.service.js";
import * as dedup from "../../lib/dedup.js";
import * as db from "../../config/db.js";
import * as tripLib from "../../lib/trip.js";
import { logger } from "../../config/logger.js";
import { MondayRateLimitError } from "../monday/monday.client.js";
import type { QueuedComment } from "../../config/db.js";

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

function queued(overrides: Partial<QueuedComment> = {}): QueuedComment {
  return {
    id: 1,
    comment_id: "c-1",
    commenter_id: "commenter-1",
    commenter_username: "tester",
    recipient_id: "ig-account",
    comment_text: "אומן",
    kind: "uman",
    attempt_count: 0,
    created_at: "2026-06-28 10:00:00",
    ...overrides,
  };
}

function tripQueued(overrides: Partial<QueuedComment> = {}): QueuedComment {
  return queued({ kind: "trip", comment_text: "חנוכה", ...overrides });
}

function callOrder(fn: unknown, index = 0): number {
  const order = vi.mocked(fn as (...args: never[]) => unknown).mock.invocationCallOrder[index];
  if (order === undefined) throw new Error("expected the mock to have been called");
  return order;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  resetCommentDrainPause();
  ENV.IG_COMMENT_HANDLER_ENABLED = true;
  ENV.IG_COMMENT_UMAN_ENABLED = true;
  ENV.IG_COMMENT_TRIP_ENABLED = true;
  ENV.IG_COMMENT_BLOCKED_REPLY_ENABLED = true;
  ENV.IG_PROFESSIONAL_ACCOUNT_ID = "ownerself";
  ENV.IG_COMMENT_REPLY_MAX_PER_HOUR = 30;
  ENV.IG_COMMENT_KNIFE_MEDIA_ID = "knife-media-1";
  vi.mocked(dedup.isMessageProcessed).mockReturnValue(false);
  vi.mocked(dedup.findKnownSender).mockReturnValue(null);
  vi.mocked(db.isCommentQueued).mockReturnValue(false);
  vi.mocked(db.getQueuedComments).mockReset().mockReturnValue([]);
  vi.mocked(db.bumpQueuedComment).mockReset();
  vi.mocked(db.deleteQueuedComment).mockReset();
  vi.mocked(db.countCommentDmsSentLastHour).mockReturnValue(0);
  vi.mocked(db.expireOldQueuedComments).mockReturnValue([]);
  vi.mocked(db.getOwedCommentTrips).mockReturnValue([]);
  vi.mocked(tripLib.detectTripTrigger).mockReset(); // back to the real detector, no queued once-verdicts
  vi.mocked(monday.getItemBoardAndGroup).mockResolvedValue(null);
  vi.mocked(monday.createLeadRow).mockResolvedValue({ itemId: "item-1" });
  vi.mocked(outbound.sendCommentPrivateReply).mockReset().mockResolvedValue("sent");
  vi.mocked(outbound.postCommentReply).mockReset().mockResolvedValue(true);
  vi.mocked(metaService.recordTripCommentLead).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
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

  it("uman sub-gate off → 'אומן' comment not enqueued, no DM", async () => {
    ENV.IG_COMMENT_UMAN_ENABLED = false;
    await handleIncomingComment(comment());
    expect(db.enqueueComment).not.toHaveBeenCalled();
    expect(outbound.sendCommentPrivateReply).not.toHaveBeenCalled();
  });

  it("uman sub-gate off → 'פרנסה' comment on the knife media still enqueued (knife unaffected)", async () => {
    ENV.IG_COMMENT_UMAN_ENABLED = false;
    await handleIncomingComment(
      comment({ commentText: "מעוניינת בסכין לפרנסה", mediaId: "knife-media-1" }),
    );
    expect(db.enqueueComment).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: "c-1", commenterId: "commenter-1", kind: "knife" }),
    );
  });
});

describe("handleIncomingComment — 'פרנסה' knife-sale keyword", () => {
  it("'פרנסה' on the knife media → enqueued kind knife", async () => {
    await handleIncomingComment(
      comment({ commentText: "מעוניינת בסכין לפרנסה", mediaId: "knife-media-1" }),
    );
    expect(db.enqueueComment).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: "c-1", commenterId: "commenter-1", kind: "knife" }),
    );
  });

  it("'פרנסה' on a DIFFERENT (non-knife) media → not enqueued", async () => {
    await handleIncomingComment(
      comment({ commentText: "מעוניינת בסכין לפרנסה", mediaId: "some-other-post" }),
    );
    expect(db.enqueueComment).not.toHaveBeenCalled();
  });

  it("'פרנסה' on the knife media, but IG_COMMENT_KNIFE_MEDIA_ID is empty → flow disabled, not enqueued", async () => {
    ENV.IG_COMMENT_KNIFE_MEDIA_ID = "";
    await handleIncomingComment(
      comment({ commentText: "מעוניינת בסכין לפרנסה", mediaId: "knife-media-1" }),
    );
    expect(db.enqueueComment).not.toHaveBeenCalled();
  });

  it("'אומן' (no 'פרנסה') on the knife media → enqueued kind uman", async () => {
    await handleIncomingComment(comment({ commentText: "אומן", mediaId: "knife-media-1" }));
    expect(db.enqueueComment).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: "c-1", commenterId: "commenter-1", kind: "uman" }),
    );
  });

  it("text with both 'אומן' and 'פרנסה' on the knife media → knife wins", async () => {
    await handleIncomingComment(
      comment({ commentText: "רוצה לטוס לאומן וגם סכין לפרנסה", mediaId: "knife-media-1" }),
    );
    expect(db.enqueueComment).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "knife" }),
    );
  });
});

describe("handleIncomingComment — a bare trip word on ANY post", () => {
  it.each([["חנוכה"], ["כסלו"], ["כסליו 🙏"], ['ר"ח כסלו'], ["חנוכה!!"]])(
    "%j → enqueued as kind trip, nothing sent inline",
    async (commentText) => {
      await handleIncomingComment(comment({ commentText, mediaId: "some-random-post" }));

      expect(db.enqueueComment).toHaveBeenCalledTimes(1);
      expect(db.enqueueComment).toHaveBeenCalledWith(
        expect.objectContaining({
          commentId: "c-1",
          commenterId: "commenter-1",
          commenterUsername: "tester",
          recipientId: "ig-account",
          commentText,
          kind: "trip",
        }),
      );
      expect(outbound.sendCommentPrivateReply).not.toHaveBeenCalled();
      expect(monday.createLeadRow).not.toHaveBeenCalled();
    },
  );

  it("the trip itself is NOT stored — only the text, re-derived at drain time", async () => {
    await handleIncomingComment(comment({ commentText: "חנוכה" }));
    expect(vi.mocked(db.enqueueComment).mock.calls[0]?.[0]).not.toHaveProperty("trip");
  });

  it.each([["חנוכה שמח"], ["מעוניינת בחנוכה"], ["כסלו או חנוכה"], ["לא כסלו"], ["מתי החנוכה?"]])(
    "%j (longer text) → not a trigger, not enqueued",
    async (commentText) => {
      await handleIncomingComment(comment({ commentText }));
      expect(db.enqueueComment).not.toHaveBeenCalled();
    },
  );

  it("also enqueued on the knife media (the trip word is not tied to a post)", async () => {
    await handleIncomingComment(comment({ commentText: "חנוכה", mediaId: "knife-media-1" }));
    expect(db.enqueueComment).toHaveBeenCalledWith(expect.objectContaining({ kind: "trip" }));
  });

  it("still enqueued when the אומן sub-gate is off (that switch is for אומן comments only)", async () => {
    ENV.IG_COMMENT_UMAN_ENABLED = false;
    await handleIncomingComment(comment({ commentText: "חנוכה" }));
    expect(db.enqueueComment).toHaveBeenCalledWith(expect.objectContaining({ kind: "trip" }));
  });

  it("IG_COMMENT_TRIP_ENABLED off → nothing enqueued", async () => {
    ENV.IG_COMMENT_TRIP_ENABLED = false;
    await handleIncomingComment(comment({ commentText: "חנוכה" }));
    expect(db.enqueueComment).not.toHaveBeenCalled();
    expect(outbound.sendCommentPrivateReply).not.toHaveBeenCalled();
  });

  it("master gate off → nothing enqueued", async () => {
    ENV.IG_COMMENT_HANDLER_ENABLED = false;
    await handleIncomingComment(comment({ commentText: "חנוכה" }));
    expect(db.enqueueComment).not.toHaveBeenCalled();
  });

  it("the business account's own comment (env id) → ignored", async () => {
    await handleIncomingComment(comment({ commentText: "חנוכה", commenterId: "ownerself" }));
    expect(db.enqueueComment).not.toHaveBeenCalled();
  });

  it("the business account's own comment (from.id === entry.id) → ignored", async () => {
    await handleIncomingComment(
      comment({ commentText: "חנוכה", commenterId: "ig-account", recipientId: "ig-account" }),
    );
    expect(db.enqueueComment).not.toHaveBeenCalled();
  });

  it("already handled (dedup) → not enqueued", async () => {
    vi.mocked(dedup.isMessageProcessed).mockReturnValue(true);
    await handleIncomingComment(comment({ commentText: "חנוכה" }));
    expect(db.enqueueComment).not.toHaveBeenCalled();
  });

  it("already queued → not enqueued twice", async () => {
    vi.mocked(db.isCommentQueued).mockReturnValue(true);
    await handleIncomingComment(comment({ commentText: "חנוכה" }));
    expect(db.enqueueComment).not.toHaveBeenCalled();
  });

  it("precedence: the knife check runs before the trip check", async () => {
    vi.mocked(tripLib.detectTripTrigger).mockReturnValueOnce("hanukkah");
    await handleIncomingComment(
      comment({ commentText: "מעוניינת בסכין לפרנסה", mediaId: "knife-media-1" }),
    );
    expect(db.enqueueComment).toHaveBeenCalledTimes(1);
    expect(db.enqueueComment).toHaveBeenCalledWith(expect.objectContaining({ kind: "knife" }));
  });

  it("precedence: the trip check runs before the אומן check", async () => {
    vi.mocked(tripLib.detectTripTrigger).mockReturnValueOnce("kislev");
    await handleIncomingComment(comment({ commentText: "אומן" }));
    expect(db.enqueueComment).toHaveBeenCalledTimes(1);
    expect(db.enqueueComment).toHaveBeenCalledWith(expect.objectContaining({ kind: "trip" }));
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

    expect(outbound.sendCommentPrivateReply).toHaveBeenCalledWith("c-1", "commenter-1", "uman");
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

  it("DM not sent (transient) → bumped with backoff, kept in queue, no row", async () => {
    vi.mocked(db.getQueuedComments).mockReturnValue([queued()]);
    vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("transient");
    await drainCommentQueue();
    expect(db.bumpQueuedComment).toHaveBeenCalledWith(1, expect.any(String), 60);
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

  it("row creation rate-limited after DM sent → enqueued to monday_lead_queue, still dequeued, sender not registered (F6)", async () => {
    vi.mocked(db.getQueuedComments).mockReturnValue([queued()]);
    vi.mocked(monday.createLeadRow).mockRejectedValue(
      new MondayRateLimitError("daily", 9000, "daily cap"),
    );
    await drainCommentQueue();
    expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1"); // marked after send
    expect(db.enqueueMondayLead).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "instagram",
        senderId: "commenter-1",
        service: "uman",
        phone: null,
      }),
    );
    expect(dedup.upsertKnownSender).not.toHaveBeenCalled();
    expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
  });

  it("row creation fails with a NON-rate-limit error → manual recovery logged, NOT enqueued, still dequeued (F6)", async () => {
    vi.mocked(db.getQueuedComments).mockReturnValue([queued()]);
    vi.mocked(monday.createLeadRow).mockRejectedValue(new Error("monday down"));
    await drainCommentQueue();
    expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1");
    expect(db.enqueueMondayLead).not.toHaveBeenCalled();
    expect(dedup.upsertKnownSender).not.toHaveBeenCalled();
    expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
  });

  it("processQueuedComment throws unexpectedly (e.g. getItemBoardAndGroup rejects) → bumped with backoff, loop continues to the next item", async () => {
    vi.mocked(db.getQueuedComments).mockReturnValue([
      queued({ id: 1, comment_id: "c-1", commenter_id: "commenter-1" }),
      queued({ id: 2, comment_id: "c-2", commenter_id: "commenter-2" }),
    ]);
    vi.mocked(dedup.findKnownSender)
      .mockReturnValueOnce({ monday_item_id: "existing-item", phone: null })
      .mockReturnValueOnce(null);
    vi.mocked(monday.getItemBoardAndGroup).mockRejectedValueOnce(new Error("monday down"));

    await drainCommentQueue();

    expect(db.bumpQueuedComment).toHaveBeenCalledWith(1, "monday down", 60);
    expect(db.deleteQueuedComment).not.toHaveBeenCalledWith(1);
    // second item is unaffected by the first item's throw
    expect(outbound.sendCommentPrivateReply).toHaveBeenCalledWith("c-2", "commenter-2", "uman");
    expect(db.deleteQueuedComment).toHaveBeenCalledWith(2);
  });

  it("an unexpected error on the 8th attempt → the row is deleted (same cap as a transient failure), not bumped", async () => {
    vi.mocked(db.getQueuedComments).mockReturnValue([queued({ attempt_count: 7 })]);
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: "existing-item", phone: null });
    vi.mocked(monday.getItemBoardAndGroup).mockRejectedValueOnce(new Error("monday down"));

    await drainCommentQueue();

    expect(db.bumpQueuedComment).not.toHaveBeenCalled();
    expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
  });

  it("uman sub-gate off → queued uman row dropped without DM/Monday/known-sender calls", async () => {
    ENV.IG_COMMENT_UMAN_ENABLED = false;
    vi.mocked(db.getQueuedComments).mockReturnValue([queued()]);
    await drainCommentQueue();

    expect(outbound.sendCommentPrivateReply).not.toHaveBeenCalled();
    expect(monday.createLeadRow).not.toHaveBeenCalled();
    expect(dedup.findKnownSender).not.toHaveBeenCalled();
    expect(dedup.upsertKnownSender).not.toHaveBeenCalled();
    expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
  });
});

describe("drainCommentQueue — knife kind", () => {
  it("DM sent with kind knife → no Monday calls, both processed marks written, dequeued", async () => {
    vi.mocked(db.getQueuedComments).mockReturnValue([queued({ kind: "knife" })]);
    await drainCommentQueue();

    expect(outbound.sendCommentPrivateReply).toHaveBeenCalledWith("c-1", "commenter-1", "knife");
    expect(monday.createLeadRow).not.toHaveBeenCalled();
    expect(dedup.upsertKnownSender).not.toHaveBeenCalled();
    expect(monday.getItemBoardAndGroup).not.toHaveBeenCalled();
    expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1");
    expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_knife_recipient", "commenter-1");
    expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
  });

  it("knife DM not sent (transient) → bumped, kept in queue, no marks", async () => {
    vi.mocked(db.getQueuedComments).mockReturnValue([queued({ kind: "knife" })]);
    vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("transient");
    await drainCommentQueue();

    expect(db.bumpQueuedComment).toHaveBeenCalledWith(1, expect.any(String), 60);
    expect(db.deleteQueuedComment).not.toHaveBeenCalled();
    expect(dedup.markMessageProcessed).not.toHaveBeenCalled();
  });

  it("uman sub-gate off → knife DM still sent (knife unaffected)", async () => {
    ENV.IG_COMMENT_UMAN_ENABLED = false;
    vi.mocked(db.getQueuedComments).mockReturnValue([queued({ kind: "knife" })]);
    await drainCommentQueue();

    expect(outbound.sendCommentPrivateReply).toHaveBeenCalledWith("c-1", "commenter-1", "knife");
    expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1");
    expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_knife_recipient", "commenter-1");
    expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
  });

  it("knife blocked → marked + dropped, and NO public reply (only trip comments get one)", async () => {
    vi.mocked(db.getQueuedComments).mockReturnValue([queued({ kind: "knife" })]);
    vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("blocked");
    await drainCommentQueue();

    expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1");
    expect(dedup.markMessageProcessed).not.toHaveBeenCalledWith("ig_knife_recipient", "commenter-1");
    expect(outbound.postCommentReply).not.toHaveBeenCalled();
    expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
    expect(db.bumpQueuedComment).not.toHaveBeenCalled();
  });
});

describe("drainCommentQueue — trip kind", () => {
  describe("a sent private reply", () => {
    it("marks (ig_comment, owed flyer) → public SENT reply → Monday bookkeeping, in that order; the row is dequeued, never bumped", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);

      await drainCommentQueue();

      expect(outbound.sendCommentPrivateReply).toHaveBeenCalledWith("c-1", "commenter-1", "trip", "hanukkah");
      expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1");
      expect(db.markOwedCommentFlyer).toHaveBeenCalledWith("commenter-1", "hanukkah");
      expect(outbound.postCommentReply).toHaveBeenCalledWith("c-1", "SENT-REPLY");
      expect(metaService.recordTripCommentLead).toHaveBeenCalledWith({
        senderId: "commenter-1",
        senderUsername: "tester",
        commentText: "חנוכה",
        trip: "hanukkah",
      });

      const dm = callOrder(outbound.sendCommentPrivateReply);
      const markProcessed = callOrder(dedup.markMessageProcessed);
      const markOwed = callOrder(db.markOwedCommentFlyer);
      const publicReply = callOrder(outbound.postCommentReply);
      const bookkeeping = callOrder(metaService.recordTripCommentLead);
      expect(dm).toBeLessThan(markProcessed);
      expect(markProcessed).toBeLessThan(markOwed);
      expect(markOwed).toBeLessThan(publicReply);
      expect(publicReply).toBeLessThan(bookkeeping);

      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
      expect(db.bumpQueuedComment).not.toHaveBeenCalled();
    });

    it("a kislev word picks the kislev trip", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued({ comment_text: 'ר"ח כסלו 🙏' })]);
      await drainCommentQueue();
      expect(outbound.sendCommentPrivateReply).toHaveBeenCalledWith("c-1", "commenter-1", "trip", "kislev");
      expect(db.markOwedCommentFlyer).toHaveBeenCalledWith("commenter-1", "kislev");
    });

    it("no claimTripReply and no Monday calls of its own — the comment path only goes through recordTripCommentLead", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);
      await drainCommentQueue();
      expect(monday.createLeadRow).not.toHaveBeenCalled();
      expect(dedup.upsertKnownSender).not.toHaveBeenCalled();
      expect(dedup.findKnownSender).not.toHaveBeenCalled();
    });

    it("a trip comment is processed even when IG_COMMENT_UMAN_ENABLED is false (that gate is for אומן rows only)", async () => {
      ENV.IG_COMMENT_UMAN_ENABLED = false;
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);

      await drainCommentQueue();

      expect(outbound.sendCommentPrivateReply).toHaveBeenCalledWith("c-1", "commenter-1", "trip", "hanukkah");
      expect(metaService.recordTripCommentLead).toHaveBeenCalledTimes(1);
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
    });

    it("a slow Monday never delays the public reply (it is posted while bookkeeping is still pending)", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);
      let release: () => void = () => undefined;
      vi.mocked(metaService.recordTripCommentLead).mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );

      const drained = drainCommentQueue();
      await vi.waitFor(() => expect(metaService.recordTripCommentLead).toHaveBeenCalled());

      expect(outbound.postCommentReply).toHaveBeenCalledTimes(1);
      expect(db.deleteQueuedComment).not.toHaveBeenCalled();

      release();
      await drained;
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
    });

    it("bookkeeping fails (non-429) → logged, deferred to monday_lead_queue, row dropped and NEVER bumped; the public reply was already out", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);
      vi.mocked(metaService.recordTripCommentLead).mockRejectedValue(new Error("monday down"));

      await drainCommentQueue();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ commentId: "c-1", commenterId: "commenter-1" }),
        expect.stringContaining("lead bookkeeping failed"),
      );
      expect(db.enqueueMondayLead).toHaveBeenCalledTimes(1);
      expect(db.enqueueMondayLead).toHaveBeenCalledWith({
        platform: "instagram",
        senderId: "commenter-1",
        senderUsername: "tester",
        displayName: "tester",
        phone: null,
        service: "uman",
        messageText: "חנוכה",
        source: "instagram",
        openClarification: false,
      });
      expect(outbound.postCommentReply).toHaveBeenCalledWith("c-1", "SENT-REPLY");
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
      expect(db.bumpQueuedComment).not.toHaveBeenCalled();
    });

    it("the fallback enqueue names an anonymous commenter 'IG commenter'", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued({ commenter_username: null })]);
      vi.mocked(metaService.recordTripCommentLead).mockRejectedValue(new Error("monday down"));

      await drainCommentQueue();

      expect(db.enqueueMondayLead).toHaveBeenCalledWith(
        expect.objectContaining({ senderId: "commenter-1", displayName: "IG commenter" }),
      );
    });

    it("a rate-limit error escaping the bookkeeping is deferred the same way (merge-safe) and never bumps the row", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);
      vi.mocked(metaService.recordTripCommentLead).mockRejectedValue(
        new MondayRateLimitError("daily", 9000, "daily cap"),
      );

      await drainCommentQueue();

      expect(db.enqueueMondayLead).toHaveBeenCalledWith(
        expect.objectContaining({ senderId: "commenter-1", service: "uman", phone: null }),
      );
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
      expect(db.bumpQueuedComment).not.toHaveBeenCalled();
    });

    it("a public reply that throws (it should not) never skips the bookkeeping or bumps the row", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);
      vi.mocked(outbound.postCommentReply).mockRejectedValue(new Error("boom"));

      await drainCommentQueue();

      expect(metaService.recordTripCommentLead).toHaveBeenCalledTimes(1);
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
      expect(db.bumpQueuedComment).not.toHaveBeenCalled();
    });

    it("a failed public reply (false) is only logged — never retried, bookkeeping still runs", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);
      vi.mocked(outbound.postCommentReply).mockResolvedValue(false);

      await drainCommentQueue();

      expect(outbound.postCommentReply).toHaveBeenCalledTimes(1);
      expect(metaService.recordTripCommentLead).toHaveBeenCalledTimes(1);
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
    });
  });

  describe("a second comment for a trip she was already DMed about", () => {
    it("owed mark for that trip → public SENT reply only: no DM, no Monday, no owed refresh; marked and dropped", async () => {
      vi.mocked(db.getOwedCommentTrips).mockReturnValue(["hanukkah"]);
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);

      await drainCommentQueue();

      expect(db.getOwedCommentTrips).toHaveBeenCalledWith("commenter-1");
      expect(outbound.postCommentReply).toHaveBeenCalledWith("c-1", "SENT-REPLY");
      expect(outbound.sendCommentPrivateReply).not.toHaveBeenCalled();
      expect(metaService.recordTripCommentLead).not.toHaveBeenCalled();
      expect(db.enqueueMondayLead).not.toHaveBeenCalled();
      expect(db.markOwedCommentFlyer).not.toHaveBeenCalled();
      expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1");
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
      expect(db.bumpQueuedComment).not.toHaveBeenCalled();
      expect(callOrder(outbound.postCommentReply)).toBeLessThan(callOrder(dedup.markMessageProcessed));
    });

    it("an owed mark for the OTHER trip does not suppress this one", async () => {
      vi.mocked(db.getOwedCommentTrips).mockReturnValue(["kislev"]);
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);

      await drainCommentQueue();

      expect(outbound.sendCommentPrivateReply).toHaveBeenCalledWith("c-1", "commenter-1", "trip", "hanukkah");
    });
  });

  describe("gates", () => {
    it("IG_COMMENT_TRIP_ENABLED switched off after enqueue → dropped at drain time with no DM and no public reply", async () => {
      ENV.IG_COMMENT_TRIP_ENABLED = false;
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);

      await drainCommentQueue();

      expect(outbound.sendCommentPrivateReply).not.toHaveBeenCalled();
      expect(outbound.postCommentReply).not.toHaveBeenCalled();
      expect(metaService.recordTripCommentLead).not.toHaveBeenCalled();
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
    });

    it("a row whose text is no longer a trip trigger → dropped without a DM (no template to pick)", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued({ comment_text: "אומן" })]);

      await drainCommentQueue();

      expect(outbound.sendCommentPrivateReply).not.toHaveBeenCalled();
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
      expect(db.bumpQueuedComment).not.toHaveBeenCalled();
    });
  });

  describe("blocked", () => {
    it("blocked (551) → public BLOCKED reply, marked, dropped; no lead, no owed mark", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("blocked");

      await drainCommentQueue();

      expect(outbound.postCommentReply).toHaveBeenCalledTimes(1);
      expect(outbound.postCommentReply).toHaveBeenCalledWith("c-1", "BLOCKED-REPLY");
      expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1");
      expect(metaService.recordTripCommentLead).not.toHaveBeenCalled();
      expect(db.enqueueMondayLead).not.toHaveBeenCalled();
      expect(db.markOwedCommentFlyer).not.toHaveBeenCalled();
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
      expect(db.bumpQueuedComment).not.toHaveBeenCalled();
    });

    it.each([0, 3, 7])("blocked (551) counts as blocked on ANY attempt (attempt_count %i)", async (attempts) => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued({ attempt_count: attempts })]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("blocked");

      await drainCommentQueue();

      expect(outbound.postCommentReply).toHaveBeenCalledWith("c-1", "BLOCKED-REPLY");
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
    });

    it("subcode 2534025 on the FIRST attempt (attempt_count 0) → blocked: public BLOCKED reply, marked, dropped", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued({ attempt_count: 0 })]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("maybe-blocked");

      await drainCommentQueue();

      expect(outbound.postCommentReply).toHaveBeenCalledWith("c-1", "BLOCKED-REPLY");
      expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1");
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
    });

    it("subcode 2534025 on a LATER attempt → silent drop (an earlier attempt may have landed): marked, dropped, NO public reply", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued({ attempt_count: 2 })]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("maybe-blocked");

      await drainCommentQueue();

      expect(outbound.postCommentReply).not.toHaveBeenCalled();
      expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1");
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
      expect(db.bumpQueuedComment).not.toHaveBeenCalled();
    });

    it("IG_COMMENT_BLOCKED_REPLY_ENABLED off → no public reply, but still marked and dropped", async () => {
      ENV.IG_COMMENT_BLOCKED_REPLY_ENABLED = false;
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("blocked");

      await drainCommentQueue();

      expect(outbound.postCommentReply).not.toHaveBeenCalled();
      expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1");
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
    });

    it("the blocked public reply failing is only logged — the row is still marked and dropped", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("blocked");
      vi.mocked(outbound.postCommentReply).mockResolvedValue(false);

      await drainCommentQueue();

      expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1");
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
      expect(db.bumpQueuedComment).not.toHaveBeenCalled();
    });
  });
});

describe("drainCommentQueue — outcomes that are not a send (all kinds)", () => {
  const kinds = [
    ["trip", () => tripQueued()],
    ["knife", () => queued({ kind: "knife" })],
    ["uman", () => queued({ kind: "uman" })],
  ] as const;

  describe.each(kinds)("%s", (kind, make) => {
    it("blocked → marked and dropped, never bumped; only a trip comment gets the public BLOCKED reply", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([make()]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("blocked");

      await drainCommentQueue();

      expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1");
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
      expect(db.bumpQueuedComment).not.toHaveBeenCalled();
      expect(metaService.recordTripCommentLead).not.toHaveBeenCalled();
      if (kind === "trip") {
        expect(outbound.postCommentReply).toHaveBeenCalledWith("c-1", "BLOCKED-REPLY");
      } else {
        expect(outbound.postCommentReply).not.toHaveBeenCalled();
      }
    });

    it("drop (permanent per-comment error) → marked and dropped silently, no public reply, never bumped", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([make()]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("drop");

      await drainCommentQueue();

      expect(dedup.markMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-1");
      expect(outbound.postCommentReply).not.toHaveBeenCalled();
      expect(metaService.recordTripCommentLead).not.toHaveBeenCalled();
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
      expect(db.bumpQueuedComment).not.toHaveBeenCalled();
    });

    it("dry-run → dropped with a log instead of retrying forever; not marked as sent", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([make()]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("dry-run");

      await drainCommentQueue();

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ commentId: "c-1" }),
        expect.stringContaining("dry-run"),
      );
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
      expect(db.bumpQueuedComment).not.toHaveBeenCalled();
      expect(dedup.markMessageProcessed).not.toHaveBeenCalled();
      expect(monday.createLeadRow).not.toHaveBeenCalled();
      expect(metaService.recordTripCommentLead).not.toHaveBeenCalled();
    });

    it("transient → bumped with the first backoff step (60s)", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([make()]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("transient");

      await drainCommentQueue();

      expect(db.bumpQueuedComment).toHaveBeenCalledWith(1, expect.any(String), 60);
      expect(db.deleteQueuedComment).not.toHaveBeenCalled();
    });

    it("unknown 4xx (rejected) → bumped, not dropped yet", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([make()]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("rejected");

      await drainCommentQueue();

      expect(db.bumpQueuedComment).toHaveBeenCalledWith(1, expect.any(String), 60);
      expect(db.deleteQueuedComment).not.toHaveBeenCalled();
      expect(dedup.markMessageProcessed).not.toHaveBeenCalled();
    });
  });

  describe("backoff and attempt caps", () => {
    it.each([
      [0, 60],
      [1, 120],
      [2, 240],
      [3, 480],
      [4, 960],
      [5, 1920],
      [6, 3600],
    ])("transient at attempt_count %i → bumped with a %i s delay (min(60 * 2^n, 3600))", async (attempts, delay) => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued({ attempt_count: attempts })]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("transient");

      await drainCommentQueue();

      expect(db.bumpQueuedComment).toHaveBeenCalledWith(1, expect.any(String), delay);
      expect(db.deleteQueuedComment).not.toHaveBeenCalled();
    });

    it("transient on the 8th attempt (attempt_count 7) → deleted with a warn, not bumped", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued({ attempt_count: 7 })]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("transient");

      await drainCommentQueue();

      expect(db.bumpQueuedComment).not.toHaveBeenCalled();
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ commentId: "c-1", commenterId: "commenter-1", kind: "trip" }),
        expect.stringContaining("max attempts"),
      );
    });

    it.each([
      [0, 60],
      [1, 120],
      [2, 240],
      [3, 480],
    ])("unknown 4xx at attempt_count %i → bumped with %i s", async (attempts, delay) => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued({ attempt_count: attempts })]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("rejected");

      await drainCommentQueue();

      expect(db.bumpQueuedComment).toHaveBeenCalledWith(1, expect.any(String), delay);
    });

    it("unknown 4xx on the 5th attempt (attempt_count 4) → dropped (deleted + warn), not bumped", async () => {
      vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued({ attempt_count: 4 })]);
      vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("rejected");

      await drainCommentQueue();

      expect(db.bumpQueuedComment).not.toHaveBeenCalled();
      expect(db.deleteQueuedComment).toHaveBeenCalledWith(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ commentId: "c-1", kind: "trip" }),
        expect.stringContaining("max attempts"),
      );
    });
  });
});

describe("drainCommentQueue — pausing the whole drain", () => {
  const T0 = new Date("2026-10-07T10:00:00Z");
  const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

  function twoItems(): QueuedComment[] {
    return [
      tripQueued({ id: 1, comment_id: "c-1", commenter_id: "commenter-1" }),
      tripQueued({ id: 2, comment_id: "c-2", commenter_id: "commenter-2" }),
    ];
  }

  it("rate-limited → paused for an hour: the item is untouched, the rest of the batch is not tried, later ticks do nothing until it lapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.mocked(db.getQueuedComments).mockReturnValue(twoItems());
    vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("rate-limited");

    await drainCommentQueue();

    expect(outbound.sendCommentPrivateReply).toHaveBeenCalledTimes(1);
    expect(db.bumpQueuedComment).not.toHaveBeenCalled();
    expect(db.deleteQueuedComment).not.toHaveBeenCalled();

    vi.mocked(db.getQueuedComments).mockClear();
    vi.setSystemTime(minutes(59));
    await drainCommentQueue();
    expect(db.getQueuedComments).not.toHaveBeenCalled();

    vi.setSystemTime(minutes(61));
    vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("sent");
    await drainCommentQueue();
    expect(db.getQueuedComments).toHaveBeenCalled();
    expect(outbound.sendCommentPrivateReply).toHaveBeenCalledWith("c-1", "commenter-1", "trip", "hanukkah");
  });

  it("token trouble (190 / token unavailable) → paused for 15 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.mocked(db.getQueuedComments).mockReturnValue(twoItems());
    vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("token");

    await drainCommentQueue();

    expect(outbound.sendCommentPrivateReply).toHaveBeenCalledTimes(1);
    expect(db.bumpQueuedComment).not.toHaveBeenCalled();

    vi.mocked(db.getQueuedComments).mockClear();
    vi.setSystemTime(minutes(14));
    await drainCommentQueue();
    expect(db.getQueuedComments).not.toHaveBeenCalled();

    vi.setSystemTime(minutes(16));
    await drainCommentQueue();
    expect(db.getQueuedComments).toHaveBeenCalled();
  });

  it("action blocked (368) → the item IS bumped, the drain is paused for 24 hours and the batch is abandoned", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.mocked(db.getQueuedComments).mockReturnValue(twoItems());
    vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("action-blocked");

    await drainCommentQueue();

    expect(outbound.sendCommentPrivateReply).toHaveBeenCalledTimes(1);
    expect(db.bumpQueuedComment).toHaveBeenCalledTimes(1);
    expect(db.bumpQueuedComment).toHaveBeenCalledWith(1, expect.any(String), 60);
    expect(db.deleteQueuedComment).not.toHaveBeenCalled();

    vi.mocked(db.getQueuedComments).mockClear();
    vi.setSystemTime(minutes(23 * 60 + 59));
    await drainCommentQueue();
    expect(db.getQueuedComments).not.toHaveBeenCalled();

    vi.setSystemTime(minutes(24 * 60 + 1));
    await drainCommentQueue();
    expect(db.getQueuedComments).toHaveBeenCalled();
  });

  it("while paused the drain returns before it reads the queue or the hourly counter", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);
    vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("rate-limited");
    await drainCommentQueue();

    vi.mocked(db.expireOldQueuedComments).mockClear();
    vi.mocked(db.getQueuedComments).mockClear();
    vi.mocked(db.countCommentDmsSentLastHour).mockClear();
    await drainCommentQueue();

    expect(db.getQueuedComments).not.toHaveBeenCalled();
    expect(db.countCommentDmsSentLastHour).not.toHaveBeenCalled();
  });

  it("resetCommentDrainPause clears an active pause", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.mocked(db.getQueuedComments).mockReturnValue([tripQueued()]);
    vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("action-blocked");
    await drainCommentQueue();

    vi.mocked(db.getQueuedComments).mockClear();
    await drainCommentQueue();
    expect(db.getQueuedComments).not.toHaveBeenCalled();

    resetCommentDrainPause();
    await drainCommentQueue();
    expect(db.getQueuedComments).toHaveBeenCalled();
  });

  it("a pause applies to the knife and uman kinds too", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.mocked(db.getQueuedComments).mockReturnValue([queued({ kind: "knife" })]);
    vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("rate-limited");
    await drainCommentQueue();

    vi.mocked(db.getQueuedComments).mockClear();
    vi.setSystemTime(minutes(30));
    await drainCommentQueue();
    expect(db.getQueuedComments).not.toHaveBeenCalled();
  });
});

// A stateful stand-in for ig_comment_queue that mimics the real SQL: a row is
// due when next_attempt_at <= now, rows come back ordered by next_attempt_at,
// created_at, id, and a bump pushes next_attempt_at out by the delay it is given.
// A bare mockReturnValue could never show whether failing rows starve healthy ones.
interface FakeRow extends QueuedComment {
  next_attempt_at: number;
}

function installFakeQueue(rows: FakeRow[]): void {
  vi.mocked(db.getQueuedComments).mockImplementation((limit: number) =>
    rows
      .filter((r) => r.next_attempt_at <= Date.now())
      .sort(
        (a, b) =>
          a.next_attempt_at - b.next_attempt_at ||
          a.created_at.localeCompare(b.created_at) ||
          a.id - b.id,
      )
      .slice(0, limit)
      .map((r) => ({ ...r })),
  );
  vi.mocked(db.bumpQueuedComment).mockImplementation((id: number, _error: string, delaySeconds: number) => {
    const row = rows.find((r) => r.id === id);
    if (row) {
      row.attempt_count += 1;
      row.next_attempt_at = Date.now() + delaySeconds * 1000;
    }
  });
  vi.mocked(db.deleteQueuedComment).mockImplementation((id: number) => {
    const index = rows.findIndex((r) => r.id === id);
    if (index >= 0) rows.splice(index, 1);
  });
}

describe("drainCommentQueue — failing rows no longer starve the queue", () => {
  const T0 = new Date("2026-10-07T10:00:00Z");
  const FAILING = ["f-1", "f-2", "f-3", "f-4", "f-5"];

  function seed(): FakeRow[] {
    return [
      ...FAILING.map((commentId, index) => ({
        ...tripQueued({
          id: index + 1,
          comment_id: commentId,
          commenter_id: `u-${index + 1}`,
          created_at: `2026-10-07 09:00:0${index}`,
        }),
        next_attempt_at: Date.now(),
      })),
      {
        ...tripQueued({ id: 6, comment_id: "good", commenter_id: "u-6", created_at: "2026-10-07 09:30:00" }),
        next_attempt_at: Date.now(),
      },
    ];
  }

  function attemptedCommentIds(): string[] {
    return vi.mocked(outbound.sendCommentPrivateReply).mock.calls.map((call) => call[0]);
  }

  it("five permanently failing older rows → the newer healthy row is sent on the second tick", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const rows = seed();
    installFakeQueue(rows);
    vi.mocked(outbound.sendCommentPrivateReply).mockImplementation(async (commentId: string) =>
      FAILING.includes(commentId) ? "transient" : "sent",
    );

    await drainCommentQueue();
    expect(attemptedCommentIds()).toEqual(FAILING);
    expect(rows.find((r) => r.comment_id === "good")).toBeDefined();

    vi.setSystemTime(new Date(T0.getTime() + 60_000));
    await drainCommentQueue();

    expect(attemptedCommentIds()).toContain("good");
    expect(rows.find((r) => r.comment_id === "good")).toBeUndefined();
    expect(metaService.recordTripCommentLead).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: "u-6" }),
    );
  });

  it("a failing row is retried on an exponential schedule and deleted after its 8th failure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const rows = seed();
    installFakeQueue(rows);
    const attemptTimes = new Map<string, number[]>();
    vi.mocked(outbound.sendCommentPrivateReply).mockImplementation(async (commentId: string) => {
      attemptTimes.set(commentId, [...(attemptTimes.get(commentId) ?? []), (Date.now() - T0.getTime()) / 1000]);
      return FAILING.includes(commentId) ? "transient" : "sent";
    });

    for (let minute = 0; minute <= 150; minute++) {
      vi.setSystemTime(new Date(T0.getTime() + minute * 60_000));
      await drainCommentQueue();
    }

    // 60 + 120 + 240 + 480 + 960 + 1920 + 3600 between the eight attempts
    expect(attemptTimes.get("f-1")).toEqual([0, 60, 180, 420, 900, 1860, 3780, 7380]);
    for (const id of FAILING) expect(attemptTimes.get(id)).toHaveLength(8);
    expect(attemptTimes.get("good")).toHaveLength(1);
    expect(rows).toEqual([]);
  });

  it("rows still inside their backoff window are not retried on the next tick", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const rows = seed().slice(0, 2); // f-1, f-2 only
    installFakeQueue(rows);
    vi.mocked(outbound.sendCommentPrivateReply).mockResolvedValue("transient");

    await drainCommentQueue();
    expect(db.bumpQueuedComment).toHaveBeenCalledTimes(2);

    vi.mocked(outbound.sendCommentPrivateReply).mockClear();
    vi.setSystemTime(new Date(T0.getTime() + 30_000)); // both still backing off
    await drainCommentQueue();
    expect(outbound.sendCommentPrivateReply).not.toHaveBeenCalled();
  });
});
