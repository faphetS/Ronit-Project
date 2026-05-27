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
  MONDAY_BOARD_UMAN_ID: z.string().default("5097312406"),
  MONDAY_BOARD_POLAND_ID: z.string().default("5095155041"),
  MONDAY_BOARD_CHALLAH_ID: z.string().default("5095155077"),

  // Meta / Instagram
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_VERIFY_TOKEN: z.string().min(1).optional(),
  IG_ACCESS_TOKEN: z.string().min(1).optional(),
  IG_PROFESSIONAL_ACCOUNT_ID: z.string().min(1).optional(),

  // Outbound IG first-contact templates. Literal "\n" escapes get decoded into
  // real newlines at send time; "{form_link}" is replaced with the personalized
  // form URL containing ?ig_id=<senderId>.
  IG_MSG_PHONE_MISSING: z
    .string()
    .min(1)
    .default(
      "היי יקירה 🤍\nאשמח שתכתבי לי את מספר הנייד שלך ונחזור אלייך עם כל הפרטים 🙏📞\n\nובינתיים…\nאני מצרפת לך כאן הצצה מרגשת אל תוך המסע לרבינו ✨\n{form_link}",
    ),
  IG_MSG_PHONE_PRESENT: z
    .string()
    .min(1)
    .default(
      "היי יקירה 🤍\nאצור איתך קשר בהקדם 🙏📞\nובינתיים...\nאת מוזמנת לקבל הצצה מרגשת אל תוך המסע שלנו לרבינו ✨\n{form_link}",
    ),

  // IG token auto-refresh — JSON file on a Docker volume holds the live token.
  // Container path; the host bind-mount is /opt/ronit-data → /data in compose.
  META_TOKEN_FILE_PATH: z.string().default("/data/meta-token.json"),

  // SQLite — dedup, followup_log, holiday_campaigns. Lives on the same Docker
  // volume as the IG token file (host: /opt/ronit-data → container: /data).
  DB_FILE_PATH: z.string().default("/data/crm.sqlite"),

  // OpenRouter — required when the classifier is invoked; optional otherwise so the
  // skeleton still boots with zero env vars set.
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().default("anthropic/claude-haiku-4.5"),

  // Salestrail — call recording webhook + Pull API
  SALESTRAIL_WEBHOOK_USERNAME: z.string().min(1).optional(),
  SALESTRAIL_WEBHOOK_PASSWORD: z.string().min(1).optional(),
  OPENROUTER_AUDIO_MODEL: z.string().default("google/gemini-2.5-flash"),

  // Monday.com — CRM group/column IDs for call tracking
  MONDAY_GROUP_CONTACTED_ID: z.string().optional(),
  MONDAY_COL_CALLS_ID: z.string().optional(),
  MONDAY_COL_LAST_CALL_DATE_ID: z.string().default("date_mm2psp19"),

  // Monday.com — files column
  MONDAY_COL_FILES_ID: z.string().default("file"),

  // Monday.com — website-form columns (added 2026-05-26 via scripts/add-monday-form-columns.ts).
  // See scripts/output/form-column-ids.json for the full mapping.
  MONDAY_COL_AGE_ID: z.string().default("numeric_mm3pe3q0"),
  MONDAY_COL_BIRTH_DATE_ID: z.string().default("date_mm3p6rms"),
  MONDAY_COL_CITY_ID: z.string().default("text_mm3p66xt"),
  MONDAY_COL_OCCUPATION_ID: z.string().default("text_mm3p3e2z"),
  MONDAY_COL_PHONE_TYPE_ID: z.string().default("dropdown_mm3px3w7"),
  MONDAY_COL_PASSPORT_ID: z.string().default("dropdown_mm3px2sn"),
  MONDAY_COL_EMAIL_ID: z.string().default("email_mm3p4w7"),

  // Monday.com — date column set to today on row creation by createLeadRow.
  MONDAY_COL_INQUIRY_DATE_ID: z.string().default("date_mm2psbnf"),

  // Monday.com — long_text column populated by every incoming IG message via
  // updateLastIgMessage. CRM-board ID; the column also exists on Uman/Poland/
  // Challah boards (see scripts/output/last-ig-message-column-ids.json) but
  // updates only target CRM because known_senders.monday_item_id is CRM-only.
  MONDAY_COL_LAST_IG_MESSAGE_ID: z.string().default("long_text_mm3qd4jt"),

  // GreenAPI / WhatsApp
  GREENAPI_API_URL: z.string().url().default("https://7107.api.greenapi.com"),
  GREENAPI_INSTANCE_ID: z.string().min(1).optional(),
  GREENAPI_API_TOKEN: z.string().min(1).optional(),
  RONIT_OWNER_WA_NUMBER: z.string().min(10).optional(),
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
