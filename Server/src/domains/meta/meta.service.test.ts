import { describe, it, expect, vi, beforeEach } from "vitest";

// All db-touching modules must be mocked before any import of meta.service.ts.
vi.mock("../../lib/dedup.js", () => ({
  isMessageProcessed: vi.fn().mockReturnValue(false),
  markMessageProcessed: vi.fn(),
  unmarkMessageProcessed: vi.fn(),
  findKnownSender: vi.fn().mockReturnValue(null),
  upsertKnownSender: vi.fn(),
  updateSenderPhone: vi.fn(),
  deleteKnownSenderByItemId: vi.fn(),
}));

vi.mock("../../lib/conversation.js", () => ({
  getPendingClarification: vi.fn().mockReturnValue(null),
  upsertPendingClarification: vi.fn(),
  incrementReaskCount: vi.fn().mockReturnValue(1),
  clearPendingClarification: vi.fn(),
  deletePendingByItemId: vi.fn(),
  advanceToTripStage: vi.fn(),
}));

// Only the LLM call is stubbed; extractPhoneFallback stays real (the trip-trigger
// path uses it instead of the classifier to pull a phone out of the message).
vi.mock("../../lib/classify.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/classify.js")>()),
  classifyLead: vi.fn(),
}));

vi.mock("../monday/monday.service.js", () => ({
  createLeadRow: vi.fn().mockResolvedValue({ itemId: "new-item-123" }),
  updateItemPhone: vi.fn().mockResolvedValue(undefined),
  updateItemService: vi.fn().mockResolvedValue(undefined),
  updateLastIgMessage: vi.fn().mockResolvedValue(undefined),
  getItemBoardAndGroup: vi.fn(),
  moveItemToGroup: vi.fn().mockResolvedValue(undefined),
  // Real two-branch logic so phone-routing assertions work without stubbing every case.
  leadGroupForPhone: vi.fn((phone: string | null | undefined) =>
    phone ? "new_group29179" : "group_mm469wrf",
  ),
  mapItemServiceToKey: vi.fn((label: string | null | undefined) =>
    !label ? null : label.includes("אומן") ? "uman" : label.includes("חלה") ? "challah" : null,
  ),
}));

vi.mock("../monday/monday.webhook.service.js", () => ({
  findLeadOnActiveServiceBoards: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../config/db.js", () => ({
  enqueueMondayLead: vi.fn(),
  findQueuedLeadBySender: vi.fn().mockReturnValue(null),
  wasKnifeDmSentRecently: vi.fn().mockReturnValue(false),
  wasTripReplySentRecently: vi.fn().mockReturnValue(false),
  claimTripReply: vi.fn().mockReturnValue(true),
  releaseTripReply: vi.fn(),
  getOwedCommentTrips: vi.fn().mockReturnValue([]),
  consumeOwedCommentFlyer: vi.fn().mockReturnValue(false),
}));

vi.mock("../whatsapp/uman-welcome.service.js", () => ({
  maybeSendUmanWelcome: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./meta.outbound.service.js", () => ({
  sendReplyDM: vi.fn().mockResolvedValue(undefined),
  sendServiceQuestion: vi.fn().mockResolvedValue(undefined),
  sendPhoneThanks: vi.fn().mockResolvedValue(undefined),
  sendTripAsk: vi.fn().mockResolvedValue(undefined),
  sendTripReply: vi.fn().mockResolvedValue(true),
  sendFlyerImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./meta.profile.service.js", () => ({
  fetchIgProfile: vi.fn().mockResolvedValue({ username: "test_user" }),
}));

import { handleIncomingMessage, recordTripCommentLead } from "./meta.service.js";
import type { Trip } from "../../lib/trip.js";
import { env } from "../../config/env.js";
import * as dedup from "../../lib/dedup.js";
import * as conversation from "../../lib/conversation.js";
import * as classify from "../../lib/classify.js";
import * as mondayService from "../monday/monday.service.js";
import * as mondayWebhookService from "../monday/monday.webhook.service.js";
import * as outbound from "./meta.outbound.service.js";
import * as umanWelcome from "../whatsapp/uman-welcome.service.js";
import * as profileService from "./meta.profile.service.js";
import * as db from "../../config/db.js";
import { MondayRateLimitError } from "../monday/monday.client.js";


const SENDER_ID = "ig_sender_001";
const ITEM_ID = "crm-item-456";
const NEW_LEADS_GROUP = env.MONDAY_GROUP_NEW_LEADS_ID;
const NO_PHONE_GROUP = env.MONDAY_GROUP_NO_PHONE_ID;
const CRM_BOARD = env.MONDAY_BOARD_CRM_ID;

const interestedClassification = {
  interested: true,
  service: "uman" as const,
  extractedName: "Test User",
  extractedPhone: "0501234567",
  confidence: 0.95,
  rawResponse: "",
};

const notInterestedClassification = {
  interested: false,
  service: null,
  extractedName: null,
  extractedPhone: null,
  confidence: 0.1,
  rawResponse: "",
};

// Interested but names no service (the "vague" case).
const vagueClassification = {
  interested: true,
  service: null,
  extractedName: null,
  extractedPhone: null,
  confidence: 0.8,
  rawResponse: "",
};

// Stateful stand-in for the processed_webhooks-backed per-trip 24h slot. A bare
// mockReturnValue(true/false) would let a second send slip through unnoticed,
// which would make every "sent exactly once" assertion vacuous. Mirrors the real
// contract: a held key can't be claimed again, release gives it back.
const tripRepliesSent = new Set<string>();
const tripKey = (senderId: string, trip: string): string => `${senderId}:${trip}`;

// Same idea for the "owed flyer" marks a trip-word comment leaves behind: consume
// must hand out each mark exactly once, or the single-fire assertions mean nothing.
const owedMarks = new Map<string, Set<Trip>>();

beforeEach(() => {
  vi.clearAllMocks();
  tripRepliesSent.clear();
  owedMarks.clear();
  vi.mocked(db.getOwedCommentTrips).mockImplementation((senderId) => [...(owedMarks.get(senderId) ?? [])]);
  vi.mocked(db.consumeOwedCommentFlyer).mockImplementation(
    (senderId, trip) => owedMarks.get(senderId)?.delete(trip) ?? false,
  );
  vi.mocked(outbound.sendFlyerImage).mockResolvedValue(undefined);
  vi.mocked(db.wasTripReplySentRecently).mockImplementation((senderId, trip) =>
    tripRepliesSent.has(tripKey(senderId, trip)),
  );
  vi.mocked(db.claimTripReply).mockImplementation((senderId, trip) => {
    const key = tripKey(senderId, trip);
    if (tripRepliesSent.has(key)) return false;
    tripRepliesSent.add(key);
    return true;
  });
  vi.mocked(db.releaseTripReply).mockImplementation((senderId, trip) => {
    tripRepliesSent.delete(tripKey(senderId, trip));
  });
  vi.mocked(dedup.isMessageProcessed).mockReturnValue(false);
  vi.mocked(dedup.unmarkMessageProcessed).mockReturnValue(undefined);
  vi.mocked(dedup.findKnownSender).mockReturnValue(null);
  vi.mocked(conversation.getPendingClarification).mockReturnValue(null);
  vi.mocked(conversation.incrementReaskCount).mockReturnValue(1);
  vi.mocked(classify.classifyLead).mockResolvedValue(interestedClassification);
  vi.mocked(mondayService.createLeadRow).mockResolvedValue({ itemId: "new-item-123" });
  vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue(null);
  vi.mocked(mondayService.updateItemService).mockResolvedValue(undefined);
  vi.mocked(mondayWebhookService.findLeadOnActiveServiceBoards).mockResolvedValue(null);
  vi.mocked(outbound.sendReplyDM).mockResolvedValue(undefined);
  vi.mocked(outbound.sendServiceQuestion).mockResolvedValue(undefined);
  vi.mocked(outbound.sendPhoneThanks).mockResolvedValue(undefined);
  vi.mocked(outbound.sendTripAsk).mockResolvedValue(undefined);
  vi.mocked(outbound.sendTripReply).mockResolvedValue(true);
  vi.mocked(db.findQueuedLeadBySender).mockReturnValue(null);
  vi.mocked(db.wasKnifeDmSentRecently).mockReturnValue(false);
  // mockReset (not just a new default): a queued once-implementation must not leak into the next test.
  vi.mocked(profileService.fetchIgProfile).mockReset().mockResolvedValue({ id: "profile-id", username: "test_user" });
});

describe("handleIncomingMessage — live row in another group + interested", () => {
  it("moves row back to new-leads group; no createLeadRow", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: "some_other_group",
      service: null,
    });

    const result = await handleIncomingMessage({
      messageText: "אני מעוניינת",
      senderId: SENDER_ID,
      messageId: "msg1",
    });

    expect(mondayService.moveItemToGroup).toHaveBeenCalledWith(ITEM_ID, NEW_LEADS_GROUP);
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
    expect(result.itemId).toBe(ITEM_ID);
  });
});

describe("handleIncomingMessage — live row already in new-leads + interested", () => {
  it("does not call moveItemToGroup", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: null,
    });

    await handleIncomingMessage({
      messageText: "אני מעוניינת",
      senderId: SENDER_ID,
      messageId: "msg2",
    });

    expect(mondayService.moveItemToGroup).not.toHaveBeenCalled();
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
  });
});

describe("handleIncomingMessage — live row + not interested", () => {
  it("calls updateLastIgMessage, no move, no createLeadRow", async () => {
    vi.mocked(classify.classifyLead).mockResolvedValue(notInterestedClassification);
    vi.mocked(dedup.findKnownSender).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: "followup_group",
      service: null,
    });

    await handleIncomingMessage({
      messageText: "לא תודה",
      senderId: SENDER_ID,
      messageId: "msg3",
    });

    expect(mondayService.updateLastIgMessage).toHaveBeenCalledWith(ITEM_ID, "לא תודה");
    expect(mondayService.moveItemToGroup).not.toHaveBeenCalled();
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
  });
});

describe("handleIncomingMessage — stale mapping (getItemBoardAndGroup → null) + interested + no service board hit", () => {
  it("deletes mapping, creates new row, upserts sender, sends DM; does NOT call updateLastIgMessage on stale id", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({
      monday_item_id: "stale-item-id",
      phone: "0509999999",
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue(null);
    vi.mocked(mondayWebhookService.findLeadOnActiveServiceBoards).mockResolvedValue(null);

    const result = await handleIncomingMessage({
      messageText: "מעוניינת לטוס",
      senderId: SENDER_ID,
      messageId: "msg4",
    });

    expect(dedup.deleteKnownSenderByItemId).toHaveBeenCalledWith("stale-item-id");
    expect(mondayService.createLeadRow).toHaveBeenCalled();
    expect(dedup.upsertKnownSender).toHaveBeenCalled();
    // updateLastIgMessage must NOT be called with the stale item id
    const calls = vi.mocked(mondayService.updateLastIgMessage).mock.calls;
    expect(calls.every(([id]) => id !== "stale-item-id")).toBe(true);
    // default classification names uman with no trip word in this message → trip-ask, not sendReplyDM.
    expect(outbound.sendTripAsk).toHaveBeenCalledWith(SENDER_ID);
    expect(outbound.sendReplyDM).not.toHaveBeenCalled();
    expect(result.itemId).toBe("new-item-123");
  });
});

describe("handleIncomingMessage — stale mapping + interested + findLeadOnBoard returns a hit", () => {
  it("does not call createLeadRow; returns itemId null", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({
      monday_item_id: "stale-item-id",
      phone: "0509999999",
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue(null);
    vi.mocked(mondayWebhookService.findLeadOnActiveServiceBoards).mockResolvedValue({
      itemId: "service-item-222",
      boardId: "service-board-111",
    });

    const result = await handleIncomingMessage({
      messageText: "מעוניינת לטוס",
      senderId: SENDER_ID,
      messageId: "msg5",
    });

    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
    expect(result.itemId).toBeNull();
  });
});

describe("handleIncomingMessage — stale mapping + not interested", () => {
  it("deletes stale mapping, no createLeadRow", async () => {
    vi.mocked(classify.classifyLead).mockResolvedValue(notInterestedClassification);
    vi.mocked(dedup.findKnownSender).mockReturnValue({
      monday_item_id: "stale-item-id",
      phone: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue(null);

    await handleIncomingMessage({
      messageText: "לא תודה",
      senderId: SENDER_ID,
      messageId: "msg6",
    });

    expect(dedup.deleteKnownSenderByItemId).toHaveBeenCalledWith("stale-item-id");
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
  });
});

describe("handleIncomingMessage — stale where item lives on NON-CRM board", () => {
  it("treats as stale (boardId !== CRM_BOARD), deletes mapping, creates new row", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({
      monday_item_id: "service-board-item",
      phone: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: "some-other-board-999",
      groupId: "group-a",
      service: null,
    });
    vi.mocked(mondayWebhookService.findLeadOnActiveServiceBoards).mockResolvedValue(null);

    await handleIncomingMessage({
      messageText: "מעוניינת",
      senderId: SENDER_ID,
      messageId: "msg7",
    });

    expect(dedup.deleteKnownSenderByItemId).toHaveBeenCalledWith("service-board-item");
    expect(mondayService.createLeadRow).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// New: service-based routing (Entry A) + the clarification flow (Entry B)
// ---------------------------------------------------------------------------

describe("handleIncomingMessage — new lead names uman only, no trip (Entry A)", () => {
  it("uman + phone, no trip word → createLeadRow(service uman), asks WHICH trip, opens pending at stage 'trip'", async () => {
    const result = await handleIncomingMessage({
      messageText: "אני רוצה טיסה לאומן 0501234567",
      senderId: SENDER_ID,
      messageId: "entryA1",
    });

    expect(mondayService.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ service: "uman" }),
    );
    expect(outbound.sendTripAsk).toHaveBeenCalledWith(SENDER_ID);
    expect(outbound.sendReplyDM).not.toHaveBeenCalled();
    expect(outbound.sendServiceQuestion).not.toHaveBeenCalled();
    expect(conversation.upsertPendingClarification).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, mondayItemId: "new-item-123", stage: "trip" }),
    );
    expect(result.itemId).toBe("new-item-123");
  });
});

describe("handleIncomingMessage — new lead names uman AND a trip (skips both questions)", () => {
  it("uman + hanukkah + phone → createLeadRow(service uman), sends the hanukkah trip reply + flyer, no pending opened", async () => {
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...interestedClassification,
      service: "uman",
      extractedPhone: "0501234567",
    });

    const result = await handleIncomingMessage({
      messageText: "אני רוצה טיסה לאומן בחנוכה, המספר שלי 0501234567",
      senderId: SENDER_ID,
      messageId: "entryA-trip-1",
    });

    expect(mondayService.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ service: "uman" }),
    );
    expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, {
      trip: "hanukkah",
      hasPhone: true,
    });
    expect(outbound.sendTripAsk).not.toHaveBeenCalled();
    expect(outbound.sendReplyDM).not.toHaveBeenCalled();
    expect(conversation.upsertPendingClarification).not.toHaveBeenCalled();
    expect(result.itemId).toBe("new-item-123");
  });

  it("service null but a trip word is present → still treated as uman, sends the kislev trip reply", async () => {
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...vagueClassification,
      extractedPhone: null,
    });

    const result = await handleIncomingMessage({
      messageText: 'מעוניינת בנסיעה של ר"ח כסלו',
      senderId: SENDER_ID,
      messageId: "entryA-trip-2",
    });

    expect(mondayService.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ service: "uman" }),
    );
    expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, {
      trip: "kislev",
      hasPhone: false,
    });
    expect(conversation.upsertPendingClarification).not.toHaveBeenCalled();
    expect(result.itemId).toBe("new-item-123");
  });
});

