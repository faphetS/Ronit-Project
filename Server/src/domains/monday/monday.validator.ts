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

// n8n FB lead-ads fallback — n8n posts the whole "Normalize phone" node output
// when its own direct Monday create fails. Reject 400 when BOTH identifiers are
// missing — the row would be undedupable and unreachable. Extra n8n fields
// (mondayValues, raw sheet columns, etc.) pass through unvalidated so the
// backend can log/replay them without the schema drifting every time n8n's
// upstream shape changes.
export const N8nLeadFallbackSchema = z
  .object({
    full_name: z.string().trim().default("ליד חדש"),
    phone972: z.string().min(1).nullable().optional(),
    // n8n sometimes sends "" rather than omitting the key; treat that the same
    // as absent instead of failing email validation on an empty string.
    email: z.preprocess(
      (v) => (v === "" ? null : v),
      z.string().email().nullable().optional(),
    ),
    inquiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "inquiryDate must be YYYY-MM-DD")
      .optional(),
  })
  .passthrough()
  .refine((data) => Boolean(data.phone972) || Boolean(data.email), {
    message: "phone972 or email is required",
    path: ["phone972"],
  });

export type N8nLeadFallback = z.infer<typeof N8nLeadFallbackSchema>;
