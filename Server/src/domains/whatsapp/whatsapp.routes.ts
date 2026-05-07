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
  GreenApiWebhookSchema,
  HolidayTestInjectSchema,
  BroadcastTestInjectSchema,
  FollowupTestInjectSchema,
  HolidayFormSubmitSchema,
} from "./whatsapp.validator.js";

const router = Router();

router.post("/webhook", validate({ body: GreenApiWebhookSchema }), receiveWebhook);

router.get("/holiday-form", getHolidayForm);
router.post("/holiday-form", validate({ body: HolidayFormSubmitSchema }), postHolidayForm);

// TODO: revert to dev-only after testing
router.post("/test-holiday-check", validate({ body: HolidayTestInjectSchema }), testHolidayCheck);
router.post("/test-broadcast", validate({ body: BroadcastTestInjectSchema }), testBroadcast);
router.post("/test-followup", validate({ body: FollowupTestInjectSchema }), testFollowup);

export default router;