describe("handleIncomingMessage — new vague lead (Entry B step 1)", () => {
  it("creates row with service null, opens a pending clarification, asks the question, no reply DM", async () => {
    vi.mocked(classify.classifyLead).mockResolvedValue(vagueClassification);

    const result = await handleIncomingMessage({
      messageText: "היי אני מעוניינת",
      senderId: SENDER_ID,
      messageId: "vague1",
    });

    expect(mondayService.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ service: null }),
    );
    expect(conversation.upsertPendingClarification).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, mondayItemId: "new-item-123" }),
    );
    expect(outbound.sendServiceQuestion).toHaveBeenCalledWith(SENDER_ID);
    expect(outbound.sendReplyDM).not.toHaveBeenCalled();
    expect(result.itemId).toBe("new-item-123");
  });
});

describe("handleIncomingMessage — knife-DM recipient suppression", () => {
  it("vague-interested new sender WITH a recent knife-DM mark → no ask-service, no row created", async () => {
    vi.mocked(classify.classifyLead).mockResolvedValue(vagueClassification);
    vi.mocked(db.wasKnifeDmSentRecently).mockReturnValue(true);

    const result = await handleIncomingMessage({
      messageText: "היי מה קורה",
      senderId: SENDER_ID,
      messageId: "knife-suppress-1",
    });

    expect(outbound.sendServiceQuestion).not.toHaveBeenCalled();
    expect(conversation.upsertPendingClarification).not.toHaveBeenCalled();
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
    expect(result.itemId).toBeNull();
  });

  it("vague-interested new sender WITHOUT the mark → unchanged (ask-service still fires)", async () => {
    vi.mocked(classify.classifyLead).mockResolvedValue(vagueClassification);
    vi.mocked(db.wasKnifeDmSentRecently).mockReturnValue(false);

    const result = await handleIncomingMessage({
      messageText: "היי אני מעוניינת",
      senderId: SENDER_ID,
      messageId: "knife-suppress-2",
    });

    expect(outbound.sendServiceQuestion).toHaveBeenCalledWith(SENDER_ID);
    expect(mondayService.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ service: null }),
    );
    expect(result.itemId).toBe("new-item-123");
  });

  it("explicit uman message WITH the mark → still processed normally (not suppressed)", async () => {
    // interestedClassification names service "uman" explicitly, no trip word → trip-ask.
    vi.mocked(db.wasKnifeDmSentRecently).mockReturnValue(true);

    const result = await handleIncomingMessage({
      messageText: "אני רוצה טיסה לאומן 0501234567",
      senderId: SENDER_ID,
      messageId: "knife-suppress-3",
    });

    expect(mondayService.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ service: "uman" }),
    );
    expect(outbound.sendTripAsk).toHaveBeenCalledWith(SENDER_ID);
    expect(result.itemId).toBe("new-item-123");
  });

  it("vague message (no service) WITH a trip word AND the knife mark → NOT suppressed (a named trip is not genuinely vague)", async () => {
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...vagueClassification,
      extractedPhone: "0501234567",
    });
    vi.mocked(db.wasKnifeDmSentRecently).mockReturnValue(true);

    const result = await handleIncomingMessage({
      messageText: "מעוניינת בנסיעת חנוכה 0501234567",
      senderId: SENDER_ID,
      messageId: "knife-suppress-4",
    });

    expect(mondayService.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ service: "uman" }),
    );
    expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, {
      trip: "hanukkah",
      hasPhone: true,
    });
    expect(result.itemId).toBe("new-item-123");
  });
});

describe("handleIncomingMessage — pending lead answers with a service (Entry B step 2)", () => {
  it("challah — updates service, sends answered reply, clears pending, no new row", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 0,
      stage: "service" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...interestedClassification,
      service: "challah",
      extractedPhone: "0526964676",
    });

    const result = await handleIncomingMessage({
      messageText: "הפרשת חלה 0526964676",
      senderId: SENDER_ID,
      messageId: "ansB1",
    });

    expect(mondayService.updateItemService).toHaveBeenCalledWith(ITEM_ID, "challah");
    expect(outbound.sendReplyDM).toHaveBeenCalledWith(SENDER_ID, {
      service: "challah",
      hasPhone: true,
      answered: true,
    });
    expect(conversation.clearPendingClarification).toHaveBeenCalledWith("instagram", SENDER_ID);
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
    expect(result.itemId).toBe(ITEM_ID);
  });

  it("uman, no trip named → advances to trip stage, sends trip-ask, does NOT clear pending", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 0,
      stage: "service" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...interestedClassification,
      service: "uman",
      extractedPhone: "0526964676",
    });

    const result = await handleIncomingMessage({
      messageText: "אומן 0526964676",
      senderId: SENDER_ID,
      messageId: "ansB1",
    });

    expect(mondayService.updateItemService).toHaveBeenCalledWith(ITEM_ID, "uman");
    expect(outbound.sendTripAsk).toHaveBeenCalledWith(SENDER_ID);
    expect(outbound.sendReplyDM).not.toHaveBeenCalled();
    expect(conversation.advanceToTripStage).toHaveBeenCalledWith("instagram", SENDER_ID);
    expect(conversation.clearPendingClarification).not.toHaveBeenCalled();
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
    expect(result.itemId).toBe(ITEM_ID);
  });

  it("uman + trip named in the same message → resolves immediately with the trip reply, clears pending", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 0,
      stage: "service" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...interestedClassification,
      service: "uman",
      extractedPhone: "0526964676",
    });

    const result = await handleIncomingMessage({
      messageText: "אומן, ר\"ח כסלו 0526964676",
      senderId: SENDER_ID,
      messageId: "ansB1-trip",
    });

    expect(mondayService.updateItemService).toHaveBeenCalledWith(ITEM_ID, "uman");
    expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: true });
    expect(outbound.sendTripAsk).not.toHaveBeenCalled();
    expect(conversation.clearPendingClarification).toHaveBeenCalledWith("instagram", SENDER_ID);
    expect(result.itemId).toBe(ITEM_ID);
  });
});

// ---------------------------------------------------------------------------
// Trip stage — pending.stage === "trip" (uman-only, asked once the service is
// known). Mirrors the service-stage suite below, but for the "which trip?"
// question.
// ---------------------------------------------------------------------------

describe("handleIncomingMessage — trip stage, she names a trip", () => {
  it("resolves with the trip reply, clears pending, fires the uman welcome", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: "0501234567",
      reask_count: 0,
      stage: "trip" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: "טיסה לאומן",
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...interestedClassification,
      service: "uman",
      extractedPhone: null,
    });

    const result = await handleIncomingMessage({
      messageText: "חנוכה מתאים לי",
      senderId: SENDER_ID,
      messageId: "trip-answer-1",
    });

    expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "hanukkah", hasPhone: true });
    expect(conversation.clearPendingClarification).toHaveBeenCalledWith("instagram", SENDER_ID);
    expect(umanWelcome.maybeSendUmanWelcome).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, mondayItemId: ITEM_ID, service: "uman", phone: "0501234567" }),
    );
    expect(result.itemId).toBe(ITEM_ID);
  });

  it("a trip answer arriving together with a NEW phone → hasPhone true, phone persisted", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 0,
      stage: "trip" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NO_PHONE_GROUP,
      service: "טיסה לאומן",
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...interestedClassification,
      service: "uman",
      extractedPhone: "0501234567",
    });

    const result = await handleIncomingMessage({
      messageText: 'ר"ח כסלו, המספר שלי 0501234567',
      senderId: SENDER_ID,
      messageId: "trip-answer-2",
    });

    expect(mondayService.updateItemPhone).toHaveBeenCalledWith(ITEM_ID, "0501234567");
    expect(mondayService.moveItemToGroup).toHaveBeenCalledWith(ITEM_ID, NEW_LEADS_GROUP);
    expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: true });
    expect(result.itemId).toBe(ITEM_ID);
  });

  it("a named trip resolves even on a message the classifier marks not-interested (trip check runs first)", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: "0501234567",
      reask_count: 0,
      stage: "trip" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: "טיסה לאומן",
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...notInterestedClassification,
      extractedPhone: null,
    });

    const result = await handleIncomingMessage({
      messageText: "חנוכה",
      senderId: SENDER_ID,
      messageId: "trip-answer-3",
    });

    expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "hanukkah", hasPhone: true });
    expect(conversation.clearPendingClarification).toHaveBeenCalledWith("instagram", SENDER_ID);
    expect(result.itemId).toBe(ITEM_ID);
  });
});

describe("handleIncomingMessage — trip stage, unclear answer (no trip named)", () => {
  it("still interested, under the cap → re-asks which trip, increments the count", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 1,
      stage: "trip" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NO_PHONE_GROUP,
      service: "טיסה לאומן",
    });
    vi.mocked(classify.classifyLead).mockResolvedValue(vagueClassification);

    await handleIncomingMessage({
      messageText: "מתי זה יוצא?",
      senderId: SENDER_ID,
      messageId: "trip-reask-1",
    });

    expect(outbound.sendTripAsk).toHaveBeenCalledWith(SENDER_ID);
    expect(conversation.incrementReaskCount).toHaveBeenCalledWith("instagram", SENDER_ID);
    expect(outbound.sendTripReply).not.toHaveBeenCalled();
    expect(conversation.clearPendingClarification).not.toHaveBeenCalled();
  });

  it("cap reached → stays silent, pending is preserved (not cleared)", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 3,
      stage: "trip" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NO_PHONE_GROUP,
      service: "טיסה לאומן",
    });
    vi.mocked(classify.classifyLead).mockResolvedValue(vagueClassification);

    await handleIncomingMessage({
      messageText: "מתי זה יוצא?",
      senderId: SENDER_ID,
      messageId: "trip-reask-2",
    });

    expect(outbound.sendTripAsk).not.toHaveBeenCalled();
    expect(conversation.incrementReaskCount).not.toHaveBeenCalled();
    expect(conversation.clearPendingClarification).not.toHaveBeenCalled();
  });

  it("not interested and no trip named → clears pending, stays silent", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 0,
      stage: "trip" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NO_PHONE_GROUP,
      service: "טיסה לאומן",
    });
    vi.mocked(classify.classifyLead).mockResolvedValue(notInterestedClassification);

    await handleIncomingMessage({
      messageText: "לא תודה",
      senderId: SENDER_ID,
      messageId: "trip-decline-1",
    });

    expect(conversation.clearPendingClarification).toHaveBeenCalledWith("instagram", SENDER_ID);
    expect(outbound.sendTripAsk).not.toHaveBeenCalled();
    expect(outbound.sendTripReply).not.toHaveBeenCalled();
  });
});

