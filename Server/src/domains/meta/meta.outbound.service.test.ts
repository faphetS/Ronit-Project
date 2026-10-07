import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the token source so no real IG token is touched and the send proceeds.
vi.mock("./meta.token.service.js", () => ({
  getCurrentIgToken: vi.fn().mockResolvedValue("test-token"),
}));

import {
  pickReplyTemplate,
  sendReplyDM,
  sendServiceQuestion,
  sendPhoneThanks,
  sendCommentPrivateReply,
  postCommentReply,
  sendFlyerImage,
  sendTripAsk,
  pickTripTemplate,
  sendTripReply,
} from "./meta.outbound.service.js";
import { getCurrentIgToken } from "./meta.token.service.js";
import { AppError } from "../../lib/errors.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

const RID = "IGSID_123";
const FORM_LINK = `https://www.orhazadik.online/?ig_id=${encodeURIComponent(RID)}`;
const KISLEV_FLYER_URL = "https://api.ronitbarash.site/static/uman-kislev.jpeg";
const HANUKKAH_FLYER_URL = "https://api.ronitbarash.site/static/uman-hanukkah-v2.jpeg";

// Mirror the transform applied inside the outbound sender.
function render(template: string): string {
  return template.replace(/\\n/g, "\n").replaceAll("{form_link}", FORM_LINK);
}

let fetchMock: ReturnType<typeof vi.fn>;

// Text is always the first bubble sent (the flyer, when it fires, is the second),
// so this must read calls[0], not the last call.
function sentText(): string {
  const init = fetchMock.mock.calls[0]?.[1] as { body: string };
  return (JSON.parse(init.body) as { message: { text: string } }).message.text;
}

function callBody(index: number): {
  message: { text?: string; attachments?: Array<{ type: string; payload: { url: string } }> };
} {
  const init = fetchMock.mock.calls[index]?.[1] as { body: string };
  return JSON.parse(init.body) as {
    message: { text?: string; attachments?: Array<{ type: string; payload: { url: string } }> };
  };
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => "",
  });
  vi.stubGlobal("fetch", fetchMock);
  // mockReset: a once-rejection queued by a test that failed early must not leak into the next one.
  vi.mocked(getCurrentIgToken).mockReset().mockResolvedValue("test-token");
});

describe("pickReplyTemplate — service × phone × path routing", () => {
  it("challah + phone, first contact → SERVICE_PHONE_PRESENT", () => {
    expect(pickReplyTemplate({ service: "challah", hasPhone: true, answered: false }).template)
      .toBe(env.IG_MSG_SERVICE_PHONE_PRESENT);
  });
  it("challah + no phone, first contact → SERVICE_PHONE_MISSING", () => {
    expect(pickReplyTemplate({ service: "challah", hasPhone: false, answered: false }).template)
      .toBe(env.IG_MSG_SERVICE_PHONE_MISSING);
  });
  it("uman + phone, first contact → PHONE_PRESENT (deprecated, kept working)", () => {
    expect(pickReplyTemplate({ service: "uman", hasPhone: true, answered: false }).template)
      .toBe(env.IG_MSG_PHONE_PRESENT);
  });
  it("uman + no phone, first contact → PHONE_MISSING (deprecated, kept working)", () => {
    expect(pickReplyTemplate({ service: "uman", hasPhone: false, answered: false }).template)
      .toBe(env.IG_MSG_PHONE_MISSING);
  });
  it("uman + no phone, after question → UMAN_ANSWER_PHONE_MISSING (deprecated, kept working)", () => {
    expect(pickReplyTemplate({ service: "uman", hasPhone: false, answered: true }).template)
      .toBe(env.IG_MSG_UMAN_ANSWER_PHONE_MISSING);
  });
  it("uman + phone, after question → UMAN_ANSWER_PHONE_PRESENT (deprecated, kept working)", () => {
    expect(pickReplyTemplate({ service: "uman", hasPhone: true, answered: true }).template)
      .toBe(env.IG_MSG_UMAN_ANSWER_PHONE_PRESENT);
  });
  it("challah + no phone, after question → CHALLAH_ANSWER_PHONE_MISSING", () => {
    expect(pickReplyTemplate({ service: "challah", hasPhone: false, answered: true }).template)
      .toBe(env.IG_MSG_CHALLAH_ANSWER_PHONE_MISSING);
  });
  it("challah + phone, after question → CHALLAH_ANSWER_PHONE_PRESENT", () => {
    expect(pickReplyTemplate({ service: "challah", hasPhone: true, answered: true }).template)
      .toBe(env.IG_MSG_CHALLAH_ANSWER_PHONE_PRESENT);
  });
});

