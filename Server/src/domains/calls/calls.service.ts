import { z } from "zod";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";
import {
  findLeadByPhone,
  moveItemToGroup,
  incrementCallsColumn,
  updateLastCallDate,
} from "../monday/monday.service.js";
import { timelessClient } from "./calls.client.js";
import type { CallTestInjectBody } from "./calls.validator.js";

// ---------------------------------------------------------------------------
// LLM phone extraction
// ---------------------------------------------------------------------------

const PhoneExtractionSchema = z.object({
  phone: z.string().nullable(),
});

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const PHONE_EXTRACTION_PROMPT = `You are a phone-number extraction assistant. You receive a transcript of a phone call in Hebrew and/or English.

Your task: Find any phone number mentioned by either speaker during the call.

Common patterns in Hebrew phone conversations:
- "המספר שלי הוא..." (my number is...)
- "תתקשרי אליי ל..." (call me at...)
- A speaker stating digits one by one
- International format: +972-50-123-4567
- Local format: 050-1234567, 054-1234567

Return STRICT JSON:
{ "phone": "+972XXXXXXXXX" }

Rules:
- If you find a phone number, normalize it to international format (+972...).
- If multiple phone numbers are mentioned, return the one that belongs to the OTHER party (not the caller/host).
- If you cannot find any phone number, return { "phone": null }.
- Output ONLY the JSON object. No commentary.`;

async function extractPhoneFromTranscript(
  text: string,
): Promise<string | null> {
  if (!env.OPENROUTER_API_KEY) {
    throw new AppError(
      503,
      "Classifier not configured — OPENROUTER_API_KEY missing",
      "CLASSIFIER_NOT_CONFIGURED",
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
        { role: "system", content: PHONE_EXTRACTION_PROMPT },
        { role: "user", content: text },
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
    throw new AppError(
      502,
      "OpenRouter returned empty content",
      "OPENROUTER_EMPTY",
    );
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
    logger.warn(
      { rawResponse: rawResponse.slice(0, 200) },
      "Phone extractor returned non-JSON",
    );
    return null;
  }

  const validation = PhoneExtractionSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn(
      { parsed, issues: validation.error.issues },
      "Phone extractor returned malformed schema",
    );
    return null;
  }

  return validation.data.phone;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

interface CallResult {
  matched: boolean;
  reason?: string;
  itemId?: string;
  phone?: string;
}

export async function handleTranscriptReady(
  meetingId: string,
): Promise<CallResult> {
  const transcript = await timelessClient.fetchTranscript(meetingId);

  logger.info(
    { meetingId, duration: transcript.duration, title: transcript.title },
    "Fetched Timeless transcript",
  );

  const phone = await extractPhoneFromTranscript(transcript.fullText);

  if (!phone) {
    logger.warn({ meetingId }, "No phone number extracted from transcript");
    return { matched: false, reason: "no_phone_extracted" };
  }

  return matchAndUpdate(phone);
}

export async function handleTestInject(
  body: CallTestInjectBody,
): Promise<CallResult> {
  let phone: string | null = null;

  if (body.transcriptText) {
    phone = await extractPhoneFromTranscript(body.transcriptText);
    logger.info(
      { extractedPhone: phone },
      "LLM phone extraction from test transcript",
    );
  }

  if (!phone) {
    phone = body.phone;
  }

  return matchAndUpdate(phone);
}

async function matchAndUpdate(phone: string): Promise<CallResult> {
  if (!env.MONDAY_GROUP_CONTACTED_ID) {
    throw new AppError(
      503,
      "MONDAY_GROUP_CONTACTED_ID not configured",
      "MONDAY_GROUP_NOT_CONFIGURED",
    );
  }

  const lead = await findLeadByPhone(phone);

  if (!lead) {
    return { matched: false, reason: "no_match", phone };
  }

  await moveItemToGroup(lead.itemId, env.MONDAY_GROUP_CONTACTED_ID);
  await incrementCallsColumn(lead.itemId);
  await updateLastCallDate(lead.itemId);

  logger.info(
    { itemId: lead.itemId, name: lead.name, phone },
    "Call matched and lead updated",
  );

  return { matched: true, itemId: lead.itemId, phone };
}
