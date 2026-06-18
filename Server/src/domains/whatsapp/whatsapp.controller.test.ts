import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("./holiday.service.js", () => ({
  checkAndPromptHoliday: vi.fn(),
  broadcastHolidayCampaign: vi.fn(),
}));
vi.mock("./followup.service.js", () => ({
  checkAndSendFollowups: vi.fn(),
}));

import { receiveWebhook } from "./whatsapp.controller.js";
import { logger } from "../../config/logger.js";

const mockReq = (body: unknown): Request => ({ body }) as unknown as Request;
const mockRes = (): Response & { sendStatus: ReturnType<typeof vi.fn> } =>
  ({ sendStatus: vi.fn() }) as unknown as Response & { sendStatus: ReturnType<typeof vi.fn> };

beforeEach(() => vi.clearAllMocks());

describe("receiveWebhook — private DM vs group vs outgoing", () => {
  it("private incoming → logged as a real inbound", async () => {
    const res = mockRes();
    await receiveWebhook(
      mockReq({ type: "incoming", chatType: "private", from: "639603913514", message: "hey" }),
      res,
    );
    expect(res.sendStatus).toHaveBeenCalledWith(200);
    expect(logger.info).toHaveBeenCalledWith(expect.anything(), "Inbound webhook received");
  });

  it("group message → ignored (clutter)", async () => {
    const res = mockRes();
    await receiveWebhook(
      mockReq({
        type: "incoming",
        chatType: "group",
        from: "120363426547226533",
        participant: "207163620356218",
        message: "x",
      }),
      res,
    );
    expect(res.sendStatus).toHaveBeenCalledWith(200);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "group" }),
      "WhatsApp non-lead event — ignored",
    );
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), "Inbound webhook received");
  });

  it("group detected by participant field even without chatType → ignored", async () => {
    const res = mockRes();
    await receiveWebhook(mockReq({ type: "incoming", from: "120363", participant: "207163620356218" }), res);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "group" }),
      "WhatsApp non-lead event — ignored",
    );
  });

  it("outgoing echo → ignored", async () => {
    const res = mockRes();
    await receiveWebhook(mockReq({ type: "outgoing", chatType: "private", from: "972507722240", message: "x" }), res);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "outgoing" }),
      "WhatsApp non-lead event — ignored",
    );
  });
});