describe("sendReplyDM — sends the resolved template", () => {
  it("challah first-contact: plain, no link, no 'רבינו'", async () => {
    await sendReplyDM(RID, { service: "challah", hasPhone: true, answered: false });
    const text = sentText();
    expect(text).toBe(render(env.IG_MSG_SERVICE_PHONE_PRESENT));
    expect(text).not.toContain("רבינו");
    expect(text).not.toContain(FORM_LINK);
  });

  it("challah after question → plain answer copy, no link", async () => {
    await sendReplyDM(RID, { service: "challah", hasPhone: false, answered: true });
    const text = sentText();
    expect(text).toBe(render(env.IG_MSG_CHALLAH_ANSWER_PHONE_MISSING));
    expect(text).not.toContain(FORM_LINK);
  });

  it("posts to the IG Graph messages endpoint addressed to the recipient", async () => {
    await sendReplyDM(RID, { service: "challah", hasPhone: true, answered: false });
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(String(url)).toContain("graph.instagram.com");
    expect(String(url)).toContain("/me/messages");
    const body = JSON.parse((init as { body: string }).body) as {
      recipient: { id: string };
    };
    expect(body.recipient.id).toBe(RID);
  });

  it("never sends a flyer (uman no longer reached from the DM path; flyers are trip-specific now)", async () => {
    await sendReplyDM(RID, { service: "uman", hasPhone: true, answered: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendServiceQuestion", () => {
  it("sends exactly IG_MSG_ASK_SERVICE, naming both services, no link", async () => {
    await sendServiceQuestion(RID);
    const text = sentText();
    expect(text).toBe(render(env.IG_MSG_ASK_SERVICE));
    expect(text).toContain("הפרשת חלה");
    expect(text).toContain("טיסה לאומן");
    expect(text).not.toContain(FORM_LINK);
  });

  it("no flyer", async () => {
    await sendServiceQuestion(RID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendPhoneThanks", () => {
  it("sends exactly IG_MSG_PHONE_THANKS, no link", async () => {
    await sendPhoneThanks(RID);
    const text = sentText();
    expect(text).toBe(render(env.IG_MSG_PHONE_THANKS));
    expect(text).not.toContain(FORM_LINK);
  });

  it("no flyer", async () => {
    await sendPhoneThanks(RID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendTripAsk", () => {
  it("sends exactly IG_MSG_UMAN_TRIP_ASK, naming both trips", async () => {
    await sendTripAsk(RID);
    const text = sentText();
    expect(text).toBe(render(env.IG_MSG_UMAN_TRIP_ASK));
    expect(text).toContain("חנוכה");
    expect(text).toContain('כסלו');
  });

  it("no flyer — she has not chosen a trip yet", async () => {
    await sendTripAsk(RID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("pickTripTemplate — trip × phone routing", () => {
  it("kislev + phone → UMAN_KISLEV_PHONE_PRESENT", () => {
    expect(pickTripTemplate({ trip: "kislev", hasPhone: true }).template)
      .toBe(env.IG_MSG_UMAN_KISLEV_PHONE_PRESENT);
  });
  it("kislev + no phone → UMAN_KISLEV_PHONE_MISSING", () => {
    expect(pickTripTemplate({ trip: "kislev", hasPhone: false }).template)
      .toBe(env.IG_MSG_UMAN_KISLEV_PHONE_MISSING);
  });
  it("hanukkah + phone → UMAN_HANUKKAH_PHONE_PRESENT", () => {
    expect(pickTripTemplate({ trip: "hanukkah", hasPhone: true }).template)
      .toBe(env.IG_MSG_UMAN_HANUKKAH_PHONE_PRESENT);
  });
  it("hanukkah + no phone → UMAN_HANUKKAH_PHONE_MISSING", () => {
    expect(pickTripTemplate({ trip: "hanukkah", hasPhone: false }).template)
      .toBe(env.IG_MSG_UMAN_HANUKKAH_PHONE_MISSING);
  });
});

describe("sendTripReply — sends the resolved trip template, then that trip's flyer", () => {
  afterEach(() => {
    vi.useRealTimers();
    env.IG_OUTBOUND_DRYRUN = false;
  });

  it("kislev + phone present → text then kislev flyer", async () => {
    await sendTripReply(RID, { trip: "kislev", hasPhone: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(callBody(0).message.text).toBe(render(env.IG_MSG_UMAN_KISLEV_PHONE_PRESENT));
    expect(callBody(1).message.attachments).toEqual([{ type: "image", payload: { url: KISLEV_FLYER_URL } }]);
  });

  it("kislev + phone missing → text then kislev flyer", async () => {
    await sendTripReply(RID, { trip: "kislev", hasPhone: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(callBody(0).message.text).toBe(render(env.IG_MSG_UMAN_KISLEV_PHONE_MISSING));
    expect(callBody(1).message.attachments).toEqual([{ type: "image", payload: { url: KISLEV_FLYER_URL } }]);
  });

  it("hanukkah + phone present → text then hanukkah flyer", async () => {
    await sendTripReply(RID, { trip: "hanukkah", hasPhone: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(callBody(0).message.text).toBe(render(env.IG_MSG_UMAN_HANUKKAH_PHONE_PRESENT));
    expect(callBody(1).message.attachments).toEqual([{ type: "image", payload: { url: HANUKKAH_FLYER_URL } }]);
  });

  it("hanukkah + phone missing → text then hanukkah flyer", async () => {
    await sendTripReply(RID, { trip: "hanukkah", hasPhone: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(callBody(0).message.text).toBe(render(env.IG_MSG_UMAN_HANUKKAH_PHONE_MISSING));
    expect(callBody(1).message.attachments).toEqual([{ type: "image", payload: { url: HANUKKAH_FLYER_URL } }]);
  });

  it("resolves true once the text bubble is sent (the flyer goes out after it)", async () => {
    await expect(sendTripReply(RID, { trip: "kislev", hasPhone: true })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("text send failure → resolves false, flyer never attempted", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" });
    await expect(sendTripReply(RID, { trip: "kislev", hasPhone: true })).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("text send network error → resolves false, flyer never attempted", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(sendTripReply(RID, { trip: "hanukkah", hasPhone: false })).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("flyer fails once then succeeds on the ~1s retry", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" }) // text
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "down" }) // flyer attempt 1
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" }); // flyer retry

    const promise = sendTripReply(RID, { trip: "hanukkah", hasPhone: true });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("flyer fails twice → logged at error level, no throw, still resolves true (the TEXT bubble was sent)", async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(logger, "error");
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" }) // text
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "down" }) // flyer attempt 1
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "still down" }); // flyer retry

    const promise = sendTripReply(RID, { trip: "hanukkah", hasPhone: true });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledWith(
      { recipientIgsid: RID },
      "IG flyer image failed after retry — giving up",
    );
    errorSpy.mockRestore();
  });

  it("dry-run mode → no network call for either bubble, resolves true like a real send", async () => {
    env.IG_OUTBOUND_DRYRUN = true;
    await expect(sendTripReply(RID, { trip: "kislev", hasPhone: true })).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendFlyerImage — direct calls", () => {
  afterEach(() => {
    env.IG_OUTBOUND_DRYRUN = false;
  });

  it("kislev → posts the kislev flyer URL", async () => {
    await sendFlyerImage(RID, "kislev");
    expect(callBody(0).message.attachments).toEqual([{ type: "image", payload: { url: KISLEV_FLYER_URL } }]);
  });

  it("hanukkah → posts the hanukkah flyer URL", async () => {
    await sendFlyerImage(RID, "hanukkah");
    expect(callBody(0).message.attachments).toEqual([{ type: "image", payload: { url: HANUKKAH_FLYER_URL } }]);
  });

  it("dry-run mode → no network call, distinctive log", async () => {
    const infoSpy = vi.spyOn(logger, "info");
    env.IG_OUTBOUND_DRYRUN = true;

    await sendFlyerImage(RID, "hanukkah");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      { recipientIgsid: RID, trip: "hanukkah", url: HANUKKAH_FLYER_URL },
      "IG flyer image DRY-RUN (not sent)",
    );
    infoSpy.mockRestore();
  });
});

describe("sendCommentPrivateReply — no flyer", () => {
  it("kind uman → no flyer (Meta allows only one private reply per comment)", async () => {
    await sendCommentPrivateReply("c-1", RID, "uman");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("kind knife → renders IG_MSG_COMMENT_KNIFE verbatim (real newlines, no {form_link})", async () => {
    const outcome = await sendCommentPrivateReply("c-1", RID, "knife");
    expect(outcome).toBe("sent");
    const text = sentText();
    expect(text).toBe(env.IG_MSG_COMMENT_KNIFE.replace(/\\n/g, "\n"));
    expect(text).not.toContain("{form_link}");
    expect(text).not.toContain(FORM_LINK);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("kind knife, dry-run → no fetch, outcome 'dry-run' (the drain drops it instead of retrying forever)", async () => {
    env.IG_OUTBOUND_DRYRUN = true;
    const outcome = await sendCommentPrivateReply("c-1", RID, "knife");
    expect(outcome).toBe("dry-run");
    expect(fetchMock).not.toHaveBeenCalled();
    env.IG_OUTBOUND_DRYRUN = false;
  });
});

function graphFailure(status: number, error?: Record<string, unknown> | string) {
  return {
    ok: false,
    status,
    text: async () =>
      error === undefined ? "" : typeof error === "string" ? error : JSON.stringify({ error }),
  };
}

describe("sendCommentPrivateReply — kind trip", () => {
  afterEach(() => {
    env.IG_OUTBOUND_DRYRUN = false;
  });

  it("hanukkah → sends that trip's PHONE_MISSING template as a comment_id private reply, newlines decoded, no flyer", async () => {
    const outcome = await sendCommentPrivateReply("c-1", RID, "trip", "hanukkah");

    expect(outcome).toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://graph.instagram.com/v23.0/me/messages?access_token=test-token");
    const body = JSON.parse((init as { body: string }).body) as {
      recipient: { comment_id?: string; id?: string };
      message: { text: string; attachments?: unknown };
    };
    expect(body.recipient).toEqual({ comment_id: "c-1" });
    expect(body.message.text).toBe(env.IG_MSG_UMAN_HANUKKAH_PHONE_MISSING.replace(/\\n/g, "\n"));
    expect(body.message.text).toContain("\n");
    expect(body.message.attachments).toBeUndefined();
  });

  it("kislev → the kislev PHONE_MISSING template", async () => {
    await sendCommentPrivateReply("c-1", RID, "trip", "kislev");
    expect(sentText()).toBe(env.IG_MSG_UMAN_KISLEV_PHONE_MISSING.replace(/\\n/g, "\n"));
  });

  it("never the phone-present variant — a commenter has not given a number yet", async () => {
    await sendCommentPrivateReply("c-1", RID, "trip", "kislev");
    expect(sentText()).not.toBe(env.IG_MSG_UMAN_KISLEV_PHONE_PRESENT.replace(/\\n/g, "\n"));
  });

  it("a trip private reply without a trip is a programming error (AppError), not a blank DM", async () => {
    await expect(sendCommentPrivateReply("c-1", RID, "trip")).rejects.toBeInstanceOf(AppError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dry-run → nothing sent, outcome 'dry-run'", async () => {
    env.IG_OUTBOUND_DRYRUN = true;
    await expect(sendCommentPrivateReply("c-1", RID, "trip", "kislev")).resolves.toBe("dry-run");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendCommentPrivateReply — failure classification", () => {
  it("fetch throws (network error) → transient", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(sendCommentPrivateReply("c-1", RID, "trip", "kislev")).resolves.toBe("transient");
  });

  it("reading the error body throws → transient (never throws out)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => {
        throw new Error("stream reset");
      },
    });
    await expect(sendCommentPrivateReply("c-1", RID, "trip", "kislev")).resolves.toBe("transient");
  });

  it("token unavailable → token (pauses the drain), and nothing is fetched", async () => {
    vi.mocked(getCurrentIgToken).mockRejectedValueOnce(new Error("no token file"));
    await expect(sendCommentPrivateReply("c-1", RID, "trip", "kislev")).resolves.toBe("token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["HTTP 500, empty body", "transient", 500, undefined],
    ["HTTP 502, HTML body", "transient", 502, "<html>bad gateway</html>"],
    ["HTTP 503 with a Graph error", "transient", 503, { code: 2, message: "Service temporarily unavailable" }],
    ["code 1 (unknown error) on a 400", "transient", 400, { code: 1, message: "An unknown error occurred" }],
    ["code 2 (service unavailable) on a 400", "transient", 400, { code: 2 }],
    ["HTTP 429, empty body", "rate-limited", 429, undefined],
    ["code 4 (app rate limit)", "rate-limited", 400, { code: 4 }],
    ["code 17 (user rate limit)", "rate-limited", 400, { code: 17 }],
    ["code 32 (page rate limit)", "rate-limited", 400, { code: 32 }],
    ["code 613 (call rate limit)", "rate-limited", 400, { code: 613 }],
    ["code 190 (invalid token)", "token", 400, { code: 190, type: "OAuthException" }],
    ["code 368 (action blocked)", "action-blocked", 400, { code: 368 }],
    ["code 551 (cannot be messaged)", "blocked", 400, { code: 551 }],
    ["code 100 + subcode 2534025 (blocked only on a first attempt)", "maybe-blocked", 400, { code: 100, error_subcode: 2534025 }],
    ["code 10900 (already replied to)", "drop", 400, { code: 10900 }],
    ["subcode 2534022", "drop", 400, { code: 10, error_subcode: 2534022 }],
    ["code 100 + subcode 33 (object gone)", "drop", 400, { code: 100, error_subcode: 33 }],
    ["subcode 2534014", "drop", 400, { code: 100, error_subcode: 2534014 }],
    ["subcode 2018001", "drop", 400, { code: 100, error_subcode: 2018001 }],
    ["code 100 with an unknown subcode", "rejected", 400, { code: 100, error_subcode: 1234567 }],
    ["code 100 with no subcode", "rejected", 400, { code: 100 }],
    ["403 with an HTML body", "rejected", 403, "<html>forbidden</html>"],
    ["404 with an empty body", "rejected", 404, undefined],
    ["400 with a body that is not JSON", "rejected", 400, "{not json"],
    ["400 whose error is a string", "rejected", 400, '{"error":"oops"}'],
    ["400 whose code is a string", "rejected", 400, { code: "551" }],
    ["400 whose body is JSON null", "rejected", 400, "null"],
  ] as const)("%s → %s", async (_label, expected, status, error) => {
    fetchMock.mockResolvedValueOnce(graphFailure(status, error as Record<string, unknown> | string | undefined));
    await expect(sendCommentPrivateReply("c-1", RID, "trip", "kislev")).resolves.toBe(expected);
  });

  it("the same mapping applies to the uman and knife kinds", async () => {
    fetchMock.mockResolvedValueOnce(graphFailure(400, { code: 551 }));
    await expect(sendCommentPrivateReply("c-1", RID, "knife")).resolves.toBe("blocked");
    fetchMock.mockResolvedValueOnce(graphFailure(500));
    await expect(sendCommentPrivateReply("c-1", RID, "uman")).resolves.toBe("transient");
  });

  it("a non-2xx logs status, code, error_subcode, message, error_user_msg, fbtrace_id and the body", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    fetchMock.mockResolvedValueOnce(
      graphFailure(400, {
        message: "(#551) This person isn't available right now.",
        type: "OAuthException",
        code: 551,
        error_subcode: 1545041,
        error_user_msg: "Not available",
        fbtrace_id: "AbCdEf123",
      }),
    );

    await sendCommentPrivateReply("c-9", RID, "trip", "hanukkah");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        commentId: "c-9",
        kind: "trip",
        status: 400,
        code: 551,
        error_subcode: 1545041,
        error_message: "(#551) This person isn't available right now.",
        error_user_msg: "Not available",
        fbtrace_id: "AbCdEf123",
        outcome: "blocked",
        body: expect.stringContaining("1545041"),
      }),
      "IG comment Private-Reply non-2xx",
    );
    warnSpy.mockRestore();
  });

  it("the logged body is capped at 2000 characters", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    fetchMock.mockResolvedValueOnce(graphFailure(500, "x".repeat(5000)));

    await sendCommentPrivateReply("c-9", RID, "trip", "hanukkah");

    const logged = warnSpy.mock.calls.find(([, msg]) => msg === "IG comment Private-Reply non-2xx")?.[0] as {
      body: string;
    };
    expect(logged.body).toHaveLength(2000);
    warnSpy.mockRestore();
  });
});

describe("postCommentReply — the public reply under a comment", () => {
  afterEach(() => {
    env.IG_OUTBOUND_DRYRUN = false;
  });

  it("POSTs { message } as JSON to /{commentId}/replies on graph.instagram.com with the token", async () => {
    const posted = await postCommentReply("c-1", "hello there");

    expect(posted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://graph.instagram.com/v23.0/c-1/replies?access_token=test-token");
    const request = init as { method: string; headers: Record<string, string>; body: string };
    expect(request.method).toBe("POST");
    expect(request.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(request.body)).toEqual({ message: "hello there" });
  });

  it("sends the text untouched (no newline decoding, no template substitution)", async () => {
    await postCommentReply("c-1", "line one {form_link}");
    const init = fetchMock.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(init.body)).toEqual({ message: "line one {form_link}" });
  });

  it("non-2xx → false, and the body is logged", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, text: async () => '{"error":{"code":10}}' });

    await expect(postCommentReply("c-1", "hi")).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: "c-1", status: 400, body: '{"error":{"code":10}}' }),
      "IG comment public reply non-2xx",
    );
    warnSpy.mockRestore();
  });

  it("a fetch error never throws → false", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(postCommentReply("c-1", "hi")).resolves.toBe(false);
  });

  it("reading the error body throwing never throws out either → false", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error("stream reset");
      },
    });
    await expect(postCommentReply("c-1", "hi")).resolves.toBe(false);
  });

  it("token unavailable → false, nothing fetched", async () => {
    vi.mocked(getCurrentIgToken).mockRejectedValueOnce(new Error("no token file"));
    await expect(postCommentReply("c-1", "hi")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dry-run → logs and returns true without a network call", async () => {
    const infoSpy = vi.spyOn(logger, "info");
    env.IG_OUTBOUND_DRYRUN = true;

    await expect(postCommentReply("c-1", "hi")).resolves.toBe(true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: "c-1", text: "hi" }),
      "IG comment public reply DRY-RUN (not posted)",
    );
    infoSpy.mockRestore();
  });
});
