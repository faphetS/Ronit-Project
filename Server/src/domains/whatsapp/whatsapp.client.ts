import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { SendMessageResult, WhatsAppProvider } from "../../integrations/greenapi.js";

interface GreenApiSendResponse {
  idMessage: string;
}

export function formatChatId(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) {
    digits = `972${digits.slice(1)}`;
  }
  return `${digits}@c.us`;
}

async function sendMessage(chatId: string, message: string): Promise<SendMessageResult> {
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

export const greenApiClient: WhatsAppProvider = { sendMessage };
