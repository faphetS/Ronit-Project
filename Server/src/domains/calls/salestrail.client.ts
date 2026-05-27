import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";

const SALESTRAIL_RECORDING_URL = "https://standalone-api.salestrail.io/export/calls";
const RETRY_DELAYS_MS = [10_000, 15_000, 20_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SalestrailClient {
  async downloadRecording(callId: string): Promise<Buffer> {
    if (!env.SALESTRAIL_API_USERNAME || !env.SALESTRAIL_API_PASSWORD) {
      throw new AppError(503, "Salestrail Pull API not configured", "SALESTRAIL_NOT_CONFIGURED");
    }

    const credentials = Buffer.from(
      `${env.SALESTRAIL_API_USERNAME}:${env.SALESTRAIL_API_PASSWORD}`
    ).toString("base64");

    const url = `${SALESTRAIL_RECORDING_URL}/${callId}/recording`;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_DELAYS_MS[attempt - 1];
        logger.info({ callId, attempt, delayMs: delay }, "Recording not ready, retrying after delay");
        await sleep(delay);
      }

      const res = await fetch(url, {
        headers: { Authorization: `Basic ${credentials}` },
      });

      if (res.status === 404 && attempt < RETRY_DELAYS_MS.length) {
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new AppError(
          502,
          `Salestrail ${res.status}: ${body.slice(0, 300)}`,
          "SALESTRAIL_HTTP_ERROR",
        );
      }

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      logger.info(
        { callId, bytes: buffer.length, attempt, contentType: res.headers.get("content-type") },
        "Salestrail recording downloaded",
      );

      return buffer;
    }

    throw new AppError(502, "Salestrail recording not available after retries", "SALESTRAIL_NOT_FOUND");
  }
}

export const salestrailClient = new SalestrailClient();
