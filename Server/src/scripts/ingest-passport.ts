/**
 * Feeds one passport photo to the intake, the way a WhatsApp photo will be once a connection
 * carries photos. For trying the pipeline on the server:
 *
 *   docker exec root-crm-1 node dist/scripts/ingest-passport.js --file /data/inbox/photo.jpg [--phone 0501234567] [--name "שרה כהן"]
 *
 * --phone is the number the photo "came from"; --name the sender's WhatsApp name. Prints the
 * outcome (status, reason code, customer id), never the passport's details. Needs
 * DATABASE_URL and OPENROUTER_API_KEY.
 *
 * Lives in src/ because only src/ is compiled into the Docker image. It must not import
 * server.ts or anything that starts a cron or a listener.
 */
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { logger } from "../config/logger.js";
import { closeCrmDb, getCrmDb } from "../config/pg.js";
import { migrate } from "../db/migrate.js";
import { intakeDepsFromEnv, receivePassportPhoto } from "../domains/passports/passport.intake.service.js";
import { toMsisdn } from "../domains/whatsapp/whatsapp.gateway.js";
import { AppError, ValidationError } from "../lib/errors.js";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export interface IngestOptions {
  file: string;
  mimeType: string;
  phone: string | null;
  name: string | null;
}

export function parseCliArgs(argv: string[]): IngestOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      file: { type: "string" },
      phone: { type: "string" },
      name: { type: "string" },
    },
    strict: true,
  });
  if (!values.file) throw new ValidationError("Usage: ingest-passport --file <photo> [--phone <number>] [--name <name>]");
  const mimeType = MIME_TYPES[extname(values.file).toLowerCase()];
  if (!mimeType) throw new ValidationError(`Unsupported photo type: ${extname(values.file) || "(none)"} (jpg, png or webp)`);
  return {
    file: values.file,
    mimeType,
    phone: values.phone ? toMsisdn(values.phone) : null,
    name: values.name ?? null,
  };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const db = getCrmDb();
  if (!db) throw new AppError(503, "DATABASE_URL is not set", "CRM_DB_NOT_CONFIGURED");
  try {
    await migrate(db);
    const outcome = await receivePassportPhoto(intakeDepsFromEnv(db), {
      source: "script",
      externalId: null,
      senderPhone: options.phone,
      senderName: options.name,
      receivedAt: new Date(),
      image: await readFile(options.file),
      mimeType: options.mimeType,
    });
    logger.info(outcome, "passport intake done");
  } finally {
    await closeCrmDb();
  }
}

// Only when run directly (node dist/scripts/ingest-passport.js), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    logger.error({ err }, "ingest-passport failed");
    process.exitCode = 1;
  });
}
