import express from "express";
import { validate } from "../../middleware/validate.js";
import { receiveLead } from "./website.controller.js";
import { WebsiteLeadSchema } from "./website.validator.js";

const router = express.Router();

router.post("/lead", validate({ body: WebsiteLeadSchema }), receiveLead);

export default router;