describe("handleIncomingMessage — pending lead replies WITHOUT a service", () => {
  it("re-asks and increments when under the cap", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 1,
      stage: "service" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue(vagueClassification);

    await handleIncomingMessage({
      messageText: "מתי זה?",
      senderId: SENDER_ID,
      messageId: "reask1",
    });

    expect(outbound.sendServiceQuestion).toHaveBeenCalledWith(SENDER_ID);
    expect(conversation.incrementReaskCount).toHaveBeenCalledWith("instagram", SENDER_ID);
    expect(outbound.sendReplyDM).not.toHaveBeenCalled();
    expect(mondayService.updateItemService).not.toHaveBeenCalled();
  });

  it("stays silent once the re-ask cap is reached", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 3,
      stage: "service" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue(vagueClassification);

    await handleIncomingMessage({
      messageText: "מתי זה?",
      senderId: SENDER_ID,
      messageId: "reask2",
    });

    expect(outbound.sendServiceQuestion).not.toHaveBeenCalled();
    expect(conversation.incrementReaskCount).not.toHaveBeenCalled();
  });
});

describe("handleIncomingMessage — pending lead replies NOT interested", () => {
  it("clears pending, stays silent — no re-ask, no DM, no service update", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 0,
      stage: "service" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue(notInterestedClassification);

    const result = await handleIncomingMessage({
      messageText: "לא תודה",
      senderId: SENDER_ID,
      messageId: "decline1",
    });

    expect(conversation.clearPendingClarification).toHaveBeenCalledWith("instagram", SENDER_ID);
    expect(outbound.sendServiceQuestion).not.toHaveBeenCalled();
    expect(outbound.sendReplyDM).not.toHaveBeenCalled();
    expect(mondayService.updateItemService).not.toHaveBeenCalled();
    expect(conversation.incrementReaskCount).not.toHaveBeenCalled();
    expect(result.itemId).toBe(ITEM_ID);
  });
});

describe("handleIncomingMessage — pending mapping is stale", () => {
  it("clears pending + known mapping, then creates a fresh row", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: "stale-pending-id",
      phone: "0509999999",
      reask_count: 0,
      stage: "service" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue(null);
    vi.mocked(dedup.findKnownSender).mockReturnValue(null);
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...interestedClassification,
      service: "uman",
      extractedPhone: null,
    });

    await handleIncomingMessage({
      messageText: "אומן",
      senderId: SENDER_ID,
      messageId: "stalepending1",
    });

    expect(conversation.deletePendingByItemId).toHaveBeenCalledWith("stale-pending-id");
    expect(dedup.deleteKnownSenderByItemId).toHaveBeenCalledWith("stale-pending-id");
    expect(mondayService.createLeadRow).toHaveBeenCalled();
  });
});

describe("handleIncomingMessage — returning live lead names a service", () => {
  it("updates the service column, no new row", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: "0501234567",
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...interestedClassification,
      service: "challah",
      extractedPhone: null,
    });

    await handleIncomingMessage({
      messageText: "רוצה הפרשת חלה",
      senderId: SENDER_ID,
      messageId: "svc1",
    });

    expect(mondayService.updateItemService).toHaveBeenCalledWith(ITEM_ID, "challah");
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
  });
});

describe("handleIncomingMessage — returning lead, service already set (fill-only)", () => {
  it("does NOT overwrite an existing service from a later mention", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: "0501234567",
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: "טיסות לאומן", // already set to uman
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...interestedClassification,
      service: "challah",
      extractedPhone: null,
    });

    await handleIncomingMessage({
      messageText: "חלה זה טעים",
      senderId: SENDER_ID,
      messageId: "fillonly1",
    });

    expect(mondayService.updateItemService).not.toHaveBeenCalled();
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
  });
});

describe("handleIncomingMessage — pending takes precedence over known-sender branch", () => {
  it("resolves via the pending answer path; findKnownSender is never consulted", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 0,
      stage: "service" as const,
      trip: null,
    });
    vi.mocked(dedup.findKnownSender).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...interestedClassification,
      service: "uman",
      extractedPhone: null,
    });

    await handleIncomingMessage({
      messageText: "אומן",
      senderId: SENDER_ID,
      messageId: "order1",
    });

    // No trip word in "אומן" → advances to the trip question rather than
    // resolving; the pending-precedence guarantee (findKnownSender skipped)
    // still holds regardless.
    expect(outbound.sendTripAsk).toHaveBeenCalledWith(SENDER_ID);
    expect(outbound.sendReplyDM).not.toHaveBeenCalled();
    expect(conversation.clearPendingClarification).not.toHaveBeenCalled();
    expect(dedup.findKnownSender).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// No-phone group routing
// ---------------------------------------------------------------------------

describe("handleIncomingMessage — new interested lead with NO phone → no-phone group", () => {
  it("calls createLeadRow with phone: null; createLeadRow receives null so group is no-phone", async () => {
    vi.mocked(classify.classifyLead).mockResolvedValue({
      interested: true,
      service: "uman" as const,
      extractedName: null,
      extractedPhone: null,
      confidence: 0.9,
      rawResponse: "",
    });

    await handleIncomingMessage({
      messageText: "אני רוצה לטוס לאומן",
      senderId: SENDER_ID,
      messageId: "nophone1",
    });

    expect(mondayService.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null }),
    );
  });
});

describe("handleIncomingMessage — known no-phone sender sends phone → moves to new-leads", () => {
  it("calls updateItemPhone AND moveItemToGroup with new-leads id", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NO_PHONE_GROUP,
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      interested: true,
      service: null,
      extractedName: null,
      extractedPhone: "0501234567",
      confidence: 0.9,
      rawResponse: "",
    });

    await handleIncomingMessage({
      messageText: "מספר שלי 050-123-4567",
      senderId: SENDER_ID,
      messageId: "phonecapture1",
    });

    expect(mondayService.updateItemPhone).toHaveBeenCalledWith(ITEM_ID, "0501234567");
    expect(mondayService.moveItemToGroup).toHaveBeenCalledWith(ITEM_ID, NEW_LEADS_GROUP);
  });
});

describe("handleIncomingMessage — known no-phone lead sends phone in a NOT-interested message", () => {
  it("still captures phone + moves to new-leads (phone is the sole gate, even when interested:false)", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NO_PHONE_GROUP,
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      interested: false,
      service: null,
      extractedName: null,
      extractedPhone: "0501234567",
      confidence: 0.2,
      rawResponse: "",
    });

    const result = await handleIncomingMessage({
      messageText: "0501234567",
      senderId: SENDER_ID,
      messageId: "nophone_notinterested1",
    });

    expect(mondayService.updateItemPhone).toHaveBeenCalledWith(ITEM_ID, "0501234567");
    expect(mondayService.moveItemToGroup).toHaveBeenCalledWith(ITEM_ID, NEW_LEADS_GROUP);
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
    expect(result.itemId).toBe(ITEM_ID);
  });
});

describe("handleIncomingMessage — not-interested, no-phone lead in another group → NOT disturbed", () => {
  it("does not move a no-phone lead out of its current group on a not-interested message", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: "followup_group",
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue(notInterestedClassification);

    await handleIncomingMessage({
      messageText: "תודה רבה",
      senderId: SENDER_ID,
      messageId: "notdisturb1",
    });

    expect(mondayService.moveItemToGroup).not.toHaveBeenCalled();
  });
});

describe("handleIncomingMessage — pending lead names service, still no phone → stays in no-phone group", () => {
  it("if lead has no phone after service answer, target is no-phone group (no move away from it)", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 0,
      stage: "service" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NO_PHONE_GROUP,
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      interested: true,
      service: "uman" as const,
      extractedName: null,
      extractedPhone: null,
      confidence: 0.9,
      rawResponse: "",
    });

    await handleIncomingMessage({
      messageText: "אומן",
      senderId: SENDER_ID,
      messageId: "nophoneservice1",
    });

    // Target resolves to no-phone group; groupId already matches → no move call.
    expect(mondayService.moveItemToGroup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// WhatsApp Uman welcome trigger (gating happens inside maybeSendUmanWelcome)
// ---------------------------------------------------------------------------

describe("handleIncomingMessage — WhatsApp uman welcome trigger", () => {
  it("new interested uman lead with a phone → maybeSendUmanWelcome(uman, phone)", async () => {
    // default interestedClassification: service uman, phone 0501234567
    await handleIncomingMessage({
      messageText: "אני רוצה טיסה לאומן 0501234567",
      senderId: SENDER_ID,
      messageId: "wa-welcome-1",
    });

    expect(umanWelcome.maybeSendUmanWelcome).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, service: "uman", phone: "0501234567" }),
    );
  });

  it("known uman lead pastes a BARE number that classifies NOT-interested → welcome STILL called (above the gate)", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: null });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NO_PHONE_GROUP,
      service: "טיסות לאומן", // stored uman (lead was classified interested earlier)
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      interested: false, // a bare number carries no interest signal
      service: null,
      extractedName: null,
      extractedPhone: "0526964676",
      confidence: 0.3,
      rawResponse: "",
    });

    await handleIncomingMessage({
      messageText: "0526964676",
      senderId: SENDER_ID,
      messageId: "wa-welcome-2",
    });

    // Existing CRM uman lead + a new phone ⇒ welcome, regardless of this
    // message's interested flag (service recovered from the stored Monday label).
    expect(umanWelcome.maybeSendUmanWelcome).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, service: "uman", phone: "0526964676" }),
    );
  });

  it("not-interested new sender → welcome NOT called", async () => {
    vi.mocked(classify.classifyLead).mockResolvedValue(notInterestedClassification);

    await handleIncomingMessage({
      messageText: "לא תודה",
      senderId: SENDER_ID,
      messageId: "wa-welcome-3",
    });

    expect(umanWelcome.maybeSendUmanWelcome).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Fix 1 — dedup claim released on side-effect failure
// ---------------------------------------------------------------------------

describe("handleIncomingMessage — unmarkMessageProcessed on failure", () => {
  it("calls unmarkMessageProcessed when a Monday side-effect throws, and re-throws", async () => {
    // createLeadRow throws after the dedup mark is set
    vi.mocked(mondayService.createLeadRow).mockRejectedValue(new Error("Monday down"));

    await expect(
      handleIncomingMessage({
        messageText: "אני רוצה לטוס לאומן",
        senderId: SENDER_ID,
        messageId: "unmark-1",
      }),
    ).rejects.toThrow("Monday down");

    expect(dedup.markMessageProcessed).toHaveBeenCalledWith("meta", "unmark-1");
    expect(dedup.unmarkMessageProcessed).toHaveBeenCalledWith("meta", "unmark-1");
  });

  it("does NOT call unmarkMessageProcessed when messageId is absent", async () => {
    vi.mocked(mondayService.createLeadRow).mockRejectedValue(new Error("Monday down"));

    await expect(
      handleIncomingMessage({
        messageText: "אני רוצה לטוס לאומן",
        senderId: SENDER_ID,
        // no messageId
      }),
    ).rejects.toThrow("Monday down");

    expect(dedup.unmarkMessageProcessed).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Fix 2 — failing DM send must not abort lead creation
// ---------------------------------------------------------------------------

describe("handleIncomingMessage — DM send failure is non-fatal", () => {
  it("resolves and creates lead even when sendTripAsk throws (default classification has no trip word)", async () => {
    vi.mocked(outbound.sendTripAsk).mockRejectedValue(new Error("IG API 503"));

    const result = await handleIncomingMessage({
      messageText: "אני רוצה טיסה לאומן 0501234567",
      senderId: SENDER_ID,
      messageId: "dm-fail-1",
    });

    expect(mondayService.createLeadRow).toHaveBeenCalled();
    expect(result.itemId).toBe("new-item-123");
    // the dedup mark must remain (not unmarked)
    expect(dedup.unmarkMessageProcessed).not.toHaveBeenCalled();
  });

  it("resolves and creates lead even when sendTripReply throws (trip named in the message)", async () => {
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...interestedClassification,
      service: "uman",
      extractedPhone: "0501234567",
    });
    vi.mocked(outbound.sendTripReply).mockRejectedValue(new Error("IG API 503"));

    const result = await handleIncomingMessage({
      messageText: "אני רוצה טיסה לאומן בחנוכה 0501234567",
      senderId: SENDER_ID,
      messageId: "dm-fail-1b",
    });

    expect(mondayService.createLeadRow).toHaveBeenCalled();
    expect(result.itemId).toBe("new-item-123");
    expect(dedup.unmarkMessageProcessed).not.toHaveBeenCalled();
  });

  it("resolves and creates lead even when sendServiceQuestion throws", async () => {
    vi.mocked(classify.classifyLead).mockResolvedValue(vagueClassification);
    vi.mocked(outbound.sendServiceQuestion).mockRejectedValue(new Error("IG 429"));

    const result = await handleIncomingMessage({
      messageText: "היי אני מעוניינת",
      senderId: SENDER_ID,
      messageId: "dm-fail-2",
    });

    expect(mondayService.createLeadRow).toHaveBeenCalled();
    expect(result.itemId).toBe("new-item-123");
    expect(dedup.unmarkMessageProcessed).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// monday_lead_queue — 429 resilience (Phase 2)
// ---------------------------------------------------------------------------

describe("handleIncomingMessage — createLeadRow rate-limited (daily)", () => {
  it("enqueues the lead, still sends the first-contact DM, resolves itemId:null without throwing", async () => {
    vi.mocked(mondayService.createLeadRow).mockRejectedValue(
      new MondayRateLimitError("daily", 9000, "daily cap"),
    );

    const result = await handleIncomingMessage({
      messageText: "אני רוצה טיסה לאומן 0501234567",
      senderId: SENDER_ID,
      messageId: "ratelimit-1",
    });

    expect(result.itemId).toBeNull();
    expect(db.enqueueMondayLead).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "instagram",
        senderId: SENDER_ID,
        phone: "0501234567",
        service: "uman",
        openClarification: true,
        openClarificationStage: "trip",
      }),
    );
    // No trip word in this message → the deferred first-contact sequence asks
    // which trip, not the (now unreachable) direct uman reply.
    expect(outbound.sendTripAsk).toHaveBeenCalledWith(SENDER_ID);
    expect(outbound.sendReplyDM).not.toHaveBeenCalled();
    // F3: no mondayItemId exists yet on this path, so the welcome must NOT
    // fire here at all — Monday's own create_item lead-ready webhook fires it
    // once the queue eventually creates the row (single dedup key).
    expect(umanWelcome.maybeSendUmanWelcome).not.toHaveBeenCalled();
    expect(dedup.unmarkMessageProcessed).not.toHaveBeenCalled();
  });
});

describe("handleIncomingMessage — sender already queued", () => {
  it("second message merges into monday_lead_queue; no DM, no fetchIgProfile/create", async () => {
    vi.mocked(db.findQueuedLeadBySender).mockReturnValue({
      id: 1,
      platform: "instagram",
      sender_id: SENDER_ID,
      sender_username: null,
      display_name: "Queued Lead",
      phone: null,
      service: null,
      message_text: "first msg",
      source: "instagram",
      payload: null,
      open_clarification: 0,
      open_clarification_stage: "service" as const,
      attempt_count: 1,
      last_error: "rate limited",
      next_attempt_at: "2026-01-01 00:00:00",
      created_at: "2026-01-01 00:00:00",
    });

    const result = await handleIncomingMessage({
      messageText: "עוד הודעה",
      senderId: SENDER_ID,
      messageId: "queued-merge-1",
    });

    expect(result.itemId).toBeNull();
    expect(db.enqueueMondayLead).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, messageText: "עוד הודעה" }),
    );
    expect(profileService.fetchIgProfile).not.toHaveBeenCalled();
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
    expect(outbound.sendReplyDM).not.toHaveBeenCalled();
    expect(outbound.sendServiceQuestion).not.toHaveBeenCalled();
  });
});

describe("handleIncomingMessage — sender already queued, message classifies NOT interested (F2)", () => {
  it("still merges the phone into the queue — the guard runs before the not-interested return", async () => {
    vi.mocked(db.findQueuedLeadBySender).mockReturnValue({
      id: 2,
      platform: "instagram",
      sender_id: SENDER_ID,
      sender_username: null,
      display_name: "Queued Lead",
      phone: null,
      service: null,
      message_text: "first msg",
      source: "instagram",
      payload: null,
      open_clarification: 0,
      open_clarification_stage: "service" as const,
      attempt_count: 0,
      last_error: null,
      next_attempt_at: "2026-01-01 00:00:00",
      created_at: "2026-01-01 00:00:00",
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      interested: false,
      service: null,
      extractedName: null,
      extractedPhone: "0501234567",
      confidence: 0.2,
      rawResponse: "",
    });

    const result = await handleIncomingMessage({
      messageText: "0501234567",
      senderId: SENDER_ID,
      messageId: "f2-notinterested-1",
    });

    expect(result.itemId).toBeNull();
    expect(db.enqueueMondayLead).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, phone: "0501234567" }),
    );
    expect(outbound.sendReplyDM).not.toHaveBeenCalled();
    expect(outbound.sendServiceQuestion).not.toHaveBeenCalled();
  });
});

