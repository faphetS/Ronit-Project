import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "./errors.js";

const TranscriptionResultSchema = z.object({
  transcript: z.string(),
  summary: z.string(),
  customer_name: z.string().nullable(),
  service_interest: z.enum(["uman", "poland", "challah"]).nullable(),
  key_points: z.array(z.string()),
  follow_up_needed: z.boolean(),
  event_date: z.string().nullable(),
});

export type TranscriptionResult = z.infer<typeof TranscriptionResultSchema>;

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const SYSTEM_PROMPT = `You are a call transcription and analysis assistant for an Israeli travel/events business.
You receive an audio recording of a sales call (usually in Hebrew, sometimes mixed Hebrew/English).

Your tasks:
1. Transcribe the full conversation
2. Write a short Hebrew summary suitable for a CRM note (2-3 sentences max)
3. Extract structured data

The business offers three services:
- uman: Flights and trips to Uman (Rabbi Nachman pilgrimage)
- poland: Flights and trips to Poland
- challah: Challah separation events (הפרשות חלה)

Return STRICT JSON:
{
  "transcript": "full transcription of the conversation",
  "summary": "תקציר קצר בעברית של השיחה",
  "customer_name": "customer's name if mentioned, or null",
  "service_interest": "uman" | "poland" | "challah" | null,
  "key_points": ["key point 1", "key point 2"],
  "follow_up_needed": true/false,
  "event_date": "YYYY-MM-DD" | null
}

Rules:
- summary MUST be in Hebrew
- transcript should preserve the original language
- event_date: if a specific trip/event date is mentioned (e.g. "בספטמבר", "ב-15 לאוגוסט", "בראש השנה"), convert to ISO date (YYYY-MM-DD). Use the 1st of the month if only a month is mentioned. Use the current or next occurrence for Hebrew holidays. null if no date mentioned.
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
      transcriptLen: validation.data.transcript.length,
      summaryLen: validation.data.summary.length,
      service: validation.data.service_interest,
      followUp: validation.data.follow_up_needed,
    },
    "Audio transcription complete",
  );

  return validation.data;
}
