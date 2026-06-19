import { Router } from "express";
import { env } from "../../config/env.js";
import { validate } from "../../middleware/validate.js";
import {
  receiveWebhook,
  verifyWhatsAppSecret,
  testHolidayCheck,
  testBroadcast,
  testFollowup,
} from "./whatsapp.controller.js";
import { getHolidayForm, postHolidayForm } from "./holiday.controller.js";
import {
  HolidayTestInjectSchema,
  BroadcastTestInjectSchema,
  FollowupTestInjectSchema,
  HolidayFormSubmitSchema,
} from "./whatsapp.validator.js";

const router = Router();

// Secret-gated when WA_WEBHOOK_SECRET is set; open (backwards-compatible) when empty.
router.post("/webhook", verifyWhatsAppSecret, receiveWebhook);

router.get("/holiday-form", getHolidayForm);
router.post("/holiday-form", validate({ body: HolidayFormSubmitSchema }), postHolidayForm);

if (env.NODE_ENV !== "production") {
  router.post("/test-holiday-check", validate({ body: HolidayTestInjectSchema }), testHolidayCheck);
  router.post("/test-broadcast", validate({ body: BroadcastTestInjectSchema }), testBroadcast);
  router.post("/test-followup", validate({ body: FollowupTestInjectSchema }), testFollowup);
}

export default router;
