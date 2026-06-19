import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// Controllable env — lets each test set WA_WEBHOOK_SECRET independently.
const ENV = vi.hoisted(() => ({
  WA_WEBHOOK_SECRET: "",
  WA_FOLLOWUP_ENABLED: false,
  MONDAY_BOARD_CRM_ID: "5094895163",
}));
vi.mock("../../config/env.js", () => ({ env: ENV }));

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
vi.mock("./wa-inbound.service.js", () => ({
  handleInboundWhatsApp: vi.fn().mockResolvedValue(undefined),
}));

import { receiveWebhook, verifyWhatsAppSecret } from "./whatsapp.controller.js";
import { logger } from "../../config/logger.js";
import { UnauthorizedError } from "../../lib/errors.js";

const mockReq = (
  body: unknown,
  query: Record<string, string> = {},
): Request =>
  ({
    body,
    query,
    ip: "127.0.0.1",
  }) as unknown as Request;
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

// ---------------------------------------------------------------------------
// Fix 4 — verifyWhatsAppSecret middleware
// ---------------------------------------------------------------------------

describe("verifyWhatsAppSecret — secret unset (open)", () => {
  it("calls next() immediately when WA_WEBHOOK_SECRET is empty", () => {
    ENV.WA_WEBHOOK_SECRET = "";
    const next = vi.fn() as unknown as NextFunction;
    const res = mockRes() as unknown as Response;
    verifyWhatsAppSecret(mockReq({}), res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("verifyWhatsAppSecret — secret set", () => {
  beforeEach(() => {
    ENV.WA_WEBHOOK_SECRET = "super-secret-token";
  });

  it("calls next() when ?token matches", () => {
    const next = vi.fn() as unknown as NextFunction;
    const res = mockRes() as unknown as Response;
    verifyWhatsAppSecret(
      mockReq({}, { token: "super-secret-token" }),
      res,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("throws UnauthorizedError when ?token is wrong", () => {
    const next = vi.fn() as unknown as NextFunction;
    const res = mockRes() as unknown as Response;
    expect(() =>
      verifyWhatsAppSecret(
        mockReq({}, { token: "wrong-secret" }),
        res,
        next,
      ),
    ).toThrow(UnauthorizedError);
    expect(next).not.toHaveBeenCalled();
  });

  it("throws UnauthorizedError when ?token is absent", () => {
    const next = vi.fn() as unknown as NextFunction;
    const res = mockRes() as unknown as Response;
    expect(() => verifyWhatsAppSecret(mockReq({}), res, next)).toThrow(UnauthorizedError);
    expect(next).not.toHaveBeenCalled();
  });
});