describe("handleIncomingMessage — known-sender update rate-limited", () => {
  it("no phone/service datum on this message → resolves with the existing itemId, no enqueue", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: "0501234567" });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue(notInterestedClassification);
    vi.mocked(mondayService.updateLastIgMessage).mockRejectedValue(
      new MondayRateLimitError("minute", 90, "minute cap"),
    );

    const result = await handleIncomingMessage({
      messageText: "תודה",
      senderId: SENDER_ID,
      messageId: "known-ratelimit-1",
    });

    expect(result.itemId).toBe(ITEM_ID);
    expect(db.enqueueMondayLead).not.toHaveBeenCalled();
  });

  it("message carried a new phone → resolves with the existing itemId AND durably retries via the queue (F5)", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: null });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: null,
    });
    vi.mocked(mondayService.updateLastIgMessage).mockRejectedValue(
      new MondayRateLimitError("minute", 90, "minute cap"),
    );

    const result = await handleIncomingMessage({
      messageText: "עוד הודעה 0501234567",
      senderId: SENDER_ID,
      messageId: "known-ratelimit-2",
    });

    expect(result.itemId).toBe(ITEM_ID);
    // The phone is persisted locally BEFORE the rate limit is even hit.
    expect(dedup.updateSenderPhone).toHaveBeenCalledWith("instagram", SENDER_ID, "0501234567");
    expect(db.enqueueMondayLead).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, phone: "0501234567", service: "uman" }),
    );
  });
});

// ---------------------------------------------------------------------------
// F5(a) — the phone is persisted locally BEFORE the first Monday await in the
// branch, so it survives even when THAT first call is the one that rate-limits.
// ---------------------------------------------------------------------------

describe("handleIncomingMessage — phone survives even when the very first Monday call rate-limits", () => {
  it("known-sender branch: getItemBoardAndGroup itself rejects → phone already persisted locally, before that call", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: null });
    vi.mocked(mondayService.getItemBoardAndGroup).mockRejectedValue(
      new MondayRateLimitError("minute", 45, "minute cap"),
    );

    const result = await handleIncomingMessage({
      messageText: "המספר שלי 0501234567",
      senderId: SENDER_ID,
      messageId: "f5a-known-1",
    });

    const phoneOrder = vi.mocked(dedup.updateSenderPhone).mock.invocationCallOrder[0];
    const getBoardOrder = vi.mocked(mondayService.getItemBoardAndGroup).mock.invocationCallOrder[0];
    expect(phoneOrder).toBeLessThan(getBoardOrder);

    expect(dedup.updateSenderPhone).toHaveBeenCalledWith("instagram", SENDER_ID, "0501234567");
    expect(db.enqueueMondayLead).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, phone: "0501234567" }),
    );
    expect(result.itemId).toBe(ITEM_ID);
  });

  it("pending-clarification branch: getItemBoardAndGroup itself rejects → phone already persisted locally, before that call", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 0,
      stage: "service" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockRejectedValue(
      new MondayRateLimitError("minute", 45, "minute cap"),
    );
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...interestedClassification,
      service: null,
      extractedPhone: "0501234567",
    });

    const result = await handleIncomingMessage({
      messageText: "0501234567",
      senderId: SENDER_ID,
      messageId: "f5a-pending-1",
    });

    const phoneOrder = vi.mocked(dedup.updateSenderPhone).mock.invocationCallOrder[0];
    const getBoardOrder = vi.mocked(mondayService.getItemBoardAndGroup).mock.invocationCallOrder[0];
    expect(phoneOrder).toBeLessThan(getBoardOrder);

    expect(dedup.updateSenderPhone).toHaveBeenCalledWith("instagram", SENDER_ID, "0501234567");
    expect(db.enqueueMondayLead).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, phone: "0501234567" }),
    );
    expect(result.itemId).toBe(ITEM_ID);
  });
});

// ---------------------------------------------------------------------------
// Phone thank-you ack — fires once, uman only, known-sender branch only.
// ---------------------------------------------------------------------------

describe("handleIncomingMessage — phone thank-you ack (uman only)", () => {
  beforeEach(() => {
    // Earlier rate-limit suites leave rejecting implementations on these mocks
    // (vi.clearAllMocks clears calls, not implementations) — restore happy path.
    vi.mocked(mondayService.updateLastIgMessage).mockResolvedValue(undefined);
    vi.mocked(mondayService.updateItemPhone).mockResolvedValue(undefined);
    vi.mocked(mondayService.moveItemToGroup).mockResolvedValue(undefined);
  });

  it("known uman lead (stored Monday label) sends her phone → thank-you DM, even on a not-interested bare number", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: null });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: "טיסה לאומן",
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...notInterestedClassification,
      extractedPhone: "0501234567",
    });

    await handleIncomingMessage({
      messageText: "0501234567",
      senderId: SENDER_ID,
      messageId: "thanks-1",
    });

    expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
    expect(outbound.sendPhoneThanks).toHaveBeenCalledWith(SENDER_ID);
  });

  it("row has no service label yet but THIS message names uman → thank-you DM", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: null });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue(interestedClassification);

    await handleIncomingMessage({
      messageText: "אומן 0501234567",
      senderId: SENDER_ID,
      messageId: "thanks-2",
    });

    expect(outbound.sendPhoneThanks).toHaveBeenCalledWith(SENDER_ID);
  });

  it("known challah lead sends her phone → stays silent", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: null });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: "הפרשת חלה",
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...notInterestedClassification,
      extractedPhone: "0501234567",
    });

    await handleIncomingMessage({
      messageText: "0501234567",
      senderId: SENDER_ID,
      messageId: "thanks-3",
    });

    expect(outbound.sendPhoneThanks).not.toHaveBeenCalled();
  });

  it("phone already stored → no re-fire on a second phone message", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: "0501234567",
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: "טיסה לאומן",
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...notInterestedClassification,
      extractedPhone: "0501234567",
    });

    await handleIncomingMessage({
      messageText: "שוב המספר 0501234567",
      senderId: SENDER_ID,
      messageId: "thanks-4",
    });

    expect(outbound.sendPhoneThanks).not.toHaveBeenCalled();
  });

  it("pending-clarification phone-only reply → re-ask, no thank-you", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 0,
      stage: "service" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NEW_LEADS_GROUP,
      service: null,
    });
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...vagueClassification,
      extractedPhone: "0501234567",
    });

    await handleIncomingMessage({
      messageText: "0501234567",
      senderId: SENDER_ID,
      messageId: "thanks-5",
    });

    expect(outbound.sendServiceQuestion).toHaveBeenCalledWith(SENDER_ID);
    expect(outbound.sendPhoneThanks).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Story-CTA trigger word ("רשמי לי כסלו ואשלח לך את כל הפרטים"). A message that
// is ONLY a trip name is answered with that trip's reply + flyer on EVERY path,
// without the LLM and without depending on Monday succeeding.
// ---------------------------------------------------------------------------

function seedTripReplySent(senderId: string, trip: "kislev" | "hanukkah"): void {
  tripRepliesSent.add(tripKey(senderId, trip));
}

// The send takes a macrotask, so a second message is guaranteed to reach the guard
// while the first one is still mid-send (an instantly-resolving mock would hide
// the check-then-send race entirely).
function sendTripReplyAfterATick(result: boolean): void {
  vi.mocked(outbound.sendTripReply).mockImplementation(
    () => new Promise<boolean>((resolve) => setTimeout(() => resolve(result), 0)),
  );
}

function claimsWon(): number {
  return vi.mocked(db.claimTripReply).mock.results.filter((r) => r.value === true).length;
}

function queuedRow(overrides: { phone: string | null }) {
  return {
    id: 7,
    platform: "instagram",
    sender_id: SENDER_ID,
    sender_username: null,
    display_name: "Queued Lead",
    phone: overrides.phone,
    service: "uman" as const,
    message_text: "first msg",
    source: "instagram",
    payload: null,
    open_clarification: 1,
    open_clarification_stage: "trip" as const,
    attempt_count: 1,
    last_error: "rate limited",
    next_attempt_at: "2026-01-01 00:00:00",
    created_at: "2026-01-01 00:00:00",
  };
}

