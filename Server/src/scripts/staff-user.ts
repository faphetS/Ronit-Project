/**
 * Dashboard accounts from the server console, until the users screen is connected:
 *
 *   docker exec root-crm-1 node dist/scripts/staff-user.js invite --email <google email> --name "<name>" --role admin|office|sales [--passport-access] [--phone <whatsapp>]
 *   docker exec root-crm-1 node dist/scripts/staff-user.js reset-sign-in --email <email>
 *   docker exec root-crm-1 node dist/scripts/staff-user.js disable --email <email>
 *
 * invite registers the person and emails them where to sign in: "Continue with Google" with
 * that email. reset-sign-in is for a replaced Google account or a lost phone: it unlinks the
 * Google account and signs the person out everywhere. Needs DATABASE_URL and DASHBOARD_URL;
 * without SMTP the invite is printed to pass on by hand.
 *
 * Lives in src/ because only src/ is compiled into the Docker image. It must not import
 * server.ts or anything that starts a cron or a listener.
 */
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { closeCrmDb, getCrmDb } from "../config/pg.js";
import { migrate } from "../db/migrate.js";
import type { Role } from "../domains/auth/auth.service.js";
import { disableStaff, inviteStaff, resetSignIn, type AccountDeps } from "../domains/auth/staff-accounts.service.js";
import { toMsisdn } from "../domains/whatsapp/whatsapp.gateway.js";
import { AppError, ValidationError } from "../lib/errors.js";
import { smtpMailerFromEnv } from "../lib/mailer.js";

const ROLES: Role[] = ["admin", "office", "sales"];
const USAGE =
  "Usage: staff-user invite --email <google email> --name <name> --role admin|office|sales [--passport-access] [--phone <number>]\n" +
  "       staff-user reset-sign-in|disable --email <email>";

export type StaffCommand =
  | { command: "invite"; email: string; name: string; role: Role; passportAccess: boolean; whatsappPhone: string | null }
  | { command: "reset-sign-in" | "disable"; email: string };

export function parseStaffArgs(argv: string[]): StaffCommand {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
      "passport-access": { type: "boolean", default: false },
      phone: { type: "string" },
    },
    strict: true,
  });
  const [command] = positionals;
  const email = values.email?.trim();
  if (!email || !email.includes("@")) throw new ValidationError(USAGE);
  if (command === "reset-sign-in" || command === "disable") return { command, email };
  if (command !== "invite") throw new ValidationError(USAGE);
  const name = values.name?.trim();
  const role = ROLES.find((r) => r === values.role);
  if (!name || !role) throw new ValidationError(USAGE);
  return {
    command,
    email,
    name,
    role,
    passportAccess: values["passport-access"] ?? false,
    whatsappPhone: values.phone ? toMsisdn(values.phone) : null,
  };
}

async function main(): Promise<void> {
  const args = parseStaffArgs(process.argv.slice(2));
  const db = getCrmDb();
  if (!db) throw new AppError(503, "DATABASE_URL is not set", "CRM_DB_NOT_CONFIGURED");
  if (!env.DASHBOARD_URL) throw new AppError(503, "DASHBOARD_URL is not set", "DASHBOARD_URL_NOT_SET");
  const deps: AccountDeps = { db, dashboardUrl: env.DASHBOARD_URL, mailer: smtpMailerFromEnv(), now: () => new Date() };
  try {
    await migrate(db);
    switch (args.command) {
      case "invite": {
        const { command: _command, ...invite } = args;
        const { userId, emailed } = await inviteStaff(deps, invite);
        logger.info({ userId, role: invite.role, emailed }, emailed ? "staff user invited — the invite was emailed" : "staff user registered — no email went out");
        if (!emailed) {
          process.stdout.write(`Pass this on: sign in at ${env.DASHBOARD_URL} with "Continue with Google", using ${invite.email}.\n`);
        }
        break;
      }
      case "reset-sign-in":
        await resetSignIn(deps, args.email);
        logger.info("sign-in reset — the next Google account to sign in with this email is linked, and every session ended");
        break;
      case "disable":
        await disableStaff(deps, args.email);
        logger.info("account disabled and signed out everywhere");
        break;
    }
  } finally {
    await closeCrmDb();
  }
}

// Only when run directly (node dist/scripts/staff-user.js), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    logger.error({ err }, "staff-user failed");
    process.exitCode = 1;
  });
}
