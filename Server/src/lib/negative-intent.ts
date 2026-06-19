import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

/**
 * Flexible "is this lead opting out?" detector for inbound WhatsApp. Deliberately
 * SEPARATE from the lead classifier in classify.ts: that one decides *interest in
 * a service*; this one decides *active disengagement* ("not relevant", "stop",
 * "remove me", "no longer interested"). A hit moves the lead to the not-relevant
 * group, so it is tuned for PRECISION — when unsure, it returns notInterested:false.
 *
 * Two stages: an obvious-phrase fast-path (free, instant, no network) and an LLM
 * fallback for paraphrases. Non-throwing and fail-safe — any error/misconfig
 * yields notInterested:false so a lead is never moved on a failure.
 */
export interface NegativeIntentResult {
  notInterested: boolean;
  via: "keyword" | "llm" | "none";
  confidence: number;
}

const SAFE_FALSE: NegativeIntentResult = { notInterested: false, via: "none", confidence: 0 };

// High-precision opt-out phrases (Hebrew + English). Kept tight on purpose: a
// false positive moves an interested lead out of the funnel, so anything
// ambiguous is left to the LLM rather than matched here.
const OPT_OUT_PATTERNS: RegExp[] = [
  /לא\s*רלוונטי/, // "not relevant"
  /לא\s*מעוניינ/, // "not interested" (מעוניין / מעוניינת)
  /לא\s*מענייני/, // spelling variant
  /כבר\s*לא\s*מעוניינ/, // "no longer interested"
  /תוריד[יו]?\s*אותי/, // "remove me"
  /להסיר\s*אותי/,
  /אל\s*תשלח[יו]?\s*לי/, // "don't message me"
  /תפסיק[יו]?\s*לשלוח/, // "stop sending"
  // "no thanks" — ANCHORED to a standalone message only. An embedded courtesy like
  // "לא, תודה רבה על המידע! מתי הטיסה?" is an engaged reply, not an opt-out, and
  // must fall through to the (context-aware) LLM rather than match here.
  /^לא,?\s*תודה\s*[.!]?$/, // bare "no thanks" / "לא, תודה."
  /^\s*stop\s*$/i, // standalone only — avoids "non-stop flight", "don't stop sending"
  /\bunsubscribe\b/i,
  /\bremove\s*me\b/i,
  /\bnot\s*interested\b/i,
];

const SYSTEM_PROMPT = `You decide whether a WhatsApp message from a lead means they are NO LONGER INTERESTED in Ronit Barash's paid services (Uman pilgrimage flights / challah-separation events) and want to stop being contacted.

Return STRICT JSON, nothing else:
{ "notInterested": boolean, "confidence": number }

Set notInterested=true ONLY when the message clearly signals disengagement: "not relevant", "not interested", "no longer interested", "stop messaging me", "remove me", "no thanks", "I changed my mind", "מצאתי פתרון אחר", "כבר סידרתי", a firm refusal/decline.

Set notInterested=false for anything else — a greeting, a question (price, dates, logistics), a request for info, "maybe later", hesitation, a neutral or positive reply, an off-topic message, or anything unclear. Be conservative: when in doubt, false. Output ONLY the JSON object, no markdown, no commentary.`;

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

// A keyword hit auto-trusts ONLY a short, standalone-ish message. A longer message
// that merely CONTAINS an opt-out phrase (e.g. "why do you think I'm not interested?
// I do want to fly") is sent to the LLM for a context-aware decision instead.
const KEYWORD_TRUST_MAX_LEN = 40;

export async function classifyNegativeIntent(text: string): Promise<NegativeIntentResult> {
  const trimmed = text.trim();
  if (!trimmed) return SAFE_FALSE;

  const keywordHit = OPT_OUT_PATTERNS.some((re) => re.test(trimmed));
  if (keywordHit && trimmed.length <= KEYWORD_TRUST_MAX_LEN) {
    return { notInterested: true, via: "keyword", confidence: 0.99 };
  }

  // No LLM available: a short keyword opt-out already returned above; for anything
  // else we don't move (fail-safe — the reply has already halted the funnel anyway).
  if (!env.OPENROUTER_API_KEY) return SAFE_FALSE;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmed },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.warn(
        { status: res.status },
        "Negative-intent LLM non-2xx — defaulting notInterested=false",
      );
      return SAFE_FALSE;
    }

    const json = (await res.json()) as OpenRouterResponse;
    const raw = json.choices?.[0]?.message?.content?.trim();
    if (!raw) return SAFE_FALSE;

    const cleaned = raw
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned) as { notInterested?: unknown; confidence?: unknown };
    const notInterested = parsed.notInterested === true;
    const confidence =
      typeof parsed.confidence === "number" ? parsed.confidence : notInterested ? 0.7 : 0;

    return { notInterested, via: "llm", confidence };
  } catch (err) {
    logger.warn({ err }, "Negative-intent classifier failed — defaulting notInterested=false");
    return SAFE_FALSE;
  }
}
