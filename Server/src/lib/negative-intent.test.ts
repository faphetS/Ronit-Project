import { describe, it, expect, vi, beforeEach } from "vitest";

const ENV = vi.hoisted(() => ({
  OPENROUTER_API_KEY: "test-key",
  OPENROUTER_MODEL: "anthropic/claude-haiku-4.5",
}));
vi.mock("../config/env.js", () => ({ env: ENV }));
vi.mock("../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { classifyNegativeIntent } from "./negative-intent.js";

const fetchMock = vi.fn();

function llmReply(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ENV.OPENROUTER_API_KEY = "test-key";
  vi.stubGlobal("fetch", fetchMock);
});

describe("classifyNegativeIntent — keyword fast-path (no network)", () => {
  it.each([
    "לא רלוונטי בשבילי",
    "אני כבר לא מעוניינת",
    "תורידו אותי מהרשימה",
    "אל תשלחי לי יותר",
    "לא, תודה",
    "stop",
    "remove me from this",
    "not interested thanks",
  ])("matches opt-out phrase: %s", async (text) => {
    const r = await classifyNegativeIntent(text);
    expect(r).toEqual({ notInterested: true, via: "keyword", confidence: 0.99 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("classifyNegativeIntent — LLM fallback", () => {
  it("ambiguous decline with no keyword → LLM says notInterested", async () => {
    fetchMock.mockResolvedValueOnce(llmReply('{"notInterested":true,"confidence":0.82}'));
    const r = await classifyNegativeIntent("כבר סידרתי הכול עם מישהו אחר");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ notInterested: true, via: "llm", confidence: 0.82 });
  });

  it("neutral question → LLM says still interested", async () => {
    fetchMock.mockResolvedValueOnce(llmReply('{"notInterested":false,"confidence":0.1}'));
    const r = await classifyNegativeIntent("כמה זה עולה?");
    expect(r.notInterested).toBe(false);
    expect(r.via).toBe("llm");
  });

  it("strips ```json fences before parsing", async () => {
    fetchMock.mockResolvedValueOnce(llmReply('```json\n{"notInterested":true,"confidence":0.7}\n```'));
    const r = await classifyNegativeIntent("עזבי אותי בבקשה");
    expect(r.notInterested).toBe(true);
  });

  it("an engaged 'לא, תודה רבה על המידע! ...' opener does NOT keyword-match → defers to LLM", async () => {
    fetchMock.mockResolvedValueOnce(llmReply('{"notInterested":false,"confidence":0.05}'));
    const r = await classifyNegativeIntent("לא, תודה רבה על המידע! מתי הטיסה הבאה?");
    expect(fetchMock).toHaveBeenCalledTimes(1); // fell through to the LLM, not the fast-path
    expect(r.via).toBe("llm");
    expect(r.notInterested).toBe(false);
  });

  it("embedded 'stop' (e.g. 'non-stop flight') does NOT keyword-match → defers to LLM", async () => {
    fetchMock.mockResolvedValueOnce(llmReply('{"notInterested":false,"confidence":0.02}'));
    const r = await classifyNegativeIntent("יש טיסת non-stop לאומן?");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.notInterested).toBe(false);
  });

  it("a LONG message that merely contains an opt-out phrase is not auto-trusted → LLM decides", async () => {
    fetchMock.mockResolvedValueOnce(llmReply('{"notInterested":false,"confidence":0.1}'));
    // contains "לא מעוניינת" but in a question — an interested lead
    const r = await classifyNegativeIntent("למה אתם חושבים שאני לא מעוניינת? אני כן רוצה לטוס לאומן");
    expect(fetchMock).toHaveBeenCalledTimes(1); // > 40 chars → keyword not trusted, LLM consulted
    expect(r.via).toBe("llm");
    expect(r.notInterested).toBe(false);
  });
});

describe("classifyNegativeIntent — fail-safe (never move on a failure)", () => {
  it("empty text → false, no network", async () => {
    const r = await classifyNegativeIntent("   ");
    expect(r).toEqual({ notInterested: false, via: "none", confidence: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no API key → false, no network", async () => {
    ENV.OPENROUTER_API_KEY = "";
    const r = await classifyNegativeIntent("משהו עמום");
    expect(r.notInterested).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("LLM non-2xx → false", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const r = await classifyNegativeIntent("משהו עמום");
    expect(r.notInterested).toBe(false);
  });

  it("fetch throws → false", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"));
    const r = await classifyNegativeIntent("משהו עמום");
    expect(r.notInterested).toBe(false);
  });

  it("LLM returns non-JSON → false (caught)", async () => {
    fetchMock.mockResolvedValueOnce(llmReply("not json at all"));
    const r = await classifyNegativeIntent("משהו עמום");
    expect(r.notInterested).toBe(false);
  });
});
