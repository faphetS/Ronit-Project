import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "./errors.js";

const ClassificationSchema = z.object({
  interested: z.boolean(),
  service: z.enum(["uman", "poland", "challah"]).nullable(),
  extractedName: z.string().nullable(),
  extractedPhone: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type Classification = z.infer<typeof ClassificationSchema> & {
  rawResponse: string;
};

const SYSTEM_PROMPT = `You are a lead-classification assistant for Ronit Barash, an Israeli religious-content influencer who sells three paid services:

1. "uman"    — flights and packages for pilgrimage to Uman (אומן), usually around Rosh Hashanah. Hebrew keywords: אומן, טיסות לאומן, ראש השנה באומן.
2. "poland"  — flights and tours for pilgrimage to Poland (פולין / טיסות לפולין). Hebrew keywords: פולין, טיסות לפולין.
3. "challah" — in-person group events for the mitzvah of separating challah (הפרשת חלה). Hebrew keywords: חלה, הפרשת חלה, הפרשות חלה.

You receive a Hebrew or English message from a potential lead. Return STRICT JSON with exactly this shape and nothing else:

{
  "interested": boolean,
  "service": "uman" | "poland" | "challah" | null,
  "extractedName": string | null,
  "extractedPhone": string | null,
  "confidence": number
}

Rules:
- Output ONLY the JSON object. No markdown fences, no commentary, no keys outside the schema.
- interested=true ONLY if the message shows genuine interest in one of the three services above, asks about trips/flights/events Ronit offers, or uses travel/service keywords (טיסה, לטוס, טיסות, flight, trip, חלה, אומן, פולין).
- Plain greetings with no mention of services ("היי", "שלום", "hi", "how are you", "מה שלומך") → interested=false.
- Small talk, compliments about content, unrelated questions, spam, insults → interested=false.
- If the message mentions flying/travel/trip (טיסה, לטוס, טיול, flight, trip) but doesn't specify a destination → interested=true, service=null (likely one of the flight services).
- Hebrew service keywords: "אומן" → uman; "פולין" → poland; "חלה" / "הפרשת חלה" → challah.
- confidence: 0..1 — your confidence in the classification.`;

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function classifyLead(input: {
  messageText: string;
  senderUsername?: string;
}): Promise<Classification> {
  if (!env.OPENROUTER_API_KEY) {
    throw new AppError(
      503,
      "Classifier not configured — OPENROUTER_API_KEY missing",
      "CLASSIFIER_NOT_CONFIGURED",
    );
  }

  const userContent = input.senderUsername
    ? `Sender IG username: ${input.senderUsername}\nMessage:\n${input.messageText}`
    : input.messageText;

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
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      502,
      `OpenRouter ${res.status}: ${body.slice(0, 300)}`,
      "OPENROUTER_HTTP_ERROR",
    );
  }

  const json = (await res.json()) as OpenRouterResponse;
  const rawResponse = json.choices?.[0]?.message?.content;
  if (!rawResponse) {
    throw new AppError(502, "OpenRouter returned empty content", "OPENROUTER_EMPTY");
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
      `Classifier returned non-JSON: ${rawResponse.slice(0, 200)}`,
      "CLASSIFIER_INVALID_JSON",
    );
  }

  const validation = ClassificationSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn(
      { parsed, issues: validation.error.issues },
      "Classifier returned malformed schema",
    );
    throw new AppError(
      502,
      "Classifier response did not match expected schema",
      "CLASSIFIER_SCHEMA_MISMATCH",
    );
  }

  return { ...validation.data, rawResponse };
}
