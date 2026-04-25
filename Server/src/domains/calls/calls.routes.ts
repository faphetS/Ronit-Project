import express from "express";
import { env } from "../../config/env.js";
import { validate } from "../../middleware/validate.js";
import { receiveWebhook, testInject } from "./calls.controller.js";
import { CallTestInjectBodySchema } from "./calls.validator.js";

const router = express.Router();

router.post("/webhook", receiveWebhook);

if (env.NODE_ENV !== "production") {
  router.post(
    "/test-inject",
    validate({ body: CallTestInjectBodySchema }),
    testInject,
  );
}

export default router;
