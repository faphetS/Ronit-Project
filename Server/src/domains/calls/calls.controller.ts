import crypto from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError, UnauthorizedError } from "../../lib/errors.js";
import { handleSalestrailCall, handleTestInject, processRecordingJob } from "./calls.service.js";
import { enqueuePendingRecording, getPendingRecordingByCallId } from "../../config/db.js";
import { SalestrailWebhookPayloadSchema } from "./calls.validator.js";
import type { CallTestInjectBody, CallTestRecordingBody } from "./calls.validator.js";

function verifyBasicAuth(req: Request): void {
  if (!env.SALESTRAIL_WEBHOOK_USERNAME || !env.SALESTRAIL_WEBHOOK_PASSWORD) {
    logger.warn("SALESTRAIL credentials not set — skipping auth (placeholder mode)");
    return;
  }

  const header = req.header("authorization");
  if (!header || !header.startsWith("Basic ")) {
    throw new UnauthorizedError("Missing Basic auth header");
  }

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const colonIdx = decoded.indexOf(":");
  if (colonIdx === -1) {
    throw new UnauthorizedError("Malformed Basic auth header");
  }

  const username = decoded.slice(0, colonIdx);
  const password = decoded.slice(colonIdx + 1);

  const expectedUser = Buffer.from(env.SALESTRAIL_WEBHOOK_USERNAME, "utf8");
  const expectedPass = Buffer.from(env.SALESTRAIL_WEBHOOK_PASSWORD, "utf8");
  const gotUser = Buffer.from(username, "utf8");
  const gotPass = Buffer.from(password, "utf8");

  const userMatch =
    expectedUser.length === gotUser.length &&
    crypto.timingSafeEqual(expectedUser, gotUser);
  const passMatch =
    expectedPass.length === gotPass.length &&
    crypto.timingSafeEqual(expectedPass, gotPass);

  if (!userMatch || !passMatch) {
    throw new UnauthorizedError("Invalid Salestrail webhook credentials");
  }
}

export async function receiveWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const raw = req.body as Buffer;

  verifyBasicAuth(req);

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new AppError(400, "Invalid JSON in Salestrail webhook body", "SALESTRAIL_INVALID_JSON");
  }

  const parsed = SalestrailWebhookPayloadSchema.parse(payload);

  try {
    await handleSalestrailCall(parsed);
  } catch (err) {
    logger.error(
      { err, callId: parsed.callId },
      "Failed to process Salestrail call — returning 200 to prevent retries",
    );
  }

  res.status(200).json({ status: "ok" });
}

export async function testInject(
  req: Request<unknown, unknown, CallTestInjectBody>,
  res: Response,
): Promise<void> {
  const result = await handleTestInject(req.body);
  res.json({ status: "ok", ...result });
}

export async function testRecording(
  req: Request<unknown, unknown, CallTestRecordingBody>,
  res: Response,
): Promise<void> {
  const { callId, itemId, callTime } = req.body;
  enqueuePendingRecording(callId, itemId, callTime ?? new Date().toISOString());
  const job = getPendingRecordingByCallId(callId);
  if (!job) {
    throw new AppError(500, "Failed to enqueue test recording", "TEST_RECORDING_ENQUEUE_FAILED");
  }
  await processRecordingJob(job);
  const remaining = getPendingRecordingByCallId(callId);
  res.json({ status: "ok", callId, itemId, completed: remaining === null });
}
