import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "./errors.js";

export type TripVerdict = "kislev" | "hanukkah" | "both" | "unclear" | "declined";

const JudgmentSchema = z.object({
  verdict: z.enum(["kislev", "hanukkah", "both", "unclear", "declined"]),
  confidence: z.number().min(0).max(1),
});

type Judgment = z.infer<typeof JudgmentSchema>;

// Below this the model is guessing: "unclear" costs her one more question, a wrong guess
// sends her the wrong trip's details.
const MIN_CONFIDENCE = 0.7;

// The judge runs inside the Meta webhook, which is awaited before the 200 goes back, so a
// hung OpenRouter must degrade to a re-ask rather than hold the webhook open.
const TIMEOUT_MS = 8_000;

function buildSystemPrompt(): string {
  // A .env line cannot hold a real newline, so the VPS stores the template with a literal
  // "\n"; the outbound sender decodes it the same way, so this is the text she actually saw.
  const question = env.IG_MSG_UMAN_TRIP_ASK.replace(/\\n/g, "\n");

  return `You judge a lead's reply to a question that Ronit Barash's Instagram assistant just sent her. Ronit is an Israeli religious-content influencer who sells flights to Uman. Two trips are on sale and the question asks which one the lead wants.

The exact question we sent her:
"""
${question}
"""

The two options, in the order the question lists them:
1. "kislev"   — the Rosh Chodesh Kislev trip (ר"ח כסלו), 11–15 November 2026, Wednesday to Sunday. Listed FIRST.
2. "hanukkah" — the Hanukkah trip (חנוכה), 6–10 December 2026, Sunday to Thursday. Listed SECOND, the last one.

The user message is her reply, verbatim. Return STRICT JSON with exactly this shape and nothing else:

{"verdict": "kislev" | "hanukkah" | "both" | "unclear" | "declined", "confidence": number}

How to decide:
- "kislev" or "hanukkah": her reply points at that trip in any way. By name (כסלו, ר"ח כסלו / חנוכה); by its dates; by its month, as a name or a number (נובמבר, November, "לחודש 11" = kislev; דצמבר, December, "לחודש 12" = hanukkah); by its weekday range (רביעי עד ראשון = Wednesday to Sunday = kislev; ראשון עד חמישי = Sunday to Thursday = hanukkah); or by its position in the question (הראשון / the first = kislev; השני / האחרון / the second / the last = hanukkah).
- Dates are written Israeli-style, day/month: the number AFTER the slash is the month. "06/10" is 6 October (it is not "6-10"), "6-10/12" is the 6th to the 10th of December, "11-15/11" is the 11th to the 15th of November, and "06/10-12/10/26" is 6 to 12 October 2026.
- Only dates in November (11) belong to "kislev" and only dates in December (12) belong to "hanukkah". A date or date range in any other month, such as "06/10-12/10" or "אוקטובר", is "unclear".
- The Hanukkah trip itself falls in the Hebrew month of Kislev, so a reply that names Hanukkah together with Kislev, such as "חנוכה בכסלו", means "hanukkah". Only Kislev on its own, or Rosh Chodesh Kislev (ר"ח כסלו / ראש חודש כסלו), means "kislev". A reply offering either trip, such as "כסלו או חנוכה", is "both".
- "both": she wants both trips, or she cannot decide between the two.
- "declined": a clear no — not interested, neither trip, stop writing to me.
- "unclear": anything else. Another month (for example October), a question about something else (price, flights, hotel), gibberish, a greeting or an emoji, a reply that only restates "Uman" or says "yes". A weekday that fits both trips on its own is also "unclear": a lone "ראשון" is the last day of the first trip and the first day of the second.
- When her reply could reasonably mean something else, choose "unclear". A wrong guess sends her the wrong trip; "unclear" only asks her again.

"confidence" is 0 to 1: how sure you are that the verdict is what she meant. Use a value below 0.7 when you are guessing.
Output ONLY the JSON object. No markdown fences, no commentary.`;
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

async function askModel(answer: string): Promise<Judgment> {
  if (!env.OPENROUTER_API_KEY) {
    throw new AppError(
      503,
      "Trip-answer judge not configured — OPENROUTER_API_KEY missing",
      "TRIP_JUDGE_NOT_CONFIGURED",
    );
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: answer },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(502, `OpenRouter ${res.status}: ${body.slice(0, 300)}`, "TRIP_JUDGE_HTTP_ERROR");
  }

  const json = (await res.json()) as OpenRouterResponse;
  const rawResponse = json.choices?.[0]?.message?.content;
  if (!rawResponse) {
    throw new AppError(502, "OpenRouter returned empty content", "TRIP_JUDGE_EMPTY");
  }

  // Some models wrap JSON in ```json ... ``` fences even when response_format is set.
  const cleaned = rawResponse
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AppError(
      502,
      `Trip-answer judge returned non-JSON: ${rawResponse.slice(0, 200)}`,
      "TRIP_JUDGE_INVALID_JSON",
    );
  }

  const validation = JudgmentSchema.safeParse(parsed);
  if (!validation.success) {
    throw new AppError(
      502,
      `Trip-answer judge response did not match the schema: ${rawResponse.slice(0, 200)}`,
      "TRIP_JUDGE_SCHEMA_MISMATCH",
    );
  }
  return validation.data;
}

/**
 * Which trip did she pick? Unlike the lead classifier, the model here is shown the exact
 * question we sent, so "רביעי עד ראשון" or "לחודש 11" read as the Kislev trip instead of as
 * a not-interested message.
 *
 * NEVER throws. A missing key, a non-2xx, a timeout or an unreadable answer all come back
 * as "unclear" — the caller re-asks, so an AI outage can never turn into silence.
 */
export async function judgeTripAnswer(answer: string): Promise<TripVerdict> {
  try {
    const judgment = await askModel(answer);
    const verdict: TripVerdict =
      judgment.verdict !== "unclear" && judgment.confidence < MIN_CONFIDENCE ? "unclear" : judgment.verdict;

    logger.info(
      { answerLength: answer.length, verdict, modelVerdict: judgment.verdict, confidence: judgment.confidence },
      "Trip answer judged",
    );
    return verdict;
  } catch (err) {
    logger.warn(
      { err, answerLength: answer.length },
      "Trip-answer judge failed — treating as unclear so she is re-asked",
    );
    return "unclear";
  }
}
