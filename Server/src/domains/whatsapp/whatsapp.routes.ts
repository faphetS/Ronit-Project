import { Router } from "express";
import { receiveWebhook, verifyWhatsAppSecret } from "./whatsapp.controller.js";

const router = Router();

// Secret-gated when WA_WEBHOOK_SECRET is set; open (backwards-compatible) when empty.
router.post("/webhook", verifyWhatsAppSecret, receiveWebhook);

export default router;
