import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the token source so no real IG token is touched and the send proceeds.
vi.mock("./meta.token.service.js", () => ({
  getCurrentIgToken: vi.fn().mockResolvedValue("test-token"),
}));

import { sendFirstContactDM } from "./meta.outbound.service.js";
import { env } from "../../config/env.js";

const RID = "IGSID_123";
const FORM_LINK = `https://www.orhazadik.online/?ig_id=${encodeURIComponent(RID)}`;

// Mirror the transform applied inside sendFirstContactDM.
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

describe("sendFirstContactDM — 4-scenario template selection", () => {
  it("service named + phone present → neutral SERVICE_PHONE_PRESENT, no link, no Uman", async () => {
    await sendFirstContactDM(RID, true, true);
    const text = sentText();
    expect(text).toBe(render(env.IG_MSG_SERVICE_PHONE_PRESENT));
    expect(text).toContain("הפרטים המלאים");
    expect(text).not.toContain("מספר הטלפון"); // doesn't ask for a phone
    expect(text).not.toContain("רבינו");
    expect(text).not.toContain(FORM_LINK);
  });

  it("service named + phone missing → neutral SERVICE_PHONE_MISSING, asks for phone, no link", async () => {
    await sendFirstContactDM(RID, false, true);
    const text = sentText();
    expect(text).toBe(render(env.IG_MSG_SERVICE_PHONE_MISSING));
    expect(text).toContain("מספר הטלפון"); // asks for the phone
    expect(text).not.toContain("רבינו");
    expect(text).not.toContain(FORM_LINK);
  });

  it("no service + phone present → Uman teaser PHONE_PRESENT, carries personalized link", async () => {
    await sendFirstContactDM(RID, true, false);
    const text = sentText();
    expect(text).toBe(render(env.IG_MSG_PHONE_PRESENT));
    expect(text).toContain("רבינו");
    expect(text).toContain(FORM_LINK);
  });

  it("no service + phone missing → Uman teaser PHONE_MISSING, asks for phone, carries link", async () => {
    await sendFirstContactDM(RID, false, false);
    const text = sentText();
    expect(text).toBe(render(env.IG_MSG_PHONE_MISSING));
    expect(text).toContain("מספר הנייד"); // asks for the phone
    expect(text).toContain("רבינו");
    expect(text).toContain(FORM_LINK);
  });

  it("posts to the IG Graph messages endpoint addressed to the recipient", async () => {
    await sendFirstContactDM(RID, true, true);
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(String(url)).toContain("graph.instagram.com");
    expect(String(url)).toContain("/me/messages");
    const body = JSON.parse((init as { body: string }).body) as {
      recipient: { id: string };
    };
    expect(body.recipient.id).toBe(RID);
  });
});
