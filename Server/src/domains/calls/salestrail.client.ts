import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";

const SALESTRAIL_RECORDING_URL = "https://standalone-api.salestrail.io/export/calls";

export type DownloadResult =
  | { status: "ok"; buffer: Buffer }
  | { status: "not_ready" }
  | { status: "error"; message: string };

export class SalestrailClient {
  /**
   * Single download attempt — no internal retries/sleeps. Retrying is owned by
   * the background drain cron, which spreads attempts across minutes.
   * A 404 (or an empty body) means "recording still ingesting" → not_ready.
   */
  async tryDownloadOnce(callId: string): Promise<DownloadResult> {
    if (!env.SALESTRAIL_API_USERNAME || !env.SALESTRAIL_API_PASSWORD) {
      throw new AppError(503, "Salestrail Pull API not configured", "SALESTRAIL_NOT_CONFIGURED");
    }

    const credentials = Buffer.from(
      `${env.SALESTRAIL_API_USERNAME}:${env.SALESTRAIL_API_PASSWORD}`,
    ).toString("base64");

    const url = `${SALESTRAIL_RECORDING_URL}/${callId}/recording`;

    const res = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}` },
    });

    if (res.status === 404) {
      return { status: "not_ready" };
    }

    if (!res.ok) {
      const body = await res.text();
      return { status: "error", message: `Salestrail ${res.status}: ${body.slice(0, 300)}` };
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return { status: "not_ready" };
    }

    logger.info(
      { callId, bytes: buffer.length, contentType: res.headers.get("content-type") },
      "Salestrail recording downloaded",
    );

    return { status: "ok", buffer };
  }
}

export const salestrailClient = new SalestrailClient();
