import { z } from "zod";

// Long enough for any real password; the length rule for new ones is in lib/password.ts.
const password = z.string().min(1).max(512);

export const SignInSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password,
  remember: z.boolean().default(false),
});

export const VerifyCodeSchema = z.object({
  // People type "123 456" as the app shows it.
  code: z
    .string()
    .transform((value) => value.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "The code is 6 digits")),
});

export const SetupLinkParamsSchema = z.object({
  token: z.string().regex(/^[\w-]{20,100}$/),
});

export const CompleteSetupLinkSchema = z.object({
  password,
  remember: z.boolean().default(false),
});

export type SignInBody = z.infer<typeof SignInSchema>;
export type VerifyCodeBody = z.infer<typeof VerifyCodeSchema>;
export type SetupLinkParams = z.infer<typeof SetupLinkParamsSchema>;
export type CompleteSetupLinkBody = z.infer<typeof CompleteSetupLinkSchema>;
