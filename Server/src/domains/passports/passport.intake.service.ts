import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { Db, Queryable } from "../../config/pg.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { readPassportPhoto, type PassportReading } from "../../lib/passport-reader.js";
import { decideMatch, type MatchCandidate, type MatchDecision } from "./passport.match.js";
import { verifyReading, type PersonName, type Verification, type VerifiedPassport } from "./passport.verify.js";

export type IntakeStatus = "received" | "matched" | "new-card" | "needs-review" | "not-passport" | "failed";

export interface IntakeDeps {
  db: Db;
  /** Where photos are kept, one file per intake (0600, in a 0700 folder). */
  filesDir: string;
  readPhoto: (image: Buffer, mimeType: string) => Promise<PassportReading>;
  minConfidence: number;
  now: () => Date;
}

/** A photo someone sent, as the WhatsApp connection (or the ingest script) hands it over. */
export interface PassportPhoto {
  source: "whatsapp" | "script";
  /** The provider's message id; a second delivery of the same id is ignored. */
  externalId: string | null;
  /** Digits with the country code, no plus, as toMsisdn gives. */
  senderPhone: string | null;
  senderName: string | null;
  receivedAt: Date;
  image: Buffer;
  mimeType: string;
}

export interface IntakeOutcome {
  intakeId: string;
  status: IntakeStatus;
  /** A code the dashboard words in Hebrew or English, e.g. "no-match" or "mrz-unverified". */
  reason: string | null;
  customerId: string | null;
}

const FILE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Serializes matching, so two photos of a new person processed at once make one card, not two.
const MATCH_LOCK_KEY = 4_215_012;

interface IntakeRow {
  id: string;
  source: "whatsapp" | "script";
  sender_phone: string | null;
  photo_path: string;
  photo_mime: string;
  status: IntakeStatus;
  reason: string | null;
  customer_id: string | null;
}

/** The dependencies the server and the ingest script use. */
export function intakeDepsFromEnv(db: Db): IntakeDeps {
  return {
    db,
    filesDir: env.PASSPORT_FILES_DIR,
    readPhoto: readPassportPhoto,
    minConfidence: env.PASSPORT_MIN_CONFIDENCE,
    now: () => new Date(),
  };
}

/**
 * Saves a photo and processes it: the AI reads it, the MRZ is checked, and the passport goes
 * into a customer card or to review. A photo whose message id was already received is not
 * processed again; its earlier outcome is returned.
 */
export async function receivePassportPhoto(deps: IntakeDeps, photo: PassportPhoto): Promise<IntakeOutcome> {
  const extension = FILE_EXTENSIONS[photo.mimeType];
  if (!extension) throw new ValidationError(`Unsupported passport photo type: ${photo.mimeType}`);

  if (photo.externalId) {
    const existing = await findIntakeByExternalId(deps.db, photo.source, photo.externalId);
    if (existing) return outcomeOf(existing);
  }

  const intakeId = randomUUID();
  const fileName = `${intakeId}.${extension}`;
  await mkdir(deps.filesDir, { recursive: true, mode: 0o700 });
  await writeFile(join(deps.filesDir, fileName), photo.image, { mode: 0o600 });

  const inserted = await deps.db.query<{ id: string }>(
    `INSERT INTO passport_intakes (id, source, external_id, sender_phone, sender_name, received_at, photo_path, photo_mime)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (source, external_id) DO NOTHING
     RETURNING id`,
    [intakeId, photo.source, photo.externalId, photo.senderPhone, photo.senderName, photo.receivedAt, fileName, photo.mimeType],
  );
  if (inserted.rows.length === 0) {
    // The same message arrived twice at once and the other delivery won.
    await rm(join(deps.filesDir, fileName), { force: true });
    const existing = await findIntakeByExternalId(deps.db, photo.source, photo.externalId ?? "");
    if (!existing) throw new NotFoundError("Passport intake");
    return outcomeOf(existing);
  }

  return processIntake(deps, intakeId);
}

