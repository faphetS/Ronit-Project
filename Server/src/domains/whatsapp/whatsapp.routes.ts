import { Router } from "express";
import { env } from "../../config/env.js";
import { validate } from "../../middleware/validate.js";
import {
  receiveWebhook,
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

// Plain inbound receiver — accepts ANY payload (no schema validation), logs it,
// returns 200. Decoupled from GreenAPI; handling will be rebuilt for the new gateway.
router.post("/webhook", receiveWebhook);

router.get("/holiday-form", getHolidayForm);
router.post("/holiday-form", validate({ body: HolidayFormSubmitSchema }), postHolidayForm);

if (env.NODE_ENV !== "production") {
  router.post("/test-holiday-check", validate({ body: HolidayTestInjectSchema }), testHolidayCheck);
  router.post("/test-broadcast", validate({ body: BroadcastTestInjectSchema }), testBroadcast);
  router.post("/test-followup", validate({ body: FollowupTestInjectSchema }), testFollowup);
}

export default router;
