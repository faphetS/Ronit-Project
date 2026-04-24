import express from "express";
import metaRoutes from "../domains/meta/meta.routes.js";
import mondayRoutes from "../domains/monday/monday.routes.js";

const router = express.Router();

router.use("/meta", metaRoutes);
router.use("/monday", mondayRoutes);

// Future domain routes (mounted at /api):
// router.use("/calls", callRoutes);         // Twilio / Fireflies / Timeless transcription
// router.use("/holiday", holidayRoutes);    // Hebcal cron + WhatsApp 2-step
// router.use("/followup", followupRoutes);  // Weekly follow-up cron

export default router;
