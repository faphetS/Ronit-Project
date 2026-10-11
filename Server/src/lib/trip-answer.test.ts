import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ENV = vi.hoisted(() => ({
  OPENROUTER_API_KEY: "test-key" as string | undefined,
  OPENROUTER_MODEL: "anthropic/claude-haiku-4.5",
  // Written with a literal backslash-n, the way a VPS .env delivers it.
  IG_MSG_UMAN_TRIP_ASK: 'איזה תאריך מסתדר לך?\\n11-15/11/26 ר"ח כסלו ימים רביעי-ראשון\\n6-10/12/26 נסיעת חנוכה ימים ראשון-חמישי',
}));
vi.mock("../config/env.js", () => ({ env: ENV }));
vi.mock("../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "../config/logger.js";
import { judgeTripAnswer } from "./trip-answer.js";

const DECODED_QUESTION =
  'איזה תאריך מסתדר לך?\n11-15/11/26 ר"ח כסלו ימים רביעי-ראשון\n6-10/12/26 נסיעת חנוכה ימים ראשון-חמישי';

const fetchMock = vi.fn();

function llmReply(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

function verdictReply(verdict: string, confidence: number) {
  return llmReply(JSON.stringify({ verdict, confidence }));
}

interface SentRequest {
  url: string;
  init: RequestInit;
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    response_format: { type: string };
    temperature: number;
  };
}

function sentRequest(): SentRequest {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, body: JSON.parse(init.body as string) };
}

function systemPrompt(): string {
  const message = sentRequest().body.messages.find((m) => m.role === "system");
  if (!message) throw new Error("no system message was sent");
  return message.content;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  ENV.OPENROUTER_API_KEY = "test-key";
  ENV.IG_MSG_UMAN_TRIP_ASK =
    'איזה תאריך מסתדר לך?\\n11-15/11/26 ר"ח כסלו ימים רביעי-ראשון\\n6-10/12/26 נסיעת חנוכה ימים ראשון-חמישי';
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("judgeTripAnswer — what the model is shown", () => {
  it("posts one JSON-only, temperature-0 request to OpenRouter with the configured model and key", async () => {
    fetchMock.mockResolvedValueOnce(verdictReply("kislev", 0.95));

    await judgeTripAnswer("רביעי עד ראשון");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, body } = sentRequest();
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
    });
    expect(body.model).toBe("anthropic/claude-haiku-4.5");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.temperature).toBe(0);
  });

  it("the system prompt carries OUR question, with the literal \\n decoded to real newlines", async () => {
    fetchMock.mockResolvedValueOnce(verdictReply("kislev", 0.95));

    await judgeTripAnswer("רביעי עד ראשון");

    expect(systemPrompt()).toContain(DECODED_QUESTION);
    expect(systemPrompt()).not.toContain("\\n");
  });

  it("the question is read at call time, so a changed IG_MSG_UMAN_TRIP_ASK reaches the prompt", async () => {
    ENV.IG_MSG_UMAN_TRIP_ASK = "שאלה חדשה לגמרי";
    fetchMock.mockResolvedValueOnce(verdictReply("kislev", 0.95));

    await judgeTripAnswer("כסלו");

    expect(systemPrompt()).toContain("שאלה חדשה לגמרי");
    expect(systemPrompt()).not.toContain("איזה תאריך מסתדר לך?");
  });

  it("her answer is the user message, verbatim", async () => {
    fetchMock.mockResolvedValueOnce(verdictReply("kislev", 0.95));

    await judgeTripAnswer("לחודש 11 😊");

    const user = sentRequest().body.messages.find((m) => m.role === "user");
    expect(user?.content).toBe("לחודש 11 😊");
  });

  it("the system prompt names both trips and carries every mapping rule", async () => {
    fetchMock.mockResolvedValueOnce(verdictReply("kislev", 0.95));

    await judgeTripAnswer("כסלו");

    const prompt = systemPrompt();
    for (const anchor of [
      // the two options, with dates and weekdays
      "November 2026",
      "December 2026",
      "Wednesday",
      "Thursday",
      // every verdict the model may return
      '"kislev"',
      '"hanukkah"',
      '"both"',
      '"unclear"',
      '"declined"',
      // how a trip can be named: month by number, weekday range, position
      "לחודש 11",
      "לחודש 12",
      "רביעי עד ראשון",
      "ראשון עד חמישי",
      "הראשון",
      "השני",
      "האחרון",
      // the output contract
      "confidence",
    ]) {
      expect(prompt, `prompt should mention ${anchor}`).toContain(anchor);
    }
  });

  // 2026-10-12 live run: "06/10-12/10/26" (6-12 October) came back as hanukkah at 0.95 — the
  // model read "06/10" as Hanukkah's "6-10". The prompt has to spell out day/month order.
  it("the system prompt explains that dates are day/month and only November/December dates are a trip", async () => {
    fetchMock.mockResolvedValueOnce(verdictReply("unclear", 0.95));

    await judgeTripAnswer("06/10-12/10/26");

    const prompt = systemPrompt();
    for (const anchor of [
      // day/month order: the number after the slash is the month
      "day/month",
      "the number AFTER the slash is the month",
      '"06/10" is 6 October',
      '"6-10/12"',
      '"06/10-12/10/26"',
      // only these months belong to a trip, any other month is unclear
      "November (11)",
      "December (12)",
      "אוקטובר",
    ]) {
      expect(prompt, `prompt should mention ${anchor}`).toContain(anchor);
    }
  });

  // 2026-10-12 live run: "חנוכה בכסלו" came back as "both". The Hanukkah trip itself falls in
  // the Hebrew month of Kislev, so naming both words means the Hanukkah trip, not both trips.
  it("the system prompt says Hanukkah-in-Kislev is the Hanukkah trip, and 'both' needs her to want both", async () => {
    fetchMock.mockResolvedValueOnce(verdictReply("hanukkah", 0.95));

    await judgeTripAnswer("חנוכה בכסלו");

    const prompt = systemPrompt();
    for (const anchor of [
      "falls in the Hebrew month of Kislev",
      '"חנוכה בכסלו"',
      "ראש חודש כסלו",
      '"כסלו או חנוכה"',
    ]) {
      expect(prompt, `prompt should mention ${anchor}`).toContain(anchor);
    }
  });

  it("gives the request an 8 s timeout signal", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValueOnce(verdictReply("kislev", 0.95));

    await judgeTripAnswer("כסלו");

    expect(timeoutSpy).toHaveBeenCalledWith(8_000);
    expect(sentRequest().init.signal).toBeInstanceOf(AbortSignal);
    timeoutSpy.mockRestore();
  });
});

