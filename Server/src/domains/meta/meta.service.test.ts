import { describe, it, expect, vi, beforeEach } from "vitest";

// All db-touching modules must be mocked before any import of meta.service.ts.
vi.mock("../../lib/dedup.js", () => ({
  isMessageProcessed: vi.fn().mockReturnValue(false),
  markMessageProcessed: vi.fn(),
  findKnownSender: vi.fn().mockReturnValue(null),
  upsertKnownSender: vi.fn(),
  updateSenderPhone: vi.fn(),
  deleteKnownSenderByItemId: vi.fn(),
}));

vi.mock("../../lib/classify.js", () => ({
  classifyLead: vi.fn(),
}));

vi.mock("../monday/monday.service.js", () => ({
  createLeadRow: vi.fn().mockResolvedValue({ itemId: "new-item-123" }),
  updateItemPhone: vi.fn().mockResolvedValue(undefined),
  updateLastIgMessage: vi.fn().mockResolvedValue(undefined),
  getItemBoardAndGroup: vi.fn(),
  moveItemToGroup: vi.fn().mockResolvedValue(undefined),
  findLeadOnBoard: vi.fn().mockResolvedValue(null),
}));

vi.mock("../monday/monday.webhook.service.js", () => ({
  getActiveServiceBoardIds: vi.fn().mockResolvedValue([]),
}));

vi.mock("./meta.outbound.service.js", () => ({
  sendFirstContactDM: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./meta.profile.service.js", () => ({
  fetchIgProfile: vi.fn().mockResolvedValue({ username: "test_user" }),
}));

import { handleIncomingMessage } from "./meta.service.js";
import { env } from "../../config/env.js";
import * as dedup from "../../lib/dedup.js";
import * as classify from "../../lib/classify.js";
import * as mondayService from "../monday/monday.service.js";
import * as mondayWebhookService from "../monday/monday.webhook.service.js";
import * as outbound from "./meta.outbound.service.js";

const SENDER_ID = "ig_sender_001";
const ITEM_ID = "crm-item-456";
const NEW_LEADS_GROUP = env.MONDAY_GROUP_NEW_LEADS_ID;
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dedup.isMessageProcessed).mockReturnValue(false);
  vi.mocked(dedup.findKnownSender).mockReturnValue(null);
  vi.mocked(classify.classifyLead).mockResolvedValue(interestedClassification);
  vi.mocked(mondayService.createLeadRow).mockResolvedValue({ itemId: "new-item-123" });
  vi.mocked(mondayService.getItemBoardAndGroup).mockResolvedValue(null);
  vi.mocked(mondayService.findLeadOnBoard).mockResolvedValue(null);
  vi.mocked(mondayWebhookService.getActiveServiceBoardIds).mockResolvedValue([]);
  vi.mocked(outbound.sendFirstContactDM).mockResolvedValue(undefined);
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
    expect(outbound.sendFirstContactDM).toHaveBeenCalled();
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
