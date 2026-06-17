import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "./errors.js";

const TranscriptionResultSchema = z.object({
  summary: z.string(),
  customer_name: z.string().nullable(),
  service_interest: z.enum(["uman", "challah"]).nullable(),
  key_points: z.array(z.string()),
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
  "key_points": ["key point 1", "key point 2"],
  "follow_up_needed": true/false
}

Rules:
- summary MUST be in Hebrew
- Do NOT output a full transcript — only the fields above
- Output ONLY the JSON object. No commentary.`;

export async function transcribeAudio(audio: Buffer): Promise<TranscriptionResult> {
  if (!env.OPENROUTER_API_KEY) {
    throw new AppError(503, "OpenRouter not configured — OPENROUTER_API_KEY missing", "OPENROUTER_NOT_CONFIGURED");
  }

  const base64Audio = audio.toString("base64");

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
      response_format: { type: "json_object" },
      temperature: 0,
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
