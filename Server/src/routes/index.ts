import express from "express";
import authRoutes from "../domains/auth/auth.routes.js";
import dashboardRoutes from "../domains/dashboard/dashboard.routes.js";
import metaRoutes from "../domains/meta/meta.routes.js";
import mondayRoutes from "../domains/monday/monday.routes.js";
import callRoutes from "../domains/calls/calls.routes.js";
import whatsappRoutes from "../domains/whatsapp/whatsapp.routes.js";
import websiteRoutes from "../domains/website/website.routes.js";
import zernioRoutes from "../domains/greetings/zernio.webhook.js";

const router = express.Router();

router.use("/meta", metaRoutes);
router.use("/monday", mondayRoutes);
router.use("/calls", callRoutes);
router.use("/whatsapp", whatsappRoutes);
router.use("/website", websiteRoutes);
router.use("/auth", authRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/zernio", zernioRoutes);

export default router;
