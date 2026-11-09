/**
 * Dashboard accounts from the server console, until the users screen is connected:
 *
 *   docker exec root-crm-1 node dist/scripts/staff-user.js invite --email <email> --name "<name>" --role admin|office|sales [--passport-access] [--phone <whatsapp>] [--username <name>] [--password-stdin]
 *   docker exec -i root-crm-1 node dist/scripts/staff-user.js set-sign-in --email <email> [--username <name>] [--password-stdin]
 *   docker exec root-crm-1 node dist/scripts/staff-user.js two-step --email <email> --off|--on
 *   docker exec root-crm-1 node dist/scripts/staff-user.js reset-sign-in --email <email>
 *   docker exec root-crm-1 node dist/scripts/staff-user.js disable --email <email>
 *
 * invite registers the person and emails them where to sign in: the username (or the email)
 * and a password, when one is given, or "Continue with Google" with that email. set-sign-in
 * changes the username ("" takes it off) or sets a new password, which signs the person out
 * everywhere. two-step --off makes a special account that never gets the emailed code;
 * --on puts it back. --password-stdin reads the password from standard input (run docker exec with
 * -i), so it never sits on a command line or in the process list. reset-sign-in is for a
 * replaced Google account or a lost phone: it unlinks the Google account and signs the person
 * out everywhere. Needs DATABASE_URL and DASHBOARD_URL; without SMTP the invite is printed to
 * pass on by hand.
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
import { disableStaff, inviteStaff, resetSignIn, setSignInByEmail, setTwoStepExempt, type AccountDeps } from "../domains/auth/staff-accounts.service.js";
import { toMsisdn } from "../domains/whatsapp/whatsapp.gateway.js";
import { AppError, ValidationError } from "../lib/errors.js";
import { smtpMailerFromEnv } from "../lib/mailer.js";

const ROLES: Role[] = ["admin", "office", "sales"];
const USAGE =
  "Usage: staff-user invite --email <email> --name <name> --role admin|office|sales [--passport-access] [--phone <number>] [--username <name>] [--password-stdin]\n" +
  "       staff-user set-sign-in --email <email> [--username <name>] [--password-stdin]\n" +
  "       staff-user two-step --email <email> --off|--on\n" +
  "       staff-user reset-sign-in|disable --email <email>";

export type StaffCommand =
  | {
      command: "invite";
      email: string;
      name: string;
      role: Role;
      passportAccess: boolean;
      whatsappPhone: string | null;
      username: string | null;
      /** The password comes on standard input. */
      passwordFromStdin: boolean;
    }
  | { command: "set-sign-in"; email: string; username?: string; passwordFromStdin: boolean }
  /** `exempt`: the account never gets the emailed code. */
  | { command: "two-step"; email: string; exempt: boolean }
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
      username: { type: "string" },
      "password-stdin": { type: "boolean", default: false },
      off: { type: "boolean", default: false },
      on: { type: "boolean", default: false },
    },
    strict: true,
  });
  const [command] = positionals;
  const email = values.email?.trim();
  if (!email || !email.includes("@")) throw new ValidationError(USAGE);
  if (command === "reset-sign-in" || command === "disable") return { command, email };
  if (command === "two-step") {
    if (values.off === values.on) throw new ValidationError(USAGE);
    return { command, email, exempt: values.off === true };
  }
  const passwordFromStdin = values["password-stdin"] ?? false;
  if (command === "set-sign-in") {
    if (values.username === undefined && !passwordFromStdin) throw new ValidationError(USAGE);
    return { command, email, username: values.username, passwordFromStdin };
  }
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
    username: values.username?.trim() || null,
    passwordFromStdin,
  };
}

/** The password from standard input: one line, without the newline echo or a here-string adds. */
async function readPassword(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  if (!password) throw new ValidationError("No password came on standard input");
  return password;
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
        const { command: _command, passwordFromStdin, ...invite } = args;
        const password = passwordFromStdin ? await readPassword() : null;
        const { userId, emailed } = await inviteStaff(deps, { ...invite, password });
        logger.info(
          { userId, role: invite.role, emailed, username: invite.username, withPassword: password !== null },
          emailed ? "staff user invited — the invite was emailed" : "staff user registered — no email went out",
        );
        if (!emailed) {
          const how = password ? `the username ${invite.username ?? invite.email} and the password you set` : `"Continue with Google", using ${invite.email}`;
          process.stdout.write(`Pass this on: sign in at ${env.DASHBOARD_URL} with ${how}.\n`);
        }
        break;
      }
      case "set-sign-in": {
        const password = args.passwordFromStdin ? await readPassword() : undefined;
        await setSignInByEmail(deps, args.email, { username: args.username, password });
        logger.info(
          { username: args.username, withPassword: password !== undefined },
          password ? "sign-in changed — the new password is set and every session ended" : "username changed",
        );
        break;
      }
      case "two-step":
        await setTwoStepExempt(deps, args.email, args.exempt);
        logger.info({ exempt: args.exempt }, args.exempt ? "two-step off — this account never gets the emailed code" : "two-step back on for this account");
        break;
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
