import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the token source so no real IG token is touched and the send proceeds.
vi.mock("./meta.token.service.js", () => ({
  getCurrentIgToken: vi.fn().mockResolvedValue("test-token"),
}));

import {
  pickReplyTemplate,
  sendReplyDM,
  sendServiceQuestion,
} from "./meta.outbound.service.js";
import { env } from "../../config/env.js";

const RID = "IGSID_123";
const FORM_LINK = `https://www.orhazadik.online/?ig_id=${encodeURIComponent(RID)}`;

// Mirror the transform applied inside the outbound sender.
function render(template: string): string {
  return template.replace(/\\n/g, "\n").replaceAll("{form_link}", FORM_LINK);
}

let fetchMock: ReturnType<typeof vi.fn>;

function sentText(): string {
  const init = fetchMock.mock.calls.at(-1)?.[1] as { body: string };
  return (JSON.parse(init.body) as { message: { text: string } }).message.text;
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
  it("uman + phone, first contact → PHONE_PRESENT", () => {
    expect(pickReplyTemplate({ service: "uman", hasPhone: true, answered: false }).template)
      .toBe(env.IG_MSG_PHONE_PRESENT);
  });
  it("uman + no phone, first contact → PHONE_MISSING", () => {
    expect(pickReplyTemplate({ service: "uman", hasPhone: false, answered: false }).template)
      .toBe(env.IG_MSG_PHONE_MISSING);
  });
  it("uman + no phone, after question → reuses PHONE_MISSING (identical)", () => {
    expect(pickReplyTemplate({ service: "uman", hasPhone: false, answered: true }).template)
      .toBe(env.IG_MSG_PHONE_MISSING);
  });
  it("uman + phone, after question → UMAN_ANSWER_PHONE_PRESENT (distinct)", () => {
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

  it("uman first-contact: carries the personalized link + 'רבינו'", async () => {
    await sendReplyDM(RID, { service: "uman", hasPhone: false, answered: false });
    const text = sentText();
    expect(text).toBe(render(env.IG_MSG_PHONE_MISSING));
    expect(text).toContain("רבינו");
    expect(text).toContain(FORM_LINK);
  });

  it("uman + phone after question → distinct answer copy, with link", async () => {
    await sendReplyDM(RID, { service: "uman", hasPhone: true, answered: true });
    const text = sentText();
    expect(text).toBe(render(env.IG_MSG_UMAN_ANSWER_PHONE_PRESENT));
    expect(text).toContain(FORM_LINK);
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
});
