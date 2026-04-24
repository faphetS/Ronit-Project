import { z } from "zod";

export const MondayChallengeSchema = z.object({
  challenge: z.string(),
});

export const MondayWebhookEventSchema = z.object({
  event: z.object({
    pulseId: z.coerce.number(),
    boardId: z.coerce.number().optional(),
    groupId: z.string().optional(),
    userId: z.coerce.number().optional(),
    pulseName: z.string().optional(),
    triggerUuid: z.string().optional(),
  }),
});
export type MondayWebhookEvent = z.infer<typeof MondayWebhookEventSchema>;

export const TestInjectBodySchema = z.object({
  itemId: z.string().min(1),
});
export type TestInjectBody = z.infer<typeof TestInjectBodySchema>;
