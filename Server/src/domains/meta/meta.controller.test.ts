import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// Minimal env for the controller.
const ENV = vi.hoisted(() => ({
  META_APP_SECRET: "",
  META_VERIFY_TOKEN: "test-token",
}));
vi.mock("../../config/env.js", () => ({ env: ENV }));

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// handleIncomingMessage spy — captures every call's messageId arg.
vi.mock("./meta.service.js", () => ({
  handleIncomingMessage: vi.fn().mockResolvedValue({
    itemId: null,
    classification: { interested: false, service: null, extractedName: null, extractedPhone: null, confidence: 0, rawResponse: "" },
  }),
}));

import { receiveWebhook } from "./meta.controller.js";
import * as metaService from "./meta.service.js";

function makeRawBody(payload: unknown): Buffer {
  return Buffer.from(JSON.stringify(payload), "utf8");
}

function makeReq(payload: unknown): Request {
  return {
    body: makeRawBody(payload),
    header: (_name: string) => undefined,
  } as unknown as Request;
}

function makeRes(): Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe("receiveWebhook — Fix 3: mid-absent fallback messageId", () => {
  it("uses mid as messageId when present", async () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "sender-123" },
              timestamp: 1700000000,
              message: { mid: "real-mid-abc", text: "שלום" },
            },
          ],
        },
      ],
    };

    await receiveWebhook(makeReq(payload), makeRes());

    expect(metaService.handleIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "real-mid-abc" }),
    );
  });

  it("builds fallback messageId from senderId:timestamp when mid is absent", async () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "sender-456" },
              timestamp: 1700001234,
              message: { text: "שלום" }, // no mid
            },
          ],
        },
      ],
    };

    await receiveWebhook(makeReq(payload), makeRes());

    expect(metaService.handleIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "sender-456:1700001234" }),
    );
  });

  it("passes undefined messageId when both mid and timestamp are absent", async () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "sender-789" },
              // no timestamp, no mid
              message: { text: "שלום" },
            },
          ],
        },
      ],
    };

    await receiveWebhook(makeReq(payload), makeRes());

    expect(metaService.handleIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: undefined }),
    );
  });
});
