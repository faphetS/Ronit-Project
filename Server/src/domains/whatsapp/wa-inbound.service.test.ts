import { describe, it, expect, vi, beforeEach } from "vitest";

const ENV = vi.hoisted(() => ({
  MONDAY_GROUP_UMAN_FOLLOWUP_ID: "group_uman_followup",
  MONDAY_GROUP_NOT_RELEVANT_ID: "group_notrelevant",
}));
vi.mock("../../config/env.js", () => ({ env: ENV }));
vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../config/db.js", () => ({ markLeadReplied: vi.fn() }));
vi.mock("../../lib/dedup.js", () => ({
  isMessageProcessed: vi.fn().mockReturnValue(false),
  markMessageProcessed: vi.fn(),
}));
vi.mock("../../lib/negative-intent.js", () => ({ classifyNegativeIntent: vi.fn() }));
vi.mock("../monday/monday.service.js", () => ({
  findLeadByPhone: vi.fn(),
  getItemBoardAndGroup: vi.fn(),
  moveItemToGroup: vi.fn(),
}));
// Keep the real toMsisdn (pure); the module pulls it from the gateway.
vi.mock("./whatsapp.gateway.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./whatsapp.gateway.js")>()),
}));
vi.mock("./uman-welcome.service.js", () => ({ isAllowed: vi.fn().mockReturnValue(true) }));

import { handleInboundWhatsApp } from "./wa-inbound.service.js";
import * as db from "../../config/db.js";
import * as dedup from "../../lib/dedup.js";
import * as neg from "../../lib/negative-intent.js";
import * as monday from "../monday/monday.service.js";
import * as welcome from "./uman-welcome.service.js";

const LEAD = { itemId: "111", name: "דנה" };
const PRIVATE = { from: "972521234567", message: "hey", timestamp: 1781712601 };
const inFollowupGroup = { boardId: "b", groupId: "group_uman_followup", service: "אומן" };
const negative = { notInterested: true, via: "keyword" as const, confidence: 0.99 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(welcome.isAllowed).mockReturnValue(true);
  vi.mocked(dedup.isMessageProcessed).mockReturnValue(false);
  vi.mocked(monday.findLeadByPhone).mockResolvedValue(LEAD);
  vi.mocked(monday.getItemBoardAndGroup).mockResolvedValue(inFollowupGroup);
  vi.mocked(neg.classifyNegativeIntent).mockResolvedValue({ notInterested: false, via: "llm", confidence: 0 });
});

