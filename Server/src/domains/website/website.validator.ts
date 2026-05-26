import { z } from "zod";

const PhonePattern = /^[+\d][\d\s\-()]{5,20}$/;

export const WebsiteLeadSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  phone: z.string().regex(PhonePattern, "Invalid phone number"),
  age: z.coerce.number().int().min(16).max(120).optional(),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "birth_date must be YYYY-MM-DD")
    .optional(),
  city: z.string().max(120).optional(),
  occupation: z.string().max(120).optional(),
  email: z.string().email().optional(),
  phone_type: z.enum(["kosher", "regular"]),
  passport: z.enum(["yes", "no"]),
  service: z.enum(["uman", "poland", "challah"]).nullable().optional(),
  ig_id: z.string().min(1).max(64).nullable().optional(),
  utm_source: z.string().max(64).default("direct"),
});

export type WebsiteLead = z.infer<typeof WebsiteLeadSchema>;