/** Reads and files one intake. A failure is recorded on the intake (retried later), not thrown. */
export async function processIntake(deps: IntakeDeps, intakeId: string): Promise<IntakeOutcome> {
  const { rows } = await deps.db.query<IntakeRow>(
    `UPDATE passport_intakes SET attempts = attempts + 1, updated_at = now()
     WHERE id = $1 AND status IN ('received', 'failed')
     RETURNING id, source, sender_phone, photo_path, photo_mime, status, reason, customer_id`,
    [intakeId],
  );
  const intake = rows[0];
  if (!intake) {
    // Already filed (or unknown): report what it is, don't process it again.
    const { rows: existing } = await deps.db.query<IntakeRow>(
      `SELECT id, source, sender_phone, photo_path, photo_mime, status, reason, customer_id
       FROM passport_intakes WHERE id = $1`,
      [intakeId],
    );
    if (!existing[0]) throw new NotFoundError("Passport intake");
    return outcomeOf(existing[0]);
  }

  try {
    const image = await readFile(join(deps.filesDir, intake.photo_path));
    const reading = await deps.readPhoto(image, intake.photo_mime);
    const verification = verifyReading(reading, deps.now(), deps.minConfidence);
    const outcome = await deps.db.transaction((tx) => fileIntake(tx, intake, reading, verification, deps.now()));
    logger.info({ intakeId, status: outcome.status, reason: outcome.reason }, "Passport intake processed");
    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.db.query(
      `UPDATE passport_intakes SET status = 'failed', last_error = $2, updated_at = now() WHERE id = $1`,
      [intakeId, message.slice(0, 500)],
    );
    logger.warn({ err, intakeId }, "Passport intake failed — will retry");
    return { intakeId, status: "failed", reason: null, customerId: null };
  }
}

/**
 * Processes intakes that failed, or that were saved but never finished (the process died),
 * up to maxAttempts each. Returns how many it tried.
 */
export async function retryPendingIntakes(
  deps: IntakeDeps,
  options: { maxAttempts?: number; olderThanMs?: number; limit?: number } = {},
): Promise<number> {
  const { maxAttempts = 3, olderThanMs = 120_000, limit = 10 } = options;
  const cutoff = new Date(deps.now().getTime() - olderThanMs);
  const { rows } = await deps.db.query<{ id: string }>(
    `SELECT id FROM passport_intakes
     WHERE status IN ('received', 'failed') AND attempts < $1 AND updated_at < $2
     ORDER BY updated_at
     LIMIT $3`,
    [maxAttempts, cutoff, limit],
  );
  for (const { id } of rows) await processIntake(deps, id);
  return rows.length;
}

async function findIntakeByExternalId(db: Queryable, source: string, externalId: string): Promise<IntakeRow | null> {
  const { rows } = await db.query<IntakeRow>(
    `SELECT id, source, sender_phone, photo_path, photo_mime, status, reason, customer_id
     FROM passport_intakes WHERE source = $1 AND external_id = $2`,
    [source, externalId],
  );
  return rows[0] ?? null;
}

function outcomeOf(intake: IntakeRow): IntakeOutcome {
  return { intakeId: intake.id, status: intake.status, reason: intake.reason, customerId: intake.customer_id };
}

async function fileIntake(
  tx: Queryable,
  intake: IntakeRow,
  reading: PassportReading,
  verification: Verification,
  now: Date,
): Promise<IntakeOutcome> {
  if (verification.kind === "not-passport") {
    // Nothing kept from the reading: a photo of an ID card would hold an ID number.
    return finishIntake(tx, intake.id, "not-passport", "not-a-passport", null, null);
  }
  if (verification.kind === "review") {
    return finishIntake(tx, intake.id, "needs-review", verification.reason, null, { reading });
  }

  await tx.query("SELECT pg_advisory_xact_lock($1)", [MATCH_LOCK_KEY]);
  const passport = verification.passport;
  const { rows: candidates } = await tx.query<MatchCandidate>(
    `SELECT id, first_name AS "firstName", last_name AS "lastName",
            first_name_latin AS "firstNameLatin", last_name_latin AS "lastNameLatin", phone
     FROM customers`,
  );
  const decision = decideMatch(
    { hebrewName: fullName(passport.hebrew), latinName: fullName(passport.latin) },
    intake.sender_phone,
    candidates,
  );
  return applyDecision(tx, intake, reading, passport, decision, now);
}

