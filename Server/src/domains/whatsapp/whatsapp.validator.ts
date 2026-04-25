import { z } from "zod";

export const GreenApiWebhookSchema = z.object({
  typeWebhook: z.string(),
  instanceData: z
    .object({
      idInstance: z.number(),
      wid: z.string(),
      typeInstance: z.string(),
    })
    .optional(),
  timestamp: z.number().optional(),
  idMessage: z.string().optional(),
  chatId: z.string().optional(),
  senderData: z
    .object({
      chatId: z.string(),
      sender: z.string(),
      senderName: z.string().optional(),
    })
    .optional(),
  messageData: z
    .object({
      typeMessage: z.string(),
      textMessageData: z.object({ textMessage: z.string() }).optional(),
    })
    .optional(),
});

export type GreenApiWebhook = z.infer<typeof GreenApiWebhookSchema>;

export const HolidayTestInjectSchema = z.object({
  holidayName: z.string().min(1).optional(),
  holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const FollowupTestInjectSchema = z.object({
  daysThreshold: z.coerce.number().min(1).default(7),
});

export const BroadcastTestInjectSchema = z.object({
  campaignId: z.coerce.number().optional(),
});
