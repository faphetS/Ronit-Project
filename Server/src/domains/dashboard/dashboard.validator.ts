import { z } from "zod";
import { ACCESS_LEVELS, PERMISSION_AREAS, ROLES } from "./dashboard.access.js";
import { SECURITY_SWITCHES } from "./users.service.js";

// Query strings are parsed in the handlers: Express 5 makes req.query read-only.

const LEAD_STATUSES = ["all", "new", "no-answer", "talking", "details-sent", "registered", "not-relevant"] as const;
const LEAD_SOURCES = ["landing-page", "instagram", "facebook", "whatsapp", "referral"] as const;

/** A real calendar day as YYYY-MM-DD: "2026-02-30" is refused, not rolled over into March. */
function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export const LeadListQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  service: z.enum(["uman", "challah"]).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  search: z.string().max(100).optional(),
  day: z.string().refine(isDay, "Expected a day as YYYY-MM-DD").optional(),
});

export const CustomerListQuerySchema = z.object({
  filter: z.enum(["all", "whatsapp-today", "expiring", "missing-passport"]).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const NoteSchema = z.object({ text: z.string().trim().min(1).max(2000) });

export const PassportViewSchema = z.object({ part: z.enum(["details", "photo"]) });

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const BirthdaySettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    sendTime: z.string().regex(HH_MM).optional(),
    shabbatRule: z.enum(["after-shabbat", "before-shabbat"]).optional(),
    template: z.string().max(2000).optional(),
  })
  .strict();

export const ProfileSchema = z.object({ name: z.string().trim().min(1).max(80), whatsappPhone: z.string().max(20).optional() }).strict();

export const CampaignPatchSchema = z
  .object({ message: z.string().max(4096).optional(), audienceId: z.union([z.literal("all"), z.string().uuid()]).optional() })
  .strict();

export const SecuritySchema = z.object({ setting: z.enum(SECURITY_SWITCHES), enabled: z.boolean() });

export const InviteSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().min(1).max(80),
  role: z.enum(ROLES),
  passportAccess: z.boolean().default(false),
});

export const AccessSchema = z.object({ role: z.enum(ROLES), passportAccess: z.boolean() }).strict();

export const PermissionChangeSchema = z.object({ role: z.enum(ROLES), area: z.enum(PERMISSION_AREAS), access: z.enum(ACCESS_LEVELS) }).strict();