async function applyDecision(
  tx: Queryable,
  intake: IntakeRow,
  reading: PassportReading,
  passport: VerifiedPassport,
  decision: MatchDecision,
  now: Date,
): Promise<IntakeOutcome> {
  if (decision.kind === "needs-review") {
    return finishIntake(tx, intake.id, "needs-review", decision.reason, null, { reading, candidateIds: decision.candidateIds });
  }

  let customerId: string;
  if (decision.kind === "matched") {
    customerId = decision.customerId;
    // Fill in what the card lacks; never overwrite what the office entered.
    await tx.query(
      `UPDATE customers SET
         phone = COALESCE(phone, $2),
         first_name_latin = COALESCE(first_name_latin, $3),
         last_name_latin = COALESCE(last_name_latin, $4),
         updated_at = now()
       WHERE id = $1`,
      [customerId, intake.sender_phone, passport.latin?.first ?? null, passport.latin?.last ?? null],
    );
  } else {
    const shown = passport.hebrew ?? titleCaseName(passport.latin);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO customers (first_name, last_name, first_name_latin, last_name_latin, phone, source)
       VALUES ($1, $2, $3, $4, $5, 'whatsapp')
       RETURNING id`,
      [shown?.first ?? "", shown?.last ?? "", passport.latin?.first ?? null, passport.latin?.last ?? null, intake.sender_phone],
    );
    customerId = rows[0]!.id;
  }

  await tx.query(
    `INSERT INTO passports (customer_id, number, nationality, sex, birth_date, issue_date, expiry_date, photo_path, received_via, received_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (customer_id) DO UPDATE SET
       number = EXCLUDED.number,
       nationality = EXCLUDED.nationality,
       sex = EXCLUDED.sex,
       birth_date = EXCLUDED.birth_date,
       issue_date = EXCLUDED.issue_date,
       expiry_date = EXCLUDED.expiry_date,
       photo_path = EXCLUDED.photo_path,
       received_via = EXCLUDED.received_via,
       received_at = EXCLUDED.received_at,
       updated_at = now()`,
    [
      customerId,
      passport.number,
      passport.nationality,
      passport.sex,
      passport.birthDate,
      passport.issueDate,
      passport.expiryDate,
      intake.photo_path,
      intake.source === "whatsapp" ? "whatsapp" : "manual",
      now,
    ],
  );

  await tx.query(
    `INSERT INTO audit_log (action, customer_id, details) VALUES ('passport-received', $1, $2::text::jsonb)`,
    [customerId, JSON.stringify({ via: intake.source, intakeId: intake.id })],
  );

  const status = decision.kind === "matched" ? "matched" : "new-card";
  const extracted = decision.kind === "new-card" ? { reading, phoneOwnerId: decision.phoneOwnerId } : { reading };
  return finishIntake(tx, intake.id, status, decision.reason, customerId, extracted);
}

async function finishIntake(
  tx: Queryable,
  intakeId: string,
  status: IntakeStatus,
  reason: string,
  customerId: string | null,
  extracted: Record<string, unknown> | null,
): Promise<IntakeOutcome> {
  // JSON passed as text and cast, which node-postgres and PGlite both read the same way.
  await tx.query(
    `UPDATE passport_intakes
     SET status = $2, reason = $3, customer_id = $4, extracted = $5::text::jsonb, last_error = NULL, updated_at = now()
     WHERE id = $1`,
    [intakeId, status, reason, customerId, extracted === null ? null : JSON.stringify(extracted)],
  );
  return { intakeId, status, reason, customerId };
}

function fullName(name: PersonName | null): string | null {
  return name ? `${name.first} ${name.last}` : null;
}

/** "ANNA MARIA" → "Anna Maria", for a card that only has the passport's Latin name. */
function titleCaseName(name: PersonName | null): PersonName | null {
  if (!name) return null;
  const titleCase = (value: string) =>
    value.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_match, separator: string, letter: string) => separator + letter.toUpperCase());
  return { first: titleCase(name.first), last: titleCase(name.last) };
}
