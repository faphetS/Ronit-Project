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
  sendFlyerImage,
  sendTripAsk,
  pickTripTemplate,
  sendTripReply,
} from "./meta.outbound.service.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

const RID = "IGSID_123";
const FORM_LINK = `https://www.orhazadik.online/?ig_id=${encodeURIComponent(RID)}`;
const KISLEV_FLYER_URL = "https://api.ronitbarash.site/static/uman-kislev.jpeg";
const HANUKKAH_FLYER_URL = "https://api.ronitbarash.site/static/uman-hanukkah.jpeg";

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

  it("text send failure → flyer never attempted", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" });
    await sendTripReply(RID, { trip: "kislev", hasPhone: true });
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
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("flyer fails twice → logged at error level, no throw, flow completes", async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(logger, "error");
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" }) // text
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "down" }) // flyer attempt 1
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "still down" }); // flyer retry

    const promise = sendTripReply(RID, { trip: "hanukkah", hasPhone: true });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledWith(
      { recipientIgsid: RID },
      "IG flyer image failed after retry — giving up",
    );
    errorSpy.mockRestore();
  });

  it("dry-run mode → no network call for either bubble", async () => {
    env.IG_OUTBOUND_DRYRUN = true;
    await sendTripReply(RID, { trip: "kislev", hasPhone: true });
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
    await sendCommentPrivateReply("c-1", RID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("kind knife → renders IG_MSG_COMMENT_KNIFE verbatim (real newlines, no {form_link})", async () => {
    const sent = await sendCommentPrivateReply("c-1", RID, "knife");
    expect(sent).toBe(true);
    const text = sentText();
    expect(text).toBe(env.IG_MSG_COMMENT_KNIFE.replace(/\\n/g, "\n"));
    expect(text).not.toContain("{form_link}");
    expect(text).not.toContain(FORM_LINK);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("kind knife, dry-run → no fetch, returns false", async () => {
    env.IG_OUTBOUND_DRYRUN = true;
    const sent = await sendCommentPrivateReply("c-1", RID, "knife");
    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    env.IG_OUTBOUND_DRYRUN = false;
  });
});