describe("handleIncomingMessage — trip trigger word (story CTA)", () => {
  beforeEach(() => {
    // Earlier suites leave rejecting implementations on these (clearAllMocks only
    // clears calls) — restore the happy path.
    vi.mocked(mondayService.updateLastIgMessage).mockResolvedValue(undefined);
    vi.mocked(mondayService.updateItemPhone).mockResolvedValue(undefined);
    vi.mocked(mondayService.moveItemToGroup).mockResolvedValue(undefined);
    // 2026-10-03 incident: the LLM judged a bare month name not-interested. If the
    // trigger path ever consults the classifier again, these tests go silent
    // exactly like prod did.
    vi.mocked(classify.classifyLead).mockResolvedValue(notInterestedClassification);
  });

  describe("new sender", () => {
    it('"כסלו" → uman CRM row, no pending opened, Kislev reply (no phone) sent exactly once', async () => {
      const result = await handleIncomingMessage({
        messageText: "כסלו",
        senderId: SENDER_ID,
        messageId: "trig-new-1",
      });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(mondayService.createLeadRow).toHaveBeenCalledWith(
        expect.objectContaining({ service: "uman", phone: null }),
      );
      expect(dedup.upsertKnownSender).toHaveBeenCalledWith(
        expect.objectContaining({ senderId: SENDER_ID, mondayItemId: "new-item-123" }),
      );
      expect(conversation.upsertPendingClarification).not.toHaveBeenCalled();
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: false });
      expect(outbound.sendTripAsk).not.toHaveBeenCalled();
      expect(outbound.sendServiceQuestion).not.toHaveBeenCalled();
      expect(dedup.markMessageProcessed).toHaveBeenCalledWith("meta", "trig-new-1");
      expect(result.itemId).toBe("new-item-123");
      expect(result.classification).toMatchObject({ interested: true, service: "uman" });
    });

    it('"כסלו 0501234567" → reply has hasPhone true, row created with that phone', async () => {
      const result = await handleIncomingMessage({
        messageText: "כסלו 0501234567",
        senderId: SENDER_ID,
        messageId: "trig-new-2",
      });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(mondayService.createLeadRow).toHaveBeenCalledWith(
        expect.objectContaining({ service: "uman", phone: "0501234567" }),
      );
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: true });
      expect(result.itemId).toBe("new-item-123");
    });

    it.each([
      ["כסליו", "kislev"],
      ["כיסלו 🙏", "kislev"],
      ["חנוכה", "hanukkah"],
      ["חנוכה🕎", "hanukkah"],
    ] as const)("%j → the %s reply, once", async (messageText, trip) => {
      await handleIncomingMessage({ messageText, senderId: SENDER_ID, messageId: `trig-new-spell-${trip}` });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip, hasPhone: false });
    });

    it("already on the active Uman service board → no CRM row, reply still sent once", async () => {
      vi.mocked(mondayWebhookService.findLeadOnActiveServiceBoards).mockResolvedValue({
        itemId: "service-item-222",
        boardId: "service-board-111",
      });

      const result = await handleIncomingMessage({
        messageText: "חנוכה",
        senderId: SENDER_ID,
        messageId: "trig-board-1",
      });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(mondayWebhookService.findLeadOnActiveServiceBoards).toHaveBeenCalled();
      expect(mondayService.createLeadRow).not.toHaveBeenCalled();
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "hanukkah", hasPhone: false });
      expect(result.itemId).toBeNull();
    });

    it("createLeadRow throws a plain error → reply still sent AND the error propagates (message unmarked)", async () => {
      vi.mocked(mondayService.createLeadRow).mockRejectedValue(new Error("Monday down"));

      await expect(
        handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-err-1" }),
      ).rejects.toThrow("Monday down");

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: false });
      expect(dedup.unmarkMessageProcessed).toHaveBeenCalledWith("meta", "trig-err-1");
    });

    it("createLeadRow rate-limited → deferred to the queue with no clarification, reply sent once", async () => {
      vi.mocked(mondayService.createLeadRow).mockRejectedValue(
        new MondayRateLimitError("daily", 9000, "daily cap"),
      );

      const result = await handleIncomingMessage({
        messageText: "חנוכה 0501234567",
        senderId: SENDER_ID,
        messageId: "trig-429-1",
      });

      expect(result.itemId).toBeNull();
      expect(db.enqueueMondayLead).toHaveBeenCalledWith(
        expect.objectContaining({
          senderId: SENDER_ID,
          phone: "0501234567",
          service: "uman",
          openClarification: false,
        }),
      );
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "hanukkah", hasPhone: true });
      expect(dedup.unmarkMessageProcessed).not.toHaveBeenCalled();
    });

    it("already queued (create deferred earlier) → merged into the queue, reply sent once, hasPhone read from the queued row", async () => {
      vi.mocked(db.findQueuedLeadBySender).mockReturnValue(queuedRow({ phone: "0501234567" }));

      const result = await handleIncomingMessage({
        messageText: "כסלו",
        senderId: SENDER_ID,
        messageId: "trig-queued-1",
      });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(result.itemId).toBeNull();
      expect(db.enqueueMondayLead).toHaveBeenCalledWith(
        expect.objectContaining({ senderId: SENDER_ID, service: "uman", messageText: "כסלו" }),
      );
      expect(mondayService.createLeadRow).not.toHaveBeenCalled();
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: true });
    });

    it("stale mapping that still held a phone → fresh row, reply keeps hasPhone true (phone read before the mapping is dropped)", async () => {
      vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: "stale-item-id", phone: "0509999999" });
      vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue(null);

      const result = await handleIncomingMessage({
        messageText: "כסלו",
        senderId: SENDER_ID,
        messageId: "trig-stale-1",
      });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(dedup.deleteKnownSenderByItemId).toHaveBeenCalledWith("stale-item-id");
      expect(mondayService.createLeadRow).toHaveBeenCalledWith(
        expect.objectContaining({ service: "uman", phone: "0509999999" }),
      );
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: true });
      expect(result.itemId).toBe("new-item-123");
    });

    it("stale mapping that held a phone AND she is already on the service board → the finally's reply still says hasPhone true (phone read before the rows are deleted)", async () => {
      vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: "stale-item-id", phone: "0509999999" });
      // Mirror production: once the stale mapping is deleted, a re-read finds nothing.
      vi.mocked(dedup.deleteKnownSenderByItemId).mockImplementationOnce(() => {
        vi.mocked(dedup.findKnownSender).mockReturnValue(null);
      });
      vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue(null);
      vi.mocked(mondayWebhookService.findLeadOnActiveServiceBoards).mockResolvedValue({
        itemId: "service-item-222",
        boardId: "service-board-111",
      });

      const result = await handleIncomingMessage({
        messageText: "כסלו",
        senderId: SENDER_ID,
        messageId: "trig-stale-board-1",
      });

      expect(dedup.deleteKnownSenderByItemId).toHaveBeenCalledWith("stale-item-id");
      expect(mondayService.createLeadRow).not.toHaveBeenCalled();
      expect(result.itemId).toBeNull();
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: true });
    });
  });

  describe("known lead", () => {
    it('live lead (no phone) writes "חנוכה" → Hanukkah reply once, no phone-thanks, re-filed per the existing rule', async () => {
      vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: null });
      vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
        boardId: CRM_BOARD,
        groupId: "followup_group",
        service: "טיסה לאומן",
      });

      const result = await handleIncomingMessage({
        messageText: "חנוכה",
        senderId: SENDER_ID,
        messageId: "trig-known-1",
      });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(mondayService.updateLastIgMessage).toHaveBeenCalledWith(ITEM_ID, "חנוכה");
      // interested + no phone → the no-phone group (same as any interested message from a returning lead)
      expect(mondayService.moveItemToGroup).toHaveBeenCalledWith(ITEM_ID, NO_PHONE_GROUP);
      expect(mondayService.createLeadRow).not.toHaveBeenCalled();
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "hanukkah", hasPhone: false });
      expect(outbound.sendPhoneThanks).not.toHaveBeenCalled();
      expect(result.itemId).toBe(ITEM_ID);
    });

    it("live lead with a stored phone → reply has hasPhone true, re-filed to new-leads, empty service column filled with uman", async () => {
      vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: "0501234567" });
      vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
        boardId: CRM_BOARD,
        groupId: NO_PHONE_GROUP,
        service: null,
      });

      await handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-known-2" });

      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: true });
      expect(mondayService.moveItemToGroup).toHaveBeenCalledWith(ITEM_ID, NEW_LEADS_GROUP);
      expect(mondayService.updateItemService).toHaveBeenCalledWith(ITEM_ID, "uman");
      expect(outbound.sendPhoneThanks).not.toHaveBeenCalled();
    });

    it("live lead with no stored phone hands one over with the word → reply has hasPhone true; NO separate phone-thanks (the reply already thanks her)", async () => {
      vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: null });
      vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
        boardId: CRM_BOARD,
        groupId: NO_PHONE_GROUP,
        service: "טיסה לאומן",
      });

      await handleIncomingMessage({
        messageText: "כסלו 0501234567",
        senderId: SENDER_ID,
        messageId: "trig-known-3",
      });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(dedup.updateSenderPhone).toHaveBeenCalledWith("instagram", SENDER_ID, "0501234567");
      expect(mondayService.updateItemPhone).toHaveBeenCalledWith(ITEM_ID, "0501234567");
      expect(mondayService.moveItemToGroup).toHaveBeenCalledWith(ITEM_ID, NEW_LEADS_GROUP);
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: true });
      expect(outbound.sendPhoneThanks).not.toHaveBeenCalled();
    });

    it("same, but the Kislev reply already went out < 24h ago → no second reply, the phone-thanks DOES go out (she must get something)", async () => {
      seedTripReplySent(SENDER_ID, "kislev");
      vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: null });
      vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
        boardId: CRM_BOARD,
        groupId: NO_PHONE_GROUP,
        service: "טיסה לאומן",
      });

      await handleIncomingMessage({
        messageText: "כסלו 0501234567",
        senderId: SENDER_ID,
        messageId: "trig-known-4",
      });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(mondayService.updateItemPhone).toHaveBeenCalledWith(ITEM_ID, "0501234567");
      expect(outbound.sendTripReply).not.toHaveBeenCalled();
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
      expect(outbound.sendPhoneThanks).toHaveBeenCalledWith(SENDER_ID);
    });

    it("the Kislev reply being recent does NOT block a Hanukkah answer (the guard is per trip)", async () => {
      seedTripReplySent(SENDER_ID, "kislev");
      vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: null });
      vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
        boardId: CRM_BOARD,
        groupId: NO_PHONE_GROUP,
        service: "טיסה לאומן",
      });

      await handleIncomingMessage({ messageText: "חנוכה", senderId: SENDER_ID, messageId: "trig-known-5" });

      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "hanukkah", hasPhone: false });
    });

    it("getItemBoardAndGroup rate-limited → the update is skipped but the reply is still sent", async () => {
      vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: "0501234567" });
      vi.mocked(mondayService.getItemBoardAndGroup).mockRejectedValue(
        new MondayRateLimitError("daily", 9000, "daily cap"),
      );

      const result = await handleIncomingMessage({
        messageText: "כסלו",
        senderId: SENDER_ID,
        messageId: "trig-known-429",
      });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(result.itemId).toBe(ITEM_ID);
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: true });
      expect(dedup.unmarkMessageProcessed).not.toHaveBeenCalled();
    });

    it("getItemBoardAndGroup throws a non-rate-limit error → reply still sent AND the error propagates", async () => {
      vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: null });
      vi.mocked(mondayService.getItemBoardAndGroup).mockRejectedValue(new Error("Monday API 500"));

      await expect(
        handleIncomingMessage({ messageText: "חנוכה", senderId: SENDER_ID, messageId: "trig-known-500" }),
      ).rejects.toThrow("Monday API 500");

      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "hanukkah", hasPhone: false });
      expect(dedup.unmarkMessageProcessed).toHaveBeenCalledWith("meta", "trig-known-500");
    });
  });

  describe("pending clarification", () => {
    it('service-stage lead writes "כסליו" → uman set, Kislev reply once, pending cleared, no trip-ask', async () => {
      vi.mocked(conversation.getPendingClarification).mockReturnValue({
        monday_item_id: ITEM_ID,
        phone: null,
        reask_count: 1,
        stage: "service" as const,
        trip: null,
      });
      vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
        boardId: CRM_BOARD,
        groupId: NO_PHONE_GROUP,
        service: null,
      });

      const result = await handleIncomingMessage({
        messageText: "כסליו",
        senderId: SENDER_ID,
        messageId: "trig-pend-svc-1",
      });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(mondayService.updateItemService).toHaveBeenCalledWith(ITEM_ID, "uman");
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: false });
      expect(conversation.clearPendingClarification).toHaveBeenCalledWith("instagram", SENDER_ID);
      expect(conversation.advanceToTripStage).not.toHaveBeenCalled();
      expect(outbound.sendTripAsk).not.toHaveBeenCalled();
      expect(outbound.sendServiceQuestion).not.toHaveBeenCalled();
      expect(result.itemId).toBe(ITEM_ID);
    });

    it('trip-stage lead writes "חנוכה" → Hanukkah reply exactly once (the path sends it, the finally is a no-op)', async () => {
      vi.mocked(conversation.getPendingClarification).mockReturnValue({
        monday_item_id: ITEM_ID,
        phone: "0501234567",
        reask_count: 2,
        stage: "trip" as const,
        trip: null,
      });
      vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
        boardId: CRM_BOARD,
        groupId: NEW_LEADS_GROUP,
        service: "טיסה לאומן",
      });

      const result = await handleIncomingMessage({
        messageText: "חנוכה",
        senderId: SENDER_ID,
        messageId: "trig-pend-trip-1",
      });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "hanukkah", hasPhone: true });
      expect(conversation.clearPendingClarification).toHaveBeenCalledWith("instagram", SENDER_ID);
      expect(outbound.sendTripAsk).not.toHaveBeenCalled();
      expect(result.itemId).toBe(ITEM_ID);
    });

    it("pending row exists but Monday is rate-limited → reply still sent, pending untouched, phone read from the pending row", async () => {
      vi.mocked(conversation.getPendingClarification).mockReturnValue({
        monday_item_id: ITEM_ID,
        phone: "0501234567",
        reask_count: 0,
        stage: "trip" as const,
        trip: null,
      });
      vi.mocked(mondayService.getItemBoardAndGroup).mockRejectedValue(
        new MondayRateLimitError("minute", 45, "minute cap"),
      );

      const result = await handleIncomingMessage({
        messageText: "כסלו",
        senderId: SENDER_ID,
        messageId: "trig-pend-429",
      });

      expect(result.itemId).toBe(ITEM_ID);
      expect(conversation.clearPendingClarification).not.toHaveBeenCalled();
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: true });
    });
  });

  describe("at most once per person per trip per 24h", () => {
    it("double tap — a second 'כסלו' from the same sender → sendTripReply called once in total", async () => {
      await handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-dbl-1" });
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);

      // She is now a known lead on a live CRM row.
      vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: "new-item-123", phone: null });
      vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
        boardId: CRM_BOARD,
        groupId: NO_PHONE_GROUP,
        service: "טיסה לאומן",
      });

      await handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-dbl-2" });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(mondayService.createLeadRow).toHaveBeenCalledTimes(1);
      // Three attempts across the two taps (path, finally, finally) — exactly one won.
      expect(claimsWon()).toBe(1);
      expect(db.releaseTripReply).not.toHaveBeenCalled();
    });

    it("two different trips within 24h are each answered once", async () => {
      await handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-two-1" });
      await handleIncomingMessage({ messageText: "חנוכה", senderId: SENDER_ID, messageId: "trig-two-2" });

      expect(outbound.sendTripReply).toHaveBeenCalledTimes(2);
      expect(outbound.sendTripReply).toHaveBeenNthCalledWith(1, SENDER_ID, { trip: "kislev", hasPhone: false });
      expect(outbound.sendTripReply).toHaveBeenNthCalledWith(2, SENDER_ID, { trip: "hanukkah", hasPhone: false });
    });

    it("the guard is per sender — another woman's recent reply does not suppress this one", async () => {
      seedTripReplySent("some_other_sender", "kislev");

      await handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-per-sender" });

      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: false });
    });

    it("a successful text send keeps its claim on that trip (nothing is released)", async () => {
      await handleIncomingMessage({ messageText: "חנוכה", senderId: SENDER_ID, messageId: "trig-mark-1" });

      expect(db.claimTripReply).toHaveBeenCalledWith(SENDER_ID, "hanukkah");
      expect(claimsWon()).toBe(1);
      expect(db.releaseTripReply).not.toHaveBeenCalled();
      expect(db.wasTripReplySentRecently(SENDER_ID, "hanukkah")).toBe(true);
    });

    it("a failed text send (resolves false) releases the claim, so the finally's retry can send it", async () => {
      vi.mocked(outbound.sendTripReply).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      await handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-release-1" });

      // Attempt 1 (the new-row path) fails and gives the claim back; the finally's
      // attempt then owns it again and succeeds, so the claim is held at the end.
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(2);
      expect(db.releaseTripReply).toHaveBeenCalledTimes(1);
      expect(db.releaseTripReply).toHaveBeenCalledWith(SENDER_ID, "kislev");
      expect(claimsWon()).toBe(2);
      expect(db.wasTripReplySentRecently(SENDER_ID, "kislev")).toBe(true);
    });

    it("every attempt fails (false) → each failed attempt gives its claim back, so her NEXT message is still answered", async () => {
      vi.mocked(outbound.sendTripReply).mockResolvedValue(false);

      await handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-release-2" });

      // the new-row path's attempt + the finally's attempt
      expect(db.releaseTripReply).toHaveBeenCalledTimes(2);
      expect(db.wasTripReplySentRecently(SENDER_ID, "kislev")).toBe(false);

      vi.mocked(outbound.sendTripReply).mockClear();
      vi.mocked(outbound.sendTripReply).mockResolvedValue(true);

      await handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-release-3" });

      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: false });
      expect(db.wasTripReplySentRecently(SENDER_ID, "kislev")).toBe(true);
    });

    it("sendTripReply throws → never propagates, the claim is released, lead still created", async () => {
      vi.mocked(outbound.sendTripReply).mockRejectedValue(new Error("IG API 503"));

      const result = await handleIncomingMessage({
        messageText: "כסלו",
        senderId: SENDER_ID,
        messageId: "trig-throw-1",
      });

      expect(result.itemId).toBe("new-item-123");
      expect(db.releaseTripReply).toHaveBeenCalledWith(SENDER_ID, "kislev");
      expect(db.wasTripReplySentRecently(SENDER_ID, "kislev")).toBe(false);
      expect(dedup.unmarkMessageProcessed).not.toHaveBeenCalled();
    });

    describe("concurrent messages (claim happens before the first await)", () => {
      it("two bare-word messages from a NEW sender started together, first send still in flight → sendTripReply called exactly once", async () => {
        sendTripReplyAfterATick(true);

        await Promise.all([
          handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-conc-1" }),
          handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-conc-2" }),
        ]);

        expect(classify.classifyLead).not.toHaveBeenCalled();
        expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
        expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: false });
        expect(claimsWon()).toBe(1);
        expect(db.releaseTripReply).not.toHaveBeenCalled();
      });

      it("two bare-word messages from a KNOWN lead started together (the finally sends) → sendTripReply called exactly once", async () => {
        sendTripReplyAfterATick(true);
        vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone: null });
        vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
          boardId: CRM_BOARD,
          groupId: NO_PHONE_GROUP,
          service: "טיסה לאומן",
        });

        await Promise.all([
          handleIncomingMessage({ messageText: "חנוכה", senderId: SENDER_ID, messageId: "trig-conc-3" }),
          handleIncomingMessage({ messageText: "חנוכה", senderId: SENDER_ID, messageId: "trig-conc-4" }),
        ]);

        expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
        expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "hanukkah", hasPhone: false });
        expect(claimsWon()).toBe(1);
      });

      it("concurrent messages for two DIFFERENT trips are each answered once (the slot is per trip)", async () => {
        sendTripReplyAfterATick(true);

        await Promise.all([
          handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-conc-5" }),
          handleIncomingMessage({ messageText: "חנוכה", senderId: SENDER_ID, messageId: "trig-conc-6" }),
        ]);

        expect(outbound.sendTripReply).toHaveBeenCalledTimes(2);
        expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: false });
        expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "hanukkah", hasPhone: false });
      });

      it("the in-flight send fails → its claim is released and the finally's retry still answers her (once)", async () => {
        vi.mocked(outbound.sendTripReply)
          .mockImplementationOnce(() => new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 0)))
          .mockResolvedValue(true);

        await Promise.all([
          handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-conc-7" }),
          handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-conc-8" }),
        ]);

        // The second message loses its claims while the first send is in flight; when
        // that send fails, only ITS claim is released and the first message's finally
        // re-claims and succeeds — one failed attempt + one retry, nothing doubled.
        expect(outbound.sendTripReply).toHaveBeenCalledTimes(2);
        expect(db.releaseTripReply).toHaveBeenCalledTimes(1);
        expect(db.wasTripReplySentRecently(SENDER_ID, "kislev")).toBe(true);
      });
    });

    describe("the claim bookkeeping can never throw out of the finally", () => {
      it("claimTripReply throwing (DB error) → no propagation, lead still created, she just isn't DMed", async () => {
        vi.mocked(db.claimTripReply).mockImplementation(() => {
          throw new Error("SQLITE_BUSY");
        });

        const result = await handleIncomingMessage({
          messageText: "כסלו",
          senderId: SENDER_ID,
          messageId: "trig-claimerr-1",
        });

        expect(db.claimTripReply).toHaveBeenCalled();
        expect(outbound.sendTripReply).not.toHaveBeenCalled();
        expect(result.itemId).toBe("new-item-123");
        expect(dedup.unmarkMessageProcessed).not.toHaveBeenCalled();
      });

      it("releaseTripReply throwing after a failed send → no propagation either", async () => {
        vi.mocked(outbound.sendTripReply).mockResolvedValue(false);
        vi.mocked(db.releaseTripReply).mockImplementation(() => {
          throw new Error("SQLITE_BUSY");
        });

        const result = await handleIncomingMessage({
          messageText: "כסלו",
          senderId: SENDER_ID,
          messageId: "trig-relerr-1",
        });

        expect(db.releaseTripReply).toHaveBeenCalled();
        expect(result.itemId).toBe("new-item-123");
      });

      it("a bookkeeping error in the finally does not mask the path's own error", async () => {
        vi.mocked(mondayService.createLeadRow).mockRejectedValue(new Error("Monday down"));
        vi.mocked(db.claimTripReply).mockImplementation(() => {
          throw new Error("SQLITE_BUSY");
        });

        await expect(
          handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "trig-mask-1" }),
        ).rejects.toThrow("Monday down");

        expect(db.claimTripReply).toHaveBeenCalled();
        expect(dedup.unmarkMessageProcessed).toHaveBeenCalledWith("meta", "trig-mask-1");
      });
    });

    it("also guards the pre-existing classifier path: a trip named inside a longer sentence is not re-sent within 24h", async () => {
      seedTripReplySent(SENDER_ID, "hanukkah");
      vi.mocked(classify.classifyLead).mockResolvedValue({
        ...interestedClassification,
        service: "uman",
        extractedPhone: "0501234567",
      });

      const result = await handleIncomingMessage({
        messageText: "אני רוצה טיסה לאומן בחנוכה 0501234567",
        senderId: SENDER_ID,
        messageId: "guard-classifier-1",
      });

      expect(classify.classifyLead).toHaveBeenCalledTimes(1);
      expect(mondayService.createLeadRow).toHaveBeenCalledWith(
        expect.objectContaining({ service: "uman", phone: "0501234567" }),
      );
      expect(outbound.sendTripReply).not.toHaveBeenCalled();
      expect(outbound.sendTripAsk).not.toHaveBeenCalled();
      expect(result.itemId).toBe("new-item-123");
    });
  });
});

