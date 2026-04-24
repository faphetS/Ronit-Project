import express from "express";
import { env } from "../../config/env.js";
import { validate } from "../../middleware/validate.js";
import { handleWebhook, testInject } from "./monday.controller.js";
import { TestInjectBodySchema } from "./monday.validator.js";

const router = express.Router();

router.post("/webhook", handleWebhook);

if (env.NODE_ENV !== "production") {
  router.post(
    "/test-inject",
    validate({ body: TestInjectBodySchema }),
    testInject,
  );
}

export default router;
