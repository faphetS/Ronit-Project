import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";

const SALESTRAIL_RECORDING_URL = "https://standalone-api.salestrail.io/export/calls";

export type DownloadResult =
  | { status: "ok"; buffer: Buffer; org: string }
  | { status: "not_ready" }
  | { status: "error"; message: string };

type PullCredentials = { org: string; username: string; password: string };

function pullCredentialSets(): PullCredentials[] {
  const sets: PullCredentials[] = [];

  if (env.SALESTRAIL_API_USERNAME && env.SALESTRAIL_API_PASSWORD) {
    sets.push({
      org: "org1",
      username: env.SALESTRAIL_API_USERNAME,
      password: env.SALESTRAIL_API_PASSWORD,
    });
  }

  if (env.SALESTRAIL_API_USERNAME_2 && env.SALESTRAIL_API_PASSWORD_2) {
    sets.push({
      org: "org2",
      username: env.SALESTRAIL_API_USERNAME_2,
      password: env.SALESTRAIL_API_PASSWORD_2,
    });
  }

  return sets;
}

export class SalestrailClient {
  /**
   * Single download attempt — no internal retries/sleeps. Retrying is owned by
   * the background drain cron, which spreads attempts across minutes.
   * A 404 (or an empty body) means "recording still ingesting" → not_ready.
   *
   * A recording lives in exactly one Salestrail org, and the other org's key
   * answers 404 for it — indistinguishable from "still ingesting". So every
   * configured org key is tried before concluding not_ready.
   */
  async tryDownloadOnce(callId: string): Promise<DownloadResult> {
    const credentialSets = pullCredentialSets();

    if (credentialSets.length === 0) {
      throw new AppError(503, "Salestrail Pull API not configured", "SALESTRAIL_NOT_CONFIGURED");
    }

    const url = `${SALESTRAIL_RECORDING_URL}/${callId}/recording`;
    let lastError: string | undefined;

    for (const { org, username, password } of credentialSets) {
      const credentials = Buffer.from(`${username}:${password}`).toString("base64");

      const res = await fetch(url, {
        headers: { Authorization: `Basic ${credentials}` },
      });

      if (res.status === 404) {
        continue;
      }

      if (!res.ok) {
        lastError = `Salestrail ${res.status}: ${(await res.text()).slice(0, 300)}`;
        continue;
      }

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        continue;
      }

      logger.info(
        { callId, org, bytes: buffer.length, contentType: res.headers.get("content-type") },
        "Salestrail recording downloaded",
      );

      return { status: "ok", buffer, org };
    }

    return lastError ? { status: "error", message: lastError } : { status: "not_ready" };
  }
}

export const salestrailClient = new SalestrailClient();
