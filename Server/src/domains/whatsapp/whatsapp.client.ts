import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { SendMessageResult, WhatsAppProvider } from "../../integrations/greenapi.js";

interface GreenApiSendResponse {
  idMessage: string;
}

export function formatChatId(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  // Israeli local: 0X + 9 digits → 972 + 9 digits
  if (digits.startsWith("0") && digits.length === 10) {
    digits = `972${digits.slice(1)}`;
  }
  // Philippine local: 09 + 9 digits → 63 + 10 digits
  if (digits.startsWith("0") && digits.length === 11) {
    digits = `63${digits.slice(1)}`;
  }
  return `${digits}@c.us`;
}

async function sendMessage(chatId: string, message: string): Promise<SendMessageResult> {
  // HARD-DISABLED 2026-06-04 at owner's request. This GreenAPI instance
  // (7107600944) is linked to the owner's personal WhatsApp number, so no
  // automated outbound messages may go through it. The instance stays
  // connected (inbound webhooks/file download still work) — only sending is
  // blocked. Remove this throw once a dedicated sending number is in place.
  throw new AppError(
    503,
    "Outbound WhatsApp sending via this GreenAPI instance is disabled",
    "WHATSAPP_SENDING_DISABLED",
  );

  if (!env.GREENAPI_INSTANCE_ID || !env.GREENAPI_API_TOKEN) {
    throw new AppError(
      503,
      "GreenAPI not configured — GREENAPI_INSTANCE_ID and GREENAPI_API_TOKEN required",
      "GREENAPI_NOT_CONFIGURED",
    );
  }

  const url = `${env.GREENAPI_API_URL}/waInstance${env.GREENAPI_INSTANCE_ID}/sendMessage/${env.GREENAPI_API_TOKEN}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      502,
      `GreenAPI HTTP ${res.status}: ${body.slice(0, 300)}`,
      "GREENAPI_HTTP_ERROR",
    );
  }

  const json = (await res.json()) as GreenApiSendResponse;
  return { idMessage: json.idMessage };
}

export interface DownloadedFile {
  buffer: Buffer;
  downloadUrl: string;
}

export async function downloadFile(chatId: string, idMessage: string): Promise<DownloadedFile> {
  if (!env.GREENAPI_INSTANCE_ID || !env.GREENAPI_API_TOKEN) {
    throw new AppError(
      503,
      "GreenAPI not configured — GREENAPI_INSTANCE_ID and GREENAPI_API_TOKEN required",
      "GREENAPI_NOT_CONFIGURED",
    );
  }

  const url = `${env.GREENAPI_API_URL}/waInstance${env.GREENAPI_INSTANCE_ID}/downloadFile/${env.GREENAPI_API_TOKEN}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, idMessage }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      502,
      `GreenAPI downloadFile HTTP ${res.status}: ${body.slice(0, 300)}`,
      "GREENAPI_DOWNLOAD_ERROR",
    );
  }

  const json = (await res.json()) as { downloadUrl: string };

  const fileRes = await fetch(json.downloadUrl);
  if (!fileRes.ok) {
    throw new AppError(
      502,
      `GreenAPI file fetch HTTP ${fileRes.status}`,
      "GREENAPI_FILE_FETCH_ERROR",
    );
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    downloadUrl: json.downloadUrl,
  };
}

export const greenApiClient: WhatsAppProvider = { sendMessage };
