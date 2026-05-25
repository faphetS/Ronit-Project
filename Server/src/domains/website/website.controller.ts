import type { Request, Response } from "express";
import { handleFormSubmission } from "./website.service.js";
import type { WebsiteLead } from "./website.validator.js";

export async function receiveLead(
  req: Request<unknown, unknown, WebsiteLead>,
  res: Response,
): Promise<void> {
  const result = await handleFormSubmission(req.body);
  res.status(200).json({ status: "ok", ...result });
}