describe("handleIncomingMessage — messages that are NOT a bare trip word still use the classifier", () => {
  beforeEach(() => {
    vi.mocked(mondayService.updateLastIgMessage).mockResolvedValue(undefined);
    vi.mocked(mondayService.updateItemPhone).mockResolvedValue(undefined);
    vi.mocked(mondayService.moveItemToGroup).mockResolvedValue(undefined);
  });

  it('"מעוניינת באומן" → classifyLead is called once and the flow is unchanged (trip-ask, no trip reply)', async () => {
    const result = await handleIncomingMessage({
      messageText: "מעוניינת באומן",
      senderId: SENDER_ID,
      messageId: "nontrig-1",
    });

    expect(classify.classifyLead).toHaveBeenCalledTimes(1);
    expect(mondayService.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ service: "uman" }),
    );
    expect(outbound.sendTripAsk).toHaveBeenCalledWith(SENDER_ID);
    expect(outbound.sendTripReply).not.toHaveBeenCalled();
    expect(result.itemId).toBe("new-item-123");
  });

  it.each(["חנוכה שמח", "לא כסלו", "מעוניינת בכסלו", "כסלו או חנוכה", "כסלו 6-10"])(
    "%j → not a trigger, the classifier is consulted",
    async (messageText) => {
      await handleIncomingMessage({ messageText, senderId: SENDER_ID, messageId: `nontrig-${messageText}` });

      expect(classify.classifyLead).toHaveBeenCalledTimes(1);
    },
  );

  it("a bare trip word with NO senderId (dev test-inject) → classifier, and no DM (nobody to send to)", async () => {
    await handleIncomingMessage({ messageText: "כסלו" });

    expect(classify.classifyLead).toHaveBeenCalledTimes(1);
    expect(outbound.sendTripReply).not.toHaveBeenCalled();
  });

  it("a long message that merely mentions a trip still gets its trip reply from the normal path (and claims its slot)", async () => {
    vi.mocked(classify.classifyLead).mockResolvedValue({
      ...interestedClassification,
      service: "uman",
      extractedPhone: "0501234567",
    });

    await handleIncomingMessage({
      messageText: "אני רוצה טיסה לאומן בחנוכה, המספר שלי 0501234567",
      senderId: SENDER_ID,
      messageId: "nontrig-2",
    });

    expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
    expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "hanukkah", hasPhone: true });
    expect(db.claimTripReply).toHaveBeenCalledWith(SENDER_ID, "hanukkah");
    expect(db.releaseTripReply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Trip-word COMMENTS. The private reply under the comment already was her DM, so
// the bookkeeping that follows (recordTripCommentLead) must send nothing at all,
// and her later phone-only reply is answered with the owed flyer + one thank-you,
// without the classifier.
// ---------------------------------------------------------------------------

const PHONE = "0501234567";

function seedOwed(senderId: string, ...trips: Trip[]): void {
  owedMarks.set(senderId, new Set(trips));
}

function knownLiveLead(phone: string | null = null, groupId: string = NO_PHONE_GROUP): void {
  vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: ITEM_ID, phone });
  vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
    boardId: CRM_BOARD,
    groupId,
    service: "טיסה לאומן",
  });
}

