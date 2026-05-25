import express from "express";
import metaRoutes from "../domains/meta/meta.routes.js";
import mondayRoutes from "../domains/monday/monday.routes.js";
import callRoutes from "../domains/calls/calls.routes.js";
import whatsappRoutes from "../domains/whatsapp/whatsapp.routes.js";
import websiteRoutes from "../domains/website/website.routes.js";

const router = express.Router();

router.use("/meta", metaRoutes);
router.use("/monday", mondayRoutes);
router.use("/calls", callRoutes);
router.use("/whatsapp", whatsappRoutes);
router.use("/website", websiteRoutes);

export default router;
