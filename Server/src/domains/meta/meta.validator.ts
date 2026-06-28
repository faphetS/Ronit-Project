import { z } from "zod";

// Minimal subset of the Meta IG Graph webhook payload that we currently care about.
// Widen as we start consuming more event types (postbacks, reactions, etc.).
export const MetaWebhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string().optional(),
      time: z.number().optional(),
      messaging: z
        .array(
          z.object({
            sender: z.object({
              id: z.string(),
              username: z.string().optional(),
            }),
            recipient: z.object({ id: z.string() }).optional(),
            timestamp: z.number().optional(),
            message: z
              .object({
                mid: z.string().optional(),
                text: z.string().optional(),
                is_echo: z.boolean().optional(),
              })
              .optional(),
          }),
        )
        .optional(),
      // Field-change events (e.g. post comments). A comment arrives as
      // field="comments" with the commenter in value.from. We act only on new
      // comments (verb add/undefined) and ignore "remove"/"edited".
      changes: z
        .array(
          z.object({
            field: z.string(),
            value: z
              .object({
                from: z
                  .object({
                    id: z.string(),
                    username: z.string().optional(),
                  })
                  .optional(),
                media: z.object({ id: z.string() }).optional(),
                id: z.string().optional(),
                text: z.string().optional(),
                parent_id: z.string().optional(),
                verb: z.string().optional(),
              })
              .optional(),
          }),
        )
        .optional(),
    }),
  ),
});
export type MetaWebhookPayload = z.infer<typeof MetaWebhookPayloadSchema>;

export const TestInjectBodySchema = z.object({
  messageText: z.string().min(1).max(4000),
  senderUsername: z.string().min(1).max(100).optional(),
});
export type TestInjectBody = z.infer<typeof TestInjectBodySchema>;
