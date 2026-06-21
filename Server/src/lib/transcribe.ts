import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "./errors.js";

const TranscriptionResultSchema = z.object({
  summary: z.string(),
  customer_name: z.string().nullable(),
  service_interest: z.enum(["uman", "challah"]).nullable(),
  follow_up_needed: z.boolean(),
});

export type TranscriptionResult = z.infer<typeof TranscriptionResultSchema>;

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const SYSTEM_PROMPT = `You are a call analysis assistant for an Israeli travel/events business.
You receive an audio recording of a sales call (usually in Hebrew, sometimes mixed Hebrew/English).

Listen to the full conversation, then:
1. Write a short Hebrew summary suitable for a CRM note (2-3 sentences max)
2. Extract structured data

The business offers two services:
- uman: Flights and trips to Uman (Rabbi Nachman pilgrimage)
- challah: Challah separation events (הפרשות חלה)

Return STRICT JSON:
{
  "summary": "תקציר קצר בעברית של השיחה",
  "customer_name": "customer's name if mentioned, or null",
  "service_interest": "uman" | "challah" | null,
  "follow_up_needed": true/false
}

Rules:
- summary MUST be in Hebrew, 2-3 sentences max
- Do NOT output a full transcript — only the fields above
- Output ONLY the JSON object. No commentary.`;

const MAX_TRANSCRIBE_ATTEMPTS = 3;

// Strict structured output (mirrors TranscriptionResultSchema). json_schema makes
// the provider ENFORCE the shape; the previous json_object mode was "soft" and
// let Gemini return malformed/partial JSON intermittently (~1-in-5). Verified
// 0/5 failures vs json_object's 1/5 on a real recording that used to fail.
const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "call_transcription",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        customer_name: { type: ["string", "null"] },
        service_interest: { type: ["string", "null"], enum: ["uman", "challah", null] },
        follow_up_needed: { type: "boolean" },
      },
      required: ["summary", "customer_name", "service_interest", "follow_up_needed"],
    },
  },
};

export async function transcribeAudio(audio: Buffer): Promise<TranscriptionResult> {
  if (!env.OPENROUTER_API_KEY) {
    throw new AppError(503, "OpenRouter not configured — OPENROUTER_API_KEY missing", "OPENROUTER_NOT_CONFIGURED");
  }

  const base64Audio = audio.toString("base64");
  let lastError: unknown;

  // Final safety net under structured outputs + healing: retry on any residual
  // bad response. Cheap insurance, and the only protection in one-shot/backfill.
  for (let attempt = 1; attempt <= MAX_TRANSCRIBE_ATTEMPTS; attempt++) {
    try {
      return await requestTranscription(base64Audio);
    } catch (err) {
      lastError = err;
      logger.warn(
        { attempt, code: (err as AppError).code, msg: (err as Error).message },
        "Transcription attempt failed — retrying",
      );
    }
  }
  throw lastError;
}

async function requestTranscription(base64Audio: string): Promise<TranscriptionResult> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENROUTER_AUDIO_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: { data: base64Audio, format: "mp3" },
            },
          ],
        },
      ],
      response_format: RESPONSE_FORMAT,
      // Only route to providers that actually honor json_schema (all Gemini 2.5
      // Flash providers do), so none silently ignores it and returns prose.
      provider: { require_parameters: true },
      // Auto-repair any residual malformed JSON (stray fences, trailing commas).
      plugins: [{ id: "response-healing" }],
      // Dropping the unbounded key_points array kills the greedy repetition loop
      // that used to run away until it blew max_tokens and dropped the trailing
      // required field (follow_up_needed) → "malformed schema". A small (non-zero)
      // temperature adds a decode escape-hatch and makes the 3× retry actually
      // vary instead of repeating the identical failure.
      // NOTE: do NOT add frequency_penalty — Gemini providers don't advertise it,
      // so with provider.require_parameters it leaves zero endpoints → 404.
      temperature: 0.2,
      // A 2-3 sentence Hebrew summary is ~150 tokens; bound the output so any
      // degenerate response is capped (and cheaper) rather than running to 16k.
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(502, `OpenRouter ${res.status}: ${body.slice(0, 300)}`, "OPENROUTER_HTTP_ERROR");
  }

  const json = (await res.json()) as OpenRouterResponse;
  const rawResponse = json.choices?.[0]?.message?.content;

  if (!rawResponse) {
    throw new AppError(502, "OpenRouter returned empty content", "OPENROUTER_EMPTY");
  }

  const cleaned = rawResponse
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    logger.warn({ rawResponse: rawResponse.slice(0, 200) }, "Transcriber returned non-JSON");
    throw new AppError(502, "Transcriber returned non-JSON response", "TRANSCRIBER_INVALID_JSON");
  }

  const validation = TranscriptionResultSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn({ parsed, issues: validation.error.issues }, "Transcriber returned malformed schema");
    throw new AppError(502, "Transcriber returned malformed schema", "TRANSCRIBER_INVALID_SCHEMA");
  }

  logger.info(
    {
      summaryLen: validation.data.summary.length,
      service: validation.data.service_interest,
      followUp: validation.data.follow_up_needed,
    },
    "Audio transcription complete",
  );

  return validation.data;
}