function expectNoOutbound(): void {
  expect(outbound.sendReplyDM).not.toHaveBeenCalled();
  expect(outbound.sendServiceQuestion).not.toHaveBeenCalled();
  expect(outbound.sendTripAsk).not.toHaveBeenCalled();
  expect(outbound.sendTripReply).not.toHaveBeenCalled();
  expect(outbound.sendPhoneThanks).not.toHaveBeenCalled();
  expect(outbound.sendFlyerImage).not.toHaveBeenCalled();
}

function callOrder(fn: unknown, index = 0): number {
  const order = vi.mocked(fn as (...args: never[]) => unknown).mock.invocationCallOrder[index];
  if (order === undefined) throw new Error("expected the mock to have been called");
  return order;
}

describe("recordTripCommentLead — comment-origin lead bookkeeping, every DM suppressed", () => {
  const COMMENT = {
    senderId: SENDER_ID,
    senderUsername: "ig_handle",
    commentText: "חנוכה",
    trip: "hanukkah" as const,
  };

  beforeEach(() => {
    vi.mocked(mondayService.updateLastIgMessage).mockResolvedValue(undefined);
    vi.mocked(mondayService.updateItemPhone).mockResolvedValue(undefined);
    vi.mocked(mondayService.moveItemToGroup).mockResolvedValue(undefined);
  });

  it("new commenter → uman CRM row with no phone + known sender + her comment as the last message; no pending, nothing sent", async () => {
    await recordTripCommentLead(COMMENT);

    expect(classify.classifyLead).not.toHaveBeenCalled();
    expect(mondayService.createLeadRow).toHaveBeenCalledTimes(1);
    expect(mondayService.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ service: "uman", phone: null, source: "instagram" }),
    );
    expect(dedup.upsertKnownSender).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "instagram",
        senderId: SENDER_ID,
        mondayItemId: "new-item-123",
        phone: null,
      }),
    );
    expect(mondayService.updateLastIgMessage).toHaveBeenCalledWith("new-item-123", "חנוכה");
    expect(conversation.upsertPendingClarification).not.toHaveBeenCalled();
    expectNoOutbound();
  });

  it("the WhatsApp welcome is NOT suppressed (only Instagram DMs are) — it still gets its chance", async () => {
    await recordTripCommentLead(COMMENT);

    expect(umanWelcome.maybeSendUmanWelcome).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, mondayItemId: "new-item-123", service: "uman", phone: null }),
    );
  });

  it("the word never opens a trip-stage pending or asks which trip (the comment's trip is the hint)", async () => {
    await recordTripCommentLead({ ...COMMENT, commentText: "🙏", trip: "kislev" });

    expect(conversation.upsertPendingClarification).not.toHaveBeenCalled();
    expect(outbound.sendTripAsk).not.toHaveBeenCalled();
    expectNoOutbound();
  });

  it("known live lead with a stored phone → updated and re-filed, no new row, nothing sent", async () => {
    knownLiveLead("0509999999", "followup_group");

    await recordTripCommentLead(COMMENT);

    expect(mondayService.updateLastIgMessage).toHaveBeenCalledWith(ITEM_ID, "חנוכה");
    expect(mondayService.moveItemToGroup).toHaveBeenCalledWith(ITEM_ID, NEW_LEADS_GROUP);
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
    expectNoOutbound();
  });

  it("known live lead with no phone → re-filed to the no-phone group, nothing sent", async () => {
    knownLiveLead(null, "followup_group");

    await recordTripCommentLead(COMMENT);

    expect(mondayService.moveItemToGroup).toHaveBeenCalledWith(ITEM_ID, NO_PHONE_GROUP);
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
    expectNoOutbound();
  });

  it("an open service-stage pending is resolved, the trip question is never asked", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 1,
      stage: "service" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NO_PHONE_GROUP,
      service: null,
    });

    await recordTripCommentLead(COMMENT);

    expect(conversation.clearPendingClarification).toHaveBeenCalledWith("instagram", SENDER_ID);
    expect(conversation.advanceToTripStage).not.toHaveBeenCalled();
    expectNoOutbound();
  });

  it("an open trip-stage pending is resolved, never re-asked", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 0,
      stage: "trip" as const,
      trip: null,
    });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
      boardId: CRM_BOARD,
      groupId: NO_PHONE_GROUP,
      service: "טיסה לאומן",
    });

    await recordTripCommentLead({ ...COMMENT, commentText: "🙏" });

    expect(conversation.clearPendingClarification).toHaveBeenCalledWith("instagram", SENDER_ID);
    expectNoOutbound();
  });

  it("already on the active Uman service board → no CRM row, nothing sent", async () => {
    vi.mocked(mondayWebhookService.findLeadOnActiveServiceBoards).mockResolvedValue({
      itemId: "service-item-222",
      boardId: "service-board-111",
    });

    await recordTripCommentLead(COMMENT);

    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
    expect(dedup.upsertKnownSender).not.toHaveBeenCalled();
    expectNoOutbound();
  });

  it("a sender whose create is already queued → merged into the queue, nothing sent", async () => {
    vi.mocked(db.findQueuedLeadBySender).mockReturnValue(queuedRow({ phone: null }));

    await recordTripCommentLead(COMMENT);

    expect(db.enqueueMondayLead).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, service: "uman", messageText: "חנוכה" }),
    );
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
    expectNoOutbound();
  });

  it("stale mapping → treated as new: a fresh row, nothing sent", async () => {
    vi.mocked(dedup.findKnownSender).mockReturnValue({ monday_item_id: "stale-item-id", phone: null });
    vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue(null);

    await recordTripCommentLead(COMMENT);

    expect(dedup.deleteKnownSenderByItemId).toHaveBeenCalledWith("stale-item-id");
    expect(mondayService.createLeadRow).toHaveBeenCalledTimes(1);
    expectNoOutbound();
  });

  it("Monday rate-limits the create → deferred to the queue with no clarification, nothing sent", async () => {
    vi.mocked(mondayService.createLeadRow).mockRejectedValue(new MondayRateLimitError("daily", 9000, "daily cap"));

    await expect(recordTripCommentLead(COMMENT)).resolves.toBeUndefined();

    expect(db.enqueueMondayLead).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, service: "uman", phone: null, openClarification: false }),
    );
    expectNoOutbound();
  });

  it("a non-rate-limit Monday error propagates (the caller defers it) and still sent nothing", async () => {
    vi.mocked(mondayService.createLeadRow).mockRejectedValue(new Error("Monday down"));

    await expect(recordTripCommentLead(COMMENT)).rejects.toThrow("Monday down");

    expectNoOutbound();
  });

  it("the suppression is scoped to the comment lead: another sender's DM handled at the same moment is still answered", async () => {
    // Slow profile lookup keeps the comment lead mid-flight (inside the suppression
    // scope) while the other message reaches its own send.
    vi.mocked(profileService.fetchIgProfile).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ id: "p", username: "slow_user" }), 5)),
    );

    await Promise.all([
      recordTripCommentLead(COMMENT),
      handleIncomingMessage({ messageText: "כסלו", senderId: "other_sender", messageId: "iso-1" }),
    ]);

    expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
    expect(outbound.sendTripReply).toHaveBeenCalledWith("other_sender", { trip: "kislev", hasPhone: false });
  });

  it("the suppression does not outlive the call: her next DM is answered normally", async () => {
    await recordTripCommentLead(COMMENT);
    expectNoOutbound();

    await handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "iso-2" });

    expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: false });
  });
});

describe("new-sender display name", () => {
  const MESSAGE = { messageText: "אני רוצה טיסה לאומן", senderId: SENDER_ID };

  it("the IG profile username is used when the lookup works", async () => {
    vi.mocked(profileService.fetchIgProfile).mockResolvedValue({ id: "p", username: "profile_user" });

    await handleIncomingMessage({ ...MESSAGE, senderUsername: "event_handle", messageId: "name-1" });

    expect(mondayService.createLeadRow).toHaveBeenCalledWith(expect.objectContaining({ name: "profile_user" }));
  });

  it("falls back to the username the event carried when the profile lookup fails (a commenter who never DMed us)", async () => {
    vi.mocked(profileService.fetchIgProfile).mockResolvedValue(null);

    await handleIncomingMessage({ ...MESSAGE, senderUsername: "event_handle", messageId: "name-2" });

    expect(mondayService.createLeadRow).toHaveBeenCalledWith(expect.objectContaining({ name: "event_handle" }));
    expect(dedup.upsertKnownSender).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, senderUsername: "event_handle" }),
    );
  });

  it("falls back to the event username when the profile comes back without one", async () => {
    vi.mocked(profileService.fetchIgProfile).mockResolvedValue({ id: "p" });

    await handleIncomingMessage({ ...MESSAGE, senderUsername: "event_handle", messageId: "name-3" });

    expect(mondayService.createLeadRow).toHaveBeenCalledWith(expect.objectContaining({ name: "event_handle" }));
  });

  it("neither source has a name → 'Unknown IG lead'", async () => {
    vi.mocked(profileService.fetchIgProfile).mockResolvedValue(null);

    await handleIncomingMessage({ ...MESSAGE, messageId: "name-4" });

    expect(mondayService.createLeadRow).toHaveBeenCalledWith(expect.objectContaining({ name: "Unknown IG lead" }));
  });

  it("a comment lead whose profile lookup fails is named after her handle", async () => {
    vi.mocked(profileService.fetchIgProfile).mockResolvedValue(null);

    await recordTripCommentLead({
      senderId: SENDER_ID,
      senderUsername: "commenter_handle",
      commentText: "כסלו",
      trip: "kislev",
    });

    expect(mondayService.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ name: "commenter_handle" }),
    );
  });

  it("the deferred (rate-limited) create carries the same fallback name into the queue", async () => {
    vi.mocked(profileService.fetchIgProfile).mockResolvedValue(null);
    vi.mocked(mondayService.createLeadRow).mockRejectedValue(new MondayRateLimitError("daily", 9000, "daily cap"));

    await handleIncomingMessage({ ...MESSAGE, senderUsername: "event_handle", messageId: "name-5" });

    expect(db.enqueueMondayLead).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: SENDER_ID, displayName: "event_handle" }),
    );
  });
});