describe("judgeTripAnswer — verdicts", () => {
  it.each(["kislev", "hanukkah", "both", "declined"] as const)(
    "%s at high confidence is returned as-is",
    async (verdict) => {
      fetchMock.mockResolvedValueOnce(verdictReply(verdict, 0.92));

      await expect(judgeTripAnswer("תשובה")).resolves.toBe(verdict);
    },
  );

  it("unclear is unclear, however sure the model is", async () => {
    fetchMock.mockResolvedValueOnce(verdictReply("unclear", 0.99));

    await expect(judgeTripAnswer("אומן")).resolves.toBe("unclear");
  });

  it.each(["kislev", "hanukkah", "both", "declined"] as const)(
    "%s at exactly 0.7 is trusted (the gate is >= 0.7)",
    async (verdict) => {
      fetchMock.mockResolvedValueOnce(verdictReply(verdict, 0.7));

      await expect(judgeTripAnswer("תשובה")).resolves.toBe(verdict);
    },
  );

  it.each(["kislev", "hanukkah", "both", "declined"] as const)(
    "%s at 0.69 is demoted to unclear — a guess must not pick her trip",
    async (verdict) => {
      fetchMock.mockResolvedValueOnce(verdictReply(verdict, 0.69));

      await expect(judgeTripAnswer("תשובה")).resolves.toBe("unclear");
    },
  );

  it("strips a ```json fence before parsing", async () => {
    fetchMock.mockResolvedValueOnce(llmReply('```json\n{"verdict":"hanukkah","confidence":0.88}\n```'));

    await expect(judgeTripAnswer("ראשון עד חמישי")).resolves.toBe("hanukkah");
  });

  it("strips a bare ``` fence too", async () => {
    fetchMock.mockResolvedValueOnce(llmReply('```\n{"verdict":"both","confidence":0.9}\n```'));

    await expect(judgeTripAnswer("שתיהן")).resolves.toBe("both");
  });

  it("logs the answer LENGTH, the verdict and the confidence at info — never her text", async () => {
    const answer = "רביעי עד ראשון";
    fetchMock.mockResolvedValueOnce(verdictReply("kislev", 0.9));

    await judgeTripAnswer(answer);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ answerLength: answer.length, verdict: "kislev", confidence: 0.9 }),
      expect.any(String),
    );
    expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain(answer);
  });

  it("a demotion is logged with both the model's verdict and the final one", async () => {
    fetchMock.mockResolvedValueOnce(verdictReply("kislev", 0.5));

    await judgeTripAnswer("אולי");

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: "unclear", modelVerdict: "kislev", confidence: 0.5 }),
      expect.any(String),
    );
  });
});

describe("judgeTripAnswer — never throws, an outage degrades to unclear", () => {
  const badResponses: Array<[string, () => void]> = [
    ["a verdict outside the enum", () => fetchMock.mockResolvedValueOnce(llmReply('{"verdict":"maybe","confidence":0.9}'))],
    ["a missing confidence", () => fetchMock.mockResolvedValueOnce(llmReply('{"verdict":"kislev"}'))],
    ["a confidence above 1", () => fetchMock.mockResolvedValueOnce(llmReply('{"verdict":"kislev","confidence":1.5}'))],
    ["a confidence given as a string", () => fetchMock.mockResolvedValueOnce(llmReply('{"verdict":"kislev","confidence":"0.9"}'))],
    ["text that is not JSON", () => fetchMock.mockResolvedValueOnce(llmReply("sorry, I cannot help with that"))],
    ["a JSON array", () => fetchMock.mockResolvedValueOnce(llmReply('["kislev"]'))],
    ["empty content", () => fetchMock.mockResolvedValueOnce(llmReply(""))],
    ["a response with no choices", () => fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })],
    [
      "a response body that is not JSON",
      () =>
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("Unexpected token < in JSON");
          },
        }),
    ],
    ["a 429 from OpenRouter", () => fetchMock.mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" })],
    ["a 500 from OpenRouter", () => fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" })],
    ["a network failure", () => fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"))],
    [
      "a timeout",
      () =>
        fetchMock.mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    ],
  ];

  it.each(badResponses)("%s → unclear, warned, nothing thrown", async (_name, arrange) => {
    arrange();

    await expect(judgeTripAnswer("רביעי עד ראשון")).resolves.toBe("unclear");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, ""])("a missing OPENROUTER_API_KEY (%j) → unclear without any network call, warned", async (key) => {
    ENV.OPENROUTER_API_KEY = key;

    await expect(judgeTripAnswer("רביעי עד ראשון")).resolves.toBe("unclear");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("the warning never carries her message", async () => {
    const answer = "המספר שלי 0501234567";
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));

    await judgeTripAnswer(answer);

    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(answer);
  });
});
