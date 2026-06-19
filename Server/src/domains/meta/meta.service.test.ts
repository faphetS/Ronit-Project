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
}));

vi.mock("../../lib/classify.js", () => ({
  classifyLead: vi.fn(),
}));

vi.mock("../monday/monday.service.js", () => ({
  createLeadRow: vi.fn().mockResolvedValue({ itemId: "new-item-123" }),
  updateItemPhone: vi.fn().mockResolvedValue(undefined),
  updateItemService: vi.fn().mockResolvedValue(undefined),
  updateLastIgMessage: vi.fn().mockResolvedValue(undefined),
  getItemBoardAndGroup: vi.fn(),
  moveItemToGroup: vi.fn().mockResolvedValue(undefined),
  findLeadOnBoard: vi.fn().mockResolvedValue(null),
  // Real two-branch logic so phone-routing assertions work without stubbing every case.
  leadGroupForPhone: vi.fn((phone: string | null | undefined) =>
    phone ? "new_group29179" : "group_mm469wrf",
  ),
  mapItemServiceToKey: vi.fn((label: string | null | undefined) =>
    !label ? null : label.includes("אומן") ? "uman" : label.includes("חלה") ? "challah" : null,
  ),
}));

vi.mock("../monday/monday.webhook.service.js", () => ({
  getActiveServiceBoardIds: vi.fn().mockResolvedValue([]),
}));

vi.mock("../whatsapp/uman-welcome.service.js", () => ({
  maybeSendUmanWelcome: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./meta.outbound.service.js", () => ({
  sendReplyDM: vi.fn().mockResolvedValue(undefined),
  sendServiceQuestion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./meta.profile.service.js", () => ({
  fetchIgProfile: vi.fn().mockResolvedValue({ username: "test_user" }),
}));

import { handleIncomingMessage } from "./meta.service.js";
import { env } from "../../config/env.js";
import * as dedup from "../../lib/dedup.js";
import * as conversation from "../../lib/conversation.js";
import * as classify from "../../lib/classify.js";
import * as mondayService from "../monday/monday.service.js";
import * as mondayWebhookService from "../monday/monday.webhook.service.js";
import * as outbound from "./meta.outbound.service.js";
import * as umanWelcome from "../whatsapp/uman-welcome.service.js";


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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dedup.isMessageProcessed).mockReturnValue(false);
  vi.mocked(dedup.unmarkMessageProcessed).mockReturnValue(undefined);
  vi.mocked(dedup.findKnownSender).mockReturnValue(null);
  vi.mocked(conversation.getPendingClarification).mockReturnValue(null);
  vi.mocked(conversation.incrementReaskCount).mockReturnValue(1);
  vi.mocked(classify.classifyLead).mockResolvedValue(interestedClassification);
  vi.mocked(mondayService.createLeadRow).mockResolvedValue({ itemId: "new-item-123" });
  vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue(null);
  vi.mocked(mondayService.findLeadOnBoard).mockResolvedValue(null);
  vi.mocked(mondayService.updateItemService).mockResolvedValue(undefined);
  vi.mocked(mondayWebhookService.getActiveServiceBoardIds).mockResolvedValue([]);
  vi.mocked(outbound.sendReplyDM).mockResolvedValue(undefined);
  vi.mocked(outbound.sendServiceQuestion).mockResolvedValue(undefined);
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
    vi.mocked(mondayWebhookService.getActiveServiceBoardIds).mockResolvedValue([]);

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
    expect(outbound.sendReplyDM).toHaveBeenCalled();
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
    vi.mocked(mondayWebhookService.getActiveServiceBoardIds).mockResolvedValue([
      "service-board-111",
    ]);
    vi.mocked(mondayService.findLeadOnBoard).mockResolvedValue({
      itemId: "service-item-222",
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
    vi.mocked(mondayWebhookService.getActiveServiceBoardIds).mockResolvedValue([]);

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

describe("handleIncomingMessage — new lead names a service (Entry A)", () => {
  it("uman + phone → createLeadRow(service uman), sendReplyDM(answered:false), no question, no pending", async () => {
    const result = await handleIncomingMessage({
      messageText: "אני רוצה טיסה לאומן 0501234567",
      senderId: SENDER_ID,
      messageId: "entryA1",
    });

    expect(mondayService.createLeadRow).toHaveBeenCalledWith(
      expect.objectContaining({ service: "uman" }),
    );
    expect(outbound.sendReplyDM).toHaveBeenCalledWith(SENDER_ID, {
      service: "uman",
      hasPhone: true,
      answered: false,
    });
    expect(outbound.sendServiceQuestion).not.toHaveBeenCalled();
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

describe("handleIncomingMessage — pending lead answers with a service (Entry B step 2)", () => {
  it("updates service, sends answered reply, clears pending, no new row", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 0,
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
    expect(outbound.sendReplyDM).toHaveBeenCalledWith(SENDER_ID, {
      service: "uman",
      hasPhone: true,
      answered: true,
    });
    expect(conversation.clearPendingClarification).toHaveBeenCalledWith("instagram", SENDER_ID);
    expect(mondayService.createLeadRow).not.toHaveBeenCalled();
    expect(result.itemId).toBe(ITEM_ID);
  });
});

describe("handleIncomingMessage — pending lead replies WITHOUT a service", () => {
  it("re-asks and increments when under the cap", async () => {
    vi.mocked(conversation.getPendingClarification).mockReturnValue({
      monday_item_id: ITEM_ID,
      phone: null,
      reask_count: 1,
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

    expect(outbound.sendReplyDM).toHaveBeenCalledWith(SENDER_ID, {
      service: "uman",
      hasPhone: false,
      answered: true,
    });
    expect(conversation.clearPendingClarification).toHaveBeenCalled();
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
  it("resolves and creates lead even when sendReplyDM throws", async () => {
    vi.mocked(outbound.sendReplyDM).mockRejectedValue(new Error("IG API 503"));

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
