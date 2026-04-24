import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  BACKEND_URL: z.string().url().default("http://localhost:3000"),

  // CORS — comma-separated origins for multi-env support
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((val) => val.split(",").map((s) => s.trim())),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),

  // Logging
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // Timezone — Israel
  TZ: z.string().default("Asia/Jerusalem"),

  // Monday.com — personal API token from <account>.monday.com/apps/manage/tokens
  // Optional until the monday domain mounts a route that depends on it.
  MONDAY_API_TOKEN: z.string().min(20).optional(),

  // Monday board / group / column IDs — defaults match scripts/output/monday-snapshot.json.
  // Override via .env only if the CRM board structure changes.
  MONDAY_BOARD_CRM_ID: z.string().default("5094895163"),
  MONDAY_GROUP_NEW_LEADS_ID: z.string().default("new_group29179"),
  MONDAY_COL_PHONE_ID: z.string().default("phone_mm2pf4nm"),
  MONDAY_COL_SERVICE_ID: z.string().default("dropdown_mm2p1nvf"),
  MONDAY_COL_NOTES_ID: z.string().default("long_text_mm2pqwp9"),

  // Monday service board IDs — items are duplicated here when closed in the CRM.
  MONDAY_BOARD_UMAN_ID: z.string().default("5095155009"),
  MONDAY_BOARD_POLAND_ID: z.string().default("5095155041"),
  MONDAY_BOARD_CHALLAH_ID: z.string().default("5095155077"),

  // Meta / Instagram — optional until business verification is complete.
  META_APP_SECRET: z.string().min(1).optional(),
  META_VERIFY_TOKEN: z.string().min(1).optional(),

  // OpenRouter — required when the classifier is invoked; optional otherwise so the
  // skeleton still boots with zero env vars set.
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().default("anthropic/claude-haiku-4.5"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;

export type Env = z.infer<typeof envSchema>;
