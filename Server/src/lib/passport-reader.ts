import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "./errors.js";

/** What the vision model read off a photo. Dates are YYYY-MM-DD; anything unreadable is null. */
export const PassportReadingSchema = z.object({
  isPassport: z.boolean(),
  confidence: z.number().min(0).max(1),
  documentNumber: z.string().nullable(),
  surnameLatin: z.string().nullable(),
  givenNamesLatin: z.string().nullable(),
  surnameHebrew: z.string().nullable(),
  givenNamesHebrew: z.string().nullable(),
  nationality: z.string().nullable(),
  sex: z.enum(["F", "M", "X"]).nullable(),
  birthDate: z.string().nullable(),
  issueDate: z.string().nullable(),
  expiryDate: z.string().nullable(),
  mrzLine1: z.string().nullable(),
  mrzLine2: z.string().nullable(),
});

export type PassportReading = z.infer<typeof PassportReadingSchema>;

const SYSTEM_PROMPT = `You read photos that customers of an Israeli travel business send on WhatsApp. Most are passport data pages (the page with the photo), often Israeli passports, which print names in Hebrew and in English.

Return STRICT JSON with exactly this shape and nothing else:

{
  "isPassport": boolean,
  "confidence": number,
  "documentNumber": string | null,
  "surnameLatin": string | null,
  "givenNamesLatin": string | null,
  "surnameHebrew": string | null,
  "givenNamesHebrew": string | null,
  "nationality": string | null,
  "sex": "F" | "M" | "X" | null,
  "birthDate": string | null,
  "issueDate": string | null,
  "expiryDate": string | null,
  "mrzLine1": string | null,
  "mrzLine2": string | null
}

- isPassport: true only for a passport's data page. An ID card (תעודת זהות), a visa, a ticket, a screenshot or anything else is false.
- Copy what is printed; never guess. A field you cannot read clearly is null.
- Dates as YYYY-MM-DD. Nationality as the 3-letter code printed on the page (ISR, USA, FRA...).
- Names: surnameLatin/givenNamesLatin from the English fields, surnameHebrew/givenNamesHebrew from the Hebrew fields (null when the passport has none).
- mrzLine1 and mrzLine2: the two machine-readable lines at the bottom, exactly as printed, 44 characters each, with every '<'. null if they are not fully visible.
- confidence: 0..1, how sure you are of the whole reading.`;

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/** Reads a passport photo with the OpenRouter vision model (OPENROUTER_PASSPORT_MODEL). */
export async function readPassportPhoto(image: Buffer, mimeType: string): Promise<PassportReading> {
  if (!env.OPENROUTER_API_KEY) {
    throw new AppError(503, "Passport reader not configured — OPENROUTER_API_KEY missing", "PASSPORT_READER_NOT_CONFIGURED");
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENROUTER_PASSPORT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Read this photo." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${image.toString("base64")}` } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      // Passports are personal data: only providers that neither store nor train on prompts.
      provider: { data_collection: "deny" },
      temperature: 0,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(502, `OpenRouter ${res.status}: ${body.slice(0, 300)}`, "OPENROUTER_HTTP_ERROR");
  }

  const json = (await res.json()) as OpenRouterResponse;
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) throw new AppError(502, "OpenRouter returned empty content", "OPENROUTER_EMPTY");
  return parsePassportReading(raw);
}

/** Parses the model's answer; exported for tests. */
export function parsePassportReading(raw: string): PassportReading {
  // Some models wrap JSON in ```json fences even when a schema is set.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AppError(502, "Passport reader returned non-JSON", "PASSPORT_READER_INVALID_JSON");
  }

  const validation = PassportReadingSchema.safeParse(parsed);
  if (!validation.success) {
    // Not the parsed body itself: it can hold a passport number and a birth date.
    logger.warn({ issues: validation.error.issues }, "Passport reader returned malformed schema");
    throw new AppError(502, "Passport reader response did not match the schema", "PASSPORT_READER_SCHEMA_MISMATCH");
  }
  return validation.data;
}
