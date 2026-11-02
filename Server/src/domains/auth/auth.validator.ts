import { z } from "zod";

// Query strings are parsed in the controllers: Express 5 makes req.query read-only, so the
// validate() middleware can only take body and params here.

export const GoogleStartQuerySchema = z.object({
  remember: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => value === "1"),
  returnTo: z.string().max(300).default("/"),
});

export const GoogleCallbackQuerySchema = z.object({
  code: z.string().max(2048).optional(),
  state: z.string().max(200).optional(),
  error: z.string().max(200).optional(),
});

export const VerifyCodeSchema = z.object({
  // People type "123 456" when they copy it with a space.
  code: z
    .string()
    .transform((value) => value.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "The code is 6 digits")),
});

export type VerifyCodeBody = z.infer<typeof VerifyCodeSchema>;
