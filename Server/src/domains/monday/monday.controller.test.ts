import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

const ENV = vi.hoisted(() => ({
  MONDAY_WEBHOOK_SECRET: "",
}));
vi.mock("../../config/env.js", () => ({ env: ENV }));

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("./monday.client.js", () => ({ gql: vi.fn() }));
vi.mock("./monday.webhook.service.js", () => ({ moveClosedItem: vi.fn() }));
vi.mock("./monday.service.js", () => ({ getItemServiceAndPhone: vi.fn() }));
vi.mock("../whatsapp/uman-welcome.service.js", () => ({
  maybeSendUmanWelcome: vi.fn().mockResolvedValue(undefined),
}));

import { handleLeadReady, verifyMondaySecret } from "./monday.controller.js";
import { UnauthorizedError } from "../../lib/errors.js";
import * as mondayService from "./monday.service.js";
import * as umanWelcome from "../whatsapp/uman-welcome.service.js";

const mockReq = (body: unknown, query: Record<string, string> = {}): Request =>
  ({ body, query, ip: "127.0.0.1" }) as unknown as Request;

const mockRes = (): Response & {
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
} => {
  const res = {
    json: vi.fn(),
    status: vi.fn(),
  } as unknown as Response & { json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> };
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  ENV.MONDAY_WEBHOOK_SECRET = "";
});

// ---------------------------------------------------------------------------
// verifyMondaySecret
// ---------------------------------------------------------------------------

describe("verifyMondaySecret — secret unset (open)", () => {
  it("calls next() immediately when MONDAY_WEBHOOK_SECRET is empty", () => {
    ENV.MONDAY_WEBHOOK_SECRET = "";
    const next = vi.fn() as unknown as NextFunction;
    verifyMondaySecret(mockReq({}), mockRes() as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("verifyMondaySecret — secret set", () => {
  beforeEach(() => {
    ENV.MONDAY_WEBHOOK_SECRET = "test-monday-secret";
  });

  it("calls next() when ?token matches", () => {
    const next = vi.fn() as unknown as NextFunction;
    verifyMondaySecret(
      mockReq({}, { token: "test-monday-secret" }),
      mockRes() as unknown as Response,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("throws UnauthorizedError when ?token is wrong", () => {
    const next = vi.fn() as unknown as NextFunction;
    expect(() =>
      verifyMondaySecret(
        mockReq({}, { token: "wrong" }),
        mockRes() as unknown as Response,
        next,
      ),
    ).toThrow(UnauthorizedError);
    expect(next).not.toHaveBeenCalled();
  });

  it("throws UnauthorizedError when ?token is absent", () => {
    const next = vi.fn() as unknown as NextFunction;
    expect(() =>
      verifyMondaySecret(mockReq({}), mockRes() as unknown as Response, next),
    ).toThrow(UnauthorizedError);
  });
});

// ---------------------------------------------------------------------------
// handleLeadReady
// ---------------------------------------------------------------------------

describe("handleLeadReady", () => {
  it("(a) uman + phone → welcome called once with mondayItemId=pulseId, returns 200", async () => {
    vi.mocked(mondayService.getItemServiceAndPhone).mockResolvedValue({
      service: "uman",
      phone: "972501234567",
    });

    const res = mockRes();
    await handleLeadReady(mockReq({ event: { pulseId: 12345 } }), res as unknown as Response);

    expect(mondayService.getItemServiceAndPhone).toHaveBeenCalledWith("12345");
    expect(umanWelcome.maybeSendUmanWelcome).toHaveBeenCalledWith({
      senderId: "12345",
      mondayItemId: "12345",
      service: "uman",
      phone: "972501234567",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: "ok" });
  });

  it("(b) challah + phone → welcome NOT called, returns 200", async () => {
    vi.mocked(mondayService.getItemServiceAndPhone).mockResolvedValue({
      service: "challah",
      phone: "972501234567",
    });

    const res = mockRes();
    await handleLeadReady(mockReq({ event: { pulseId: 12345 } }), res as unknown as Response);

    expect(umanWelcome.maybeSendUmanWelcome).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("(c) uman, no phone → welcome NOT called, returns 200", async () => {
    vi.mocked(mondayService.getItemServiceAndPhone).mockResolvedValue({
      service: "uman",
      phone: null,
    });

    const res = mockRes();
    await handleLeadReady(mockReq({ event: { pulseId: 12345 } }), res as unknown as Response);

    expect(umanWelcome.maybeSendUmanWelcome).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("(d) Monday challenge body → echoes challenge", async () => {
    const res = mockRes();
    await handleLeadReady(mockReq({ challenge: "abc123" }), res as unknown as Response);

    expect(res.json).toHaveBeenCalledWith({ challenge: "abc123" });
    expect(umanWelcome.maybeSendUmanWelcome).not.toHaveBeenCalled();
  });

  it("(e) getItemServiceAndPhone returns null → welcome NOT called, returns 200", async () => {
    vi.mocked(mondayService.getItemServiceAndPhone).mockResolvedValue(null);

    const res = mockRes();
    await handleLeadReady(mockReq({ event: { pulseId: 12345 } }), res as unknown as Response);

    expect(umanWelcome.maybeSendUmanWelcome).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: "ok" });
  });

  it("invalid payload (no event) → ignored, returns 200", async () => {
    const res = mockRes();
    await handleLeadReady(mockReq({ unexpected: "data" }), res as unknown as Response);

    expect(umanWelcome.maybeSendUmanWelcome).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: "ignored" });
  });

  it("getItemServiceAndPhone throws → logs error, still returns 200", async () => {
    vi.mocked(mondayService.getItemServiceAndPhone).mockRejectedValue(new Error("network error"));

    const res = mockRes();
    await handleLeadReady(mockReq({ event: { pulseId: 99999 } }), res as unknown as Response);

    expect(umanWelcome.maybeSendUmanWelcome).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: "ok" });
  });
});