describe("handleIncomingMessage — her reply after a trip-word comment (owed flyer)", () => {
  beforeEach(() => {
    vi.mocked(mondayService.updateLastIgMessage).mockResolvedValue(undefined);
    vi.mocked(mondayService.updateItemPhone).mockResolvedValue(undefined);
    vi.mocked(mondayService.moveItemToGroup).mockResolvedValue(undefined);
    vi.mocked(mondayService.createLeadRow).mockResolvedValue({ itemId: "new-item-123" });
    // If the follow-up ever consults the classifier, these tests fail loudly.
    vi.mocked(classify.classifyLead).mockResolvedValue(notInterestedClassification);
    seedOwed(SENDER_ID, "hanukkah");
  });

  describe("replies that carry no phone", () => {
    it("a plain reply → nothing is sent, the classifier is skipped, her message is still recorded, the owed mark stays", async () => {
      knownLiveLead();

      const result = await handleIncomingMessage({ messageText: "תודה רבה", senderId: SENDER_ID, messageId: "fu-1" });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expectNoOutbound();
      expect(mondayService.updateLastIgMessage).toHaveBeenCalledWith(ITEM_ID, "תודה רבה");
      expect(db.consumeOwedCommentFlyer).not.toHaveBeenCalled();
      expect(db.getOwedCommentTrips(SENDER_ID)).toEqual(["hanukkah"]);
      expect(result.classification).toMatchObject({
        interested: false,
        service: null,
        extractedPhone: null,
        rawResponse: "comment-follow-up",
      });
    });

    it("the bare word of the trip she was already DMed about → nothing is sent (the private reply was the answer)", async () => {
      knownLiveLead();

      await handleIncomingMessage({ messageText: "חנוכה", senderId: SENDER_ID, messageId: "fu-2" });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expectNoOutbound();
      expect(db.claimTripReply).not.toHaveBeenCalled();
      expect(db.consumeOwedCommentFlyer).not.toHaveBeenCalled();
      expect(db.getOwedCommentTrips(SENDER_ID)).toEqual(["hanukkah"]);
    });

    it("a sender with no row and no phone → nothing is created, nothing is sent", async () => {
      await handleIncomingMessage({ messageText: "תודה", senderId: SENDER_ID, messageId: "fu-2b" });

      expect(mondayService.createLeadRow).not.toHaveBeenCalled();
      expectNoOutbound();
    });
  });

  describe("replies that carry a phone", () => {
    it("a phone → the owed flyer, then ONE thank-you; the mark is consumed and the phone is stored as for any known lead", async () => {
      knownLiveLead();

      const result = await handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-3" });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(outbound.sendFlyerImage).toHaveBeenCalledTimes(1);
      expect(outbound.sendFlyerImage).toHaveBeenCalledWith(SENDER_ID, "hanukkah");
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
      expect(outbound.sendPhoneThanks).toHaveBeenCalledWith(SENDER_ID);
      expect(callOrder(outbound.sendFlyerImage)).toBeLessThan(callOrder(outbound.sendPhoneThanks));
      expect(db.consumeOwedCommentFlyer).toHaveBeenCalledWith(SENDER_ID, "hanukkah");
      expect(db.getOwedCommentTrips(SENDER_ID)).toEqual([]);

      expect(outbound.sendTripReply).not.toHaveBeenCalled();
      expect(outbound.sendTripAsk).not.toHaveBeenCalled();
      expect(outbound.sendServiceQuestion).not.toHaveBeenCalled();
      expect(dedup.updateSenderPhone).toHaveBeenCalledWith("instagram", SENDER_ID, PHONE);
      expect(mondayService.updateItemPhone).toHaveBeenCalledWith(ITEM_ID, PHONE);
      expect(mondayService.moveItemToGroup).toHaveBeenCalledWith(ITEM_ID, NEW_LEADS_GROUP);
      expect(result.classification).toMatchObject({
        interested: true,
        service: "uman",
        extractedPhone: PHONE,
        rawResponse: "comment-follow-up",
      });
    });

    it("a phone inside a sentence works too", async () => {
      knownLiveLead();

      await handleIncomingMessage({ messageText: `הנה המספר שלי ${PHONE} תודה`, senderId: SENDER_ID, messageId: "fu-3b" });

      expect(outbound.sendFlyerImage).toHaveBeenCalledTimes(1);
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
    });

    it("a phone when one is ALREADY stored → still the flyer + one thank-you (any phone, not only a first one)", async () => {
      knownLiveLead("0509999999", NEW_LEADS_GROUP);

      await handleIncomingMessage({ messageText: `המספר שלי ${PHONE}`, senderId: SENDER_ID, messageId: "fu-4" });

      expect(mondayService.updateItemPhone).not.toHaveBeenCalled();
      expect(outbound.sendFlyerImage).toHaveBeenCalledTimes(1);
      expect(outbound.sendFlyerImage).toHaveBeenCalledWith(SENDER_ID, "hanukkah");
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
    });

    it('"חנוכה 0501234567" for the owed trip → the flyer + one thank-you, no second trip reply, classifier skipped', async () => {
      knownLiveLead();

      await handleIncomingMessage({ messageText: `חנוכה ${PHONE}`, senderId: SENDER_ID, messageId: "fu-5" });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(outbound.sendTripReply).not.toHaveBeenCalled();
      expect(db.claimTripReply).not.toHaveBeenCalled();
      expect(outbound.sendFlyerImage).toHaveBeenCalledTimes(1);
      expect(outbound.sendFlyerImage).toHaveBeenCalledWith(SENDER_ID, "hanukkah");
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
    });

    it("a sender whose row is still queued → merged into the queue with the phone, then the flyer + thank-you", async () => {
      vi.mocked(db.findQueuedLeadBySender).mockReturnValue(queuedRow({ phone: null }));

      await handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-6" });

      expect(db.enqueueMondayLead).toHaveBeenCalledWith(
        expect.objectContaining({ senderId: SENDER_ID, phone: PHONE, service: "uman" }),
      );
      expect(mondayService.createLeadRow).not.toHaveBeenCalled();
      expect(outbound.sendFlyerImage).toHaveBeenCalledTimes(1);
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
    });

    it("a sender with no row yet → a row is created WITH the phone, no trip-stage pending, no trip question; then the flyer + thank-you", async () => {
      const result = await handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-7" });

      expect(mondayService.createLeadRow).toHaveBeenCalledWith(
        expect.objectContaining({ service: "uman", phone: PHONE }),
      );
      expect(dedup.upsertKnownSender).toHaveBeenCalledWith(
        expect.objectContaining({ senderId: SENDER_ID, mondayItemId: "new-item-123", phone: PHONE }),
      );
      expect(conversation.upsertPendingClarification).not.toHaveBeenCalled();
      expect(outbound.sendTripAsk).not.toHaveBeenCalled();
      expect(outbound.sendTripReply).not.toHaveBeenCalled();
      expect(outbound.sendFlyerImage).toHaveBeenCalledTimes(1);
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
      expect(result.itemId).toBe("new-item-123");
    });

    it("an open trip-stage pending + her phone → resolved with the owed trip, never re-asked", async () => {
      vi.mocked(conversation.getPendingClarification).mockReturnValue({
        monday_item_id: ITEM_ID,
        phone: null,
        reask_count: 1,
        stage: "trip" as const,
        trip: null,
      });
      vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
        boardId: CRM_BOARD,
        groupId: NO_PHONE_GROUP,
        service: "טיסה לאומן",
      });

      await handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-8" });

      expect(conversation.clearPendingClarification).toHaveBeenCalledWith("instagram", SENDER_ID);
      expect(outbound.sendTripAsk).not.toHaveBeenCalled();
      expect(outbound.sendFlyerImage).toHaveBeenCalledTimes(1);
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
    });

    it("an open service-stage pending + her phone → resolved with the owed trip, no trip question", async () => {
      vi.mocked(conversation.getPendingClarification).mockReturnValue({
        monday_item_id: ITEM_ID,
        phone: null,
        reask_count: 0,
        stage: "service" as const,
        trip: null,
      });
      vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue({
        boardId: CRM_BOARD,
        groupId: NO_PHONE_GROUP,
        service: null,
      });

      await handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-9" });

      expect(conversation.clearPendingClarification).toHaveBeenCalledWith("instagram", SENDER_ID);
      expect(conversation.advanceToTripStage).not.toHaveBeenCalled();
      expect(outbound.sendTripAsk).not.toHaveBeenCalled();
      expect(outbound.sendFlyerImage).toHaveBeenCalledTimes(1);
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
    });

    it("two owed trips → both flyers (before the thank-you), one thank-you, both marks consumed", async () => {
      seedOwed(SENDER_ID, "kislev", "hanukkah");
      knownLiveLead();

      await handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-10" });

      expect(outbound.sendFlyerImage).toHaveBeenCalledTimes(2);
      expect(outbound.sendFlyerImage).toHaveBeenCalledWith(SENDER_ID, "kislev");
      expect(outbound.sendFlyerImage).toHaveBeenCalledWith(SENDER_ID, "hanukkah");
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
      expect(callOrder(outbound.sendFlyerImage, 1)).toBeLessThan(callOrder(outbound.sendPhoneThanks));
      expect(db.getOwedCommentTrips(SENDER_ID)).toEqual([]);
    });

    it("two phone messages started together → the flyer and the thank-you go out once", async () => {
      knownLiveLead();
      // A send that takes a macrotask guarantees the second message reaches its
      // consume while the first one is still mid-send.
      vi.mocked(outbound.sendFlyerImage).mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
      );

      await Promise.all([
        handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-conc-1" }),
        handleIncomingMessage({ messageText: `${PHONE} שוב`, senderId: SENDER_ID, messageId: "fu-conc-2" }),
      ]);

      expect(outbound.sendFlyerImage).toHaveBeenCalledTimes(1);
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
      expect(classify.classifyLead).not.toHaveBeenCalled();
    });

    it("Monday errors → the flyer + thank-you still go out and the error propagates (message unmarked)", async () => {
      knownLiveLead();
      vi.mocked(mondayService.getItemBoardAndGroup).mockRejectedValue(new Error("Monday API 500"));

      await expect(
        handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-err" }),
      ).rejects.toThrow("Monday API 500");

      expect(outbound.sendFlyerImage).toHaveBeenCalledTimes(1);
      expect(outbound.sendFlyerImage).toHaveBeenCalledWith(SENDER_ID, "hanukkah");
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
      expect(dedup.unmarkMessageProcessed).toHaveBeenCalledWith("meta", "fu-err");
    });

    it("Monday rate-limits her row → the phone is queued, the flyer + thank-you still go out, nothing is unmarked", async () => {
      knownLiveLead();
      vi.mocked(mondayService.getItemBoardAndGroup).mockRejectedValue(
        new MondayRateLimitError("daily", 9000, "daily cap"),
      );

      await handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-429" });

      expect(db.enqueueMondayLead).toHaveBeenCalledWith(
        expect.objectContaining({ senderId: SENDER_ID, phone: PHONE }),
      );
      expect(outbound.sendFlyerImage).toHaveBeenCalledTimes(1);
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
      expect(dedup.unmarkMessageProcessed).not.toHaveBeenCalled();
    });

    it("consuming the mark throws (DB error) → nothing propagates, the lead is still recorded, she just gets no flyer", async () => {
      knownLiveLead();
      vi.mocked(db.consumeOwedCommentFlyer).mockImplementation(() => {
        throw new Error("SQLITE_BUSY");
      });

      const result = await handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-busy" });

      expect(result.itemId).toBe(ITEM_ID);
      expect(mondayService.updateItemPhone).toHaveBeenCalledWith(ITEM_ID, PHONE);
      expect(outbound.sendFlyerImage).not.toHaveBeenCalled();
      expect(outbound.sendPhoneThanks).not.toHaveBeenCalled();
      expect(dedup.unmarkMessageProcessed).not.toHaveBeenCalled();
    });

    it("a bookkeeping error in the finally does not mask the path's own error", async () => {
      knownLiveLead();
      vi.mocked(mondayService.getItemBoardAndGroup).mockRejectedValue(new Error("Monday API 500"));
      vi.mocked(db.consumeOwedCommentFlyer).mockImplementation(() => {
        throw new Error("SQLITE_BUSY");
      });

      await expect(
        handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-mask" }),
      ).rejects.toThrow("Monday API 500");

      expect(dedup.unmarkMessageProcessed).toHaveBeenCalledWith("meta", "fu-mask");
    });

    it("a flyer send that throws never blocks the thank-you or the result", async () => {
      knownLiveLead();
      vi.mocked(outbound.sendFlyerImage).mockRejectedValue(new Error("IG API 503"));

      const result = await handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-flyer-err" });

      expect(result.itemId).toBe(ITEM_ID);
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
    });
  });

  describe("what is NOT a follow-up", () => {
    it("a trigger word for a DIFFERENT trip → the normal trigger path answers it; the owed mark is untouched", async () => {
      knownLiveLead();

      await handleIncomingMessage({ messageText: "כסלו", senderId: SENDER_ID, messageId: "fu-diff" });

      expect(classify.classifyLead).not.toHaveBeenCalled();
      expect(outbound.sendTripReply).toHaveBeenCalledTimes(1);
      expect(outbound.sendTripReply).toHaveBeenCalledWith(SENDER_ID, { trip: "kislev", hasPhone: false });
      expect(outbound.sendFlyerImage).not.toHaveBeenCalled();
      expect(db.consumeOwedCommentFlyer).not.toHaveBeenCalled();
      expect(db.getOwedCommentTrips(SENDER_ID)).toEqual(["hanukkah"]);
    });

    it("no owed mark → a phone-only message goes through the classifier exactly as before", async () => {
      owedMarks.clear();
      knownLiveLead();
      vi.mocked(classify.classifyLead).mockResolvedValue({ ...notInterestedClassification, extractedPhone: PHONE });

      await handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-none" });

      expect(classify.classifyLead).toHaveBeenCalledTimes(1);
      expect(outbound.sendFlyerImage).not.toHaveBeenCalled();
      // the pre-existing first-phone thank-you for a known uman lead is unchanged
      expect(outbound.sendPhoneThanks).toHaveBeenCalledTimes(1);
      expect(db.consumeOwedCommentFlyer).not.toHaveBeenCalled();
    });

    it("an owed mark belonging to someone else is not hers", async () => {
      owedMarks.clear();
      seedOwed("some_other_sender", "hanukkah");
      knownLiveLead();
      vi.mocked(classify.classifyLead).mockResolvedValue({ ...notInterestedClassification, extractedPhone: PHONE });

      await handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-other" });

      expect(classify.classifyLead).toHaveBeenCalledTimes(1);
      expect(outbound.sendFlyerImage).not.toHaveBeenCalled();
    });

    it("a duplicate webhook delivery returns before the owed marks are even read", async () => {
      vi.mocked(dedup.isMessageProcessed).mockReturnValue(true);

      await handleIncomingMessage({ messageText: PHONE, senderId: SENDER_ID, messageId: "fu-dup" });

      expect(db.getOwedCommentTrips).not.toHaveBeenCalled();
      expect(db.consumeOwedCommentFlyer).not.toHaveBeenCalled();
      expectNoOutbound();
    });

    it("no senderId (dev test-inject) → never a follow-up", async () => {
      await handleIncomingMessage({ messageText: PHONE });

      expect(db.getOwedCommentTrips).not.toHaveBeenCalled();
      expect(classify.classifyLead).toHaveBeenCalledTimes(1);
    });
  });
});
