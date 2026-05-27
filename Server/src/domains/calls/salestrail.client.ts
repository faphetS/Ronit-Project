import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";

const SALESTRAIL_RECORDING_URL = "https://standalone-api.salestrail.io/export/calls";

export class SalestrailClient {
  async downloadRecording(callId: string): Promise<Buffer> {
    if (!env.SALESTRAIL_API_USERNAME || !env.SALESTRAIL_API_PASSWORD) {
      throw new AppError(503, "Salestrail Pull API not configured", "SALESTRAIL_NOT_CONFIGURED");
    }

    const credentials = Buffer.from(
      `${env.SALESTRAIL_API_USERNAME}:${env.SALESTRAIL_API_PASSWORD}`
    ).toString("base64");

    const url = `${SALESTRAIL_RECORDING_URL}/${callId}/recording`;

    const res = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}` },
    });

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
      { callId, bytes: buffer.length, contentType: res.headers.get("content-type") },
      "Salestrail recording downloaded",
    );

    return buffer;
  }
}

export const salestrailClient = new SalestrailClient();
