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

// handleIncomingComment spy — comment-event routing.
vi.mock("./meta.comment.service.js", () => ({
  handleIncomingComment: vi.fn().mockResolvedValue(undefined),
}));

import { receiveWebhook } from "./meta.controller.js";
import * as metaService from "./meta.service.js";
import * as commentService from "./meta.comment.service.js";

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

describe("receiveWebhook — comment events", () => {
  it("routes a 'comments' change to handleIncomingComment", async () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "ig-account",
          time: 1700000000,
          changes: [
            {
              field: "comments",
              value: {
                from: { id: "commenter-1", username: "tester" },
                media: { id: "media-1" },
                id: "comment-1",
                text: "אומן",
              },
            },
          ],
        },
      ],
    };

    const res = makeRes();
    await receiveWebhook(makeReq(payload), res);

    expect(commentService.handleIncomingComment).toHaveBeenCalledWith({
      commentId: "comment-1",
      commentText: "אומן",
      commenterId: "commenter-1",
      commenterUsername: "tester",
      mediaId: "media-1",
      recipientId: "ig-account",
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("ignores non-comments fields and removed comments", async () => {
    const payload = {
      object: "instagram",
      entry: [
        { changes: [{ field: "mentions", value: { id: "x", text: "hi", from: { id: "y" } } }] },
        {
          changes: [
            {
              field: "comments",
              value: { id: "c2", text: "אומן", from: { id: "z" }, verb: "remove" },
            },
          ],
        },
      ],
    };

    await receiveWebhook(makeReq(payload), makeRes());
    expect(commentService.handleIncomingComment).not.toHaveBeenCalled();
  });
});
