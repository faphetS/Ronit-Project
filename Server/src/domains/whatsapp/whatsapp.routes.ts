import { Router } from "express";
import { env } from "../../config/env.js";
import { validate } from "../../middleware/validate.js";
import {
  receiveWebhook,
  testHolidayCheck,
  testBroadcast,
  testFollowup,
} from "./whatsapp.controller.js";
import {
  GreenApiWebhookSchema,
  HolidayTestInjectSchema,
  BroadcastTestInjectSchema,
  FollowupTestInjectSchema,
} from "./whatsapp.validator.js";

const router = Router();

router.post("/webhook", validate({ body: GreenApiWebhookSchema }), receiveWebhook);

if (env.NODE_ENV !== "production") {
  router.post("/test-holiday-check", validate({ body: HolidayTestInjectSchema }), testHolidayCheck);
  router.post("/test-broadcast", validate({ body: BroadcastTestInjectSchema }), testBroadcast);
  router.post("/test-followup", validate({ body: FollowupTestInjectSchema }), testFollowup);
}

export default router;
