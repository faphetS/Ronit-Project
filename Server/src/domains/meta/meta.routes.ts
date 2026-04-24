import express from "express";
import { env } from "../../config/env.js";
import { validate } from "../../middleware/validate.js";
import {
  receiveWebhook,
  testInject,
  verifyWebhook,
} from "./meta.controller.js";
import { TestInjectBodySchema } from "./meta.validator.js";

const router = express.Router();

router.get("/webhook", verifyWebhook);
router.post("/webhook", receiveWebhook);

if (env.NODE_ENV !== "production") {
  router.post(
    "/test-inject",
    validate({ body: TestInjectBodySchema }),
    testInject,
  );
}

export default router;
