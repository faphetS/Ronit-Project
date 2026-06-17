import { z } from "zod";

export const SalestrailWebhookPayloadSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  userPhone: z.string(),
  callId: z.string().min(1),
  source: z.string(),
  sourceDetail: z.string(),
  startTime: z.string(),
  duration: z.number(),
  answered: z.boolean(),
  inbound: z.boolean(),
  number: z.string(),
  formattedNumber: z.string(),
  createdAt: z.string(),
  phoneBookName: z.string().optional(),
});
export type SalestrailWebhookPayload = z.infer<typeof SalestrailWebhookPayloadSchema>;

export const CallTestInjectBodySchema = z.object({
  phone: z.string().min(7).max(20),
  transcriptText: z.string().max(10_000).optional(),
});
export type CallTestInjectBody = z.infer<typeof CallTestInjectBodySchema>;

export const CallTestRecordingBodySchema = z.object({
  callId: z.string().min(1),
  itemId: z.string().min(1),
  callTime: z.string().min(1).optional(),
});
export type CallTestRecordingBody = z.infer<typeof CallTestRecordingBodySchema>;