describe("handleInboundWhatsApp — activity + negative routing", () => {
  it("matched lead + neutral text → records activity, no move, marks processed", async () => {
    await handleInboundWhatsApp(PRIVATE);
    expect(db.markLeadReplied).toHaveBeenCalledWith("111", "972521234567");
    expect(monday.moveItemToGroup).not.toHaveBeenCalled();
    expect(dedup.markMessageProcessed).toHaveBeenCalledWith("wa_inbound", expect.any(String));
  });

  it("negative text + lead IN follow-up group → moves to not-relevant", async () => {
    vi.mocked(neg.classifyNegativeIntent).mockResolvedValue(negative);
    await handleInboundWhatsApp({ ...PRIVATE, message: "לא רלוונטי" });
    expect(db.markLeadReplied).toHaveBeenCalledWith("111", "972521234567");
    expect(monday.moveItemToGroup).toHaveBeenCalledWith("111", "group_notrelevant");
  });

  it("negative text but lead in a DIFFERENT group (e.g. new-leads) → no move", async () => {
    vi.mocked(neg.classifyNegativeIntent).mockResolvedValue(negative);
    vi.mocked(monday.getItemBoardAndGroup).mockResolvedValue({
      boardId: "b",
      groupId: "new_group29179",
      service: "אומן",
    });
    await handleInboundWhatsApp({ ...PRIVATE, message: "לא מעוניינת" });
    expect(monday.moveItemToGroup).not.toHaveBeenCalled();
  });

  it("negative text but item not active (trashed) → no move", async () => {
    vi.mocked(neg.classifyNegativeIntent).mockResolvedValue(negative);
    vi.mocked(monday.getItemBoardAndGroup).mockResolvedValue(null);
    await handleInboundWhatsApp({ ...PRIVATE, message: "לא רלוונטי" });
    expect(monday.moveItemToGroup).not.toHaveBeenCalled();
  });

  it("sender not allowlisted → skips entirely (no lookup, no move)", async () => {
    vi.mocked(welcome.isAllowed).mockReturnValue(false);
    await handleInboundWhatsApp({ ...PRIVATE, message: "לא רלוונטי" });
    expect(monday.findLeadByPhone).not.toHaveBeenCalled();
    expect(db.markLeadReplied).not.toHaveBeenCalled();
    expect(monday.moveItemToGroup).not.toHaveBeenCalled();
  });

  it("no CRM phone match → no activity, no classify, no move (but marked)", async () => {
    vi.mocked(monday.findLeadByPhone).mockResolvedValue(null);
    await handleInboundWhatsApp(PRIVATE);
    expect(db.markLeadReplied).not.toHaveBeenCalled();
    expect(neg.classifyNegativeIntent).not.toHaveBeenCalled();
    expect(monday.moveItemToGroup).not.toHaveBeenCalled();
    expect(dedup.markMessageProcessed).toHaveBeenCalled();
  });

  it("empty message → activity recorded, classifier NOT called", async () => {
    await handleInboundWhatsApp({ ...PRIVATE, message: "   " });
    expect(db.markLeadReplied).toHaveBeenCalledWith("111", "972521234567");
    expect(neg.classifyNegativeIntent).not.toHaveBeenCalled();
  });

  it("duplicate (already processed) → fully short-circuits, never marks again", async () => {
    vi.mocked(dedup.isMessageProcessed).mockReturnValue(true);
    await handleInboundWhatsApp(PRIVATE);
    expect(monday.findLeadByPhone).not.toHaveBeenCalled();
    expect(db.markLeadReplied).not.toHaveBeenCalled();
    expect(dedup.markMessageProcessed).not.toHaveBeenCalled();
  });

  it("missing 'from' → no-op", async () => {
    await handleInboundWhatsApp({ message: "hi" });
    expect(dedup.markMessageProcessed).not.toHaveBeenCalled();
    expect(monday.findLeadByPhone).not.toHaveBeenCalled();
  });

  it("normalizes Israeli-local from (0xx) before matching", async () => {
    await handleInboundWhatsApp({ ...PRIVATE, from: "0521234567" });
    expect(monday.findLeadByPhone).toHaveBeenCalledWith("972521234567");
  });
});

describe("handleInboundWhatsApp — durability (mark only on success)", () => {
  it("a Monday call throws mid-process → NOT marked (re-processable), no throw out", async () => {
    vi.mocked(neg.classifyNegativeIntent).mockResolvedValue(negative);
    vi.mocked(monday.getItemBoardAndGroup).mockRejectedValue(new Error("Monday 502"));
    await expect(handleInboundWhatsApp({ ...PRIVATE, message: "לא רלוונטי" })).resolves.toBeUndefined();
    expect(monday.moveItemToGroup).not.toHaveBeenCalled();
    expect(dedup.markMessageProcessed).not.toHaveBeenCalled();
  });

  it("findLeadByPhone throws → not marked", async () => {
    vi.mocked(monday.findLeadByPhone).mockRejectedValue(new Error("Monday 502"));
    await handleInboundWhatsApp(PRIVATE);
    expect(dedup.markMessageProcessed).not.toHaveBeenCalled();
  });

  it("distinct same-second messages get distinct dedup keys (no collision)", async () => {
    const keys: string[] = [];
    vi.mocked(dedup.markMessageProcessed).mockImplementation((_s, id) => {
      keys.push(id);
    });
    await handleInboundWhatsApp({ from: "972521234567", message: "אולי", timestamp: 1781712601 });
    await handleInboundWhatsApp({ from: "972521234567", message: "לא רלוונטי", timestamp: 1781712601 });
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]); // same from+timestamp, different message → different key
  });
});
