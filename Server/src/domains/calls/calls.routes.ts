import express from "express";
import { env } from "../../config/env.js";
import { validate } from "../../middleware/validate.js";
import { receiveWebhook, testInject, testRecording } from "./calls.controller.js";
import { CallTestInjectBodySchema, CallTestRecordingBodySchema } from "./calls.validator.js";

const router = express.Router();

router.post("/webhook", receiveWebhook);

if (env.NODE_ENV !== "production") {
  router.post(
    "/test-inject",
    validate({ body: CallTestInjectBodySchema }),
    testInject,
  );

  router.post(
    "/test-recording",
    validate({ body: CallTestRecordingBodySchema }),
    testRecording,
  );
}

export default router;
