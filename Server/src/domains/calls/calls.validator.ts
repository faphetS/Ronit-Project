import { z } from "zod";

export const TimelessWebhookPayloadSchema = z.object({
  event: z.literal("meeting.transcript_ready"),
  meeting_id: z.string().min(1),
});
export type TimelessWebhookPayload = z.infer<
  typeof TimelessWebhookPayloadSchema
>;

export const CallTestInjectBodySchema = z.object({
  phone: z.string().min(7).max(20),
  transcriptText: z.string().max(10_000).optional(),
});
export type CallTestInjectBody = z.infer<typeof CallTestInjectBodySchema>;
