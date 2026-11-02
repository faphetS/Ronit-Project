import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createTestDb, TEST_DB_TIMEOUT_MS, type TestDb } from "../../db/test-db.js";
import { buildTd3 } from "../../lib/passport-mrz.fixture.js";
import type { PassportReading } from "../../lib/passport-reader.js";
import { receivePassportPhoto, retryPendingIntakes, type IntakeDeps, type PassportPhoto } from "./passport.intake.service.js";

const NOW = new Date("2026-11-02T10:00:00Z");
const SARA_MRZ = buildTd3({ surname: "COHEN", givenNames: "SARAH", number: "31195855", nationality: "ISR", birth: "900514", sex: "F", expiry: "310309" });
const SENDER = "972501111111";

function saraReading(overrides: Partial<PassportReading> = {}): PassportReading {
  return {
    isPassport: true,
    confidence: 0.95,
    documentNumber: "31195855",
    surnameLatin: "COHEN",
    givenNamesLatin: "SARAH",
    surnameHebrew: "כהן",
    givenNamesHebrew: "שרה",
    nationality: "ISR",
    sex: "F",
    birthDate: "1990-05-14",
    issueDate: "2021-03-10",
    expiryDate: "2031-03-09",
    mrzLine1: SARA_MRZ.line1,
    mrzLine2: SARA_MRZ.line2,
    ...overrides,
  };
}

let db: TestDb;
let filesDir: string;
const readPhoto = vi.fn<IntakeDeps["readPhoto"]>();

function deps(overrides: Partial<IntakeDeps> = {}): IntakeDeps {
  return { db, filesDir, readPhoto, minConfidence: 0.8, now: () => NOW, ...overrides };
}

function photo(overrides: Partial<PassportPhoto> = {}): PassportPhoto {
  return {
    source: "whatsapp",
    externalId: "wamid.1",
    senderPhone: SENDER,
    senderName: "Sara",
    receivedAt: NOW,
    image: Buffer.from("not really a jpeg"),
    mimeType: "image/jpeg",
    ...overrides,
  };
}

async function addCustomer(firstName: string, lastName: string, phone: string | null): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO customers (first_name, last_name, phone, source) VALUES ($1, $2, $3, 'monday') RETURNING id",
    [firstName, lastName, phone],
  );
  return rows[0]!.id;
}

async function intakeRow() {
  const { rows } = await db.query<{ status: string; reason: string; extracted: { reading?: PassportReading } | null; attempts: number }>(
    "SELECT status, reason, extracted, attempts FROM passport_intakes",
  );
  return rows[0]!;
}

beforeAll(async () => {
  db = await createTestDb();
}, TEST_DB_TIMEOUT_MS);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.reset();
  filesDir = await mkdtemp(join(tmpdir(), "passports-"));
  readPhoto.mockReset();
  readPhoto.mockResolvedValue(saraReading());
});
afterEach(async () => {
  await rm(filesDir, { recursive: true, force: true });
});

describe("receivePassportPhoto", () => {
  it("makes a new card with the sender's number when nobody has the name", async () => {
    const outcome = await receivePassportPhoto(deps(), photo());

    expect(outcome).toMatchObject({ status: "new-card", reason: "no-match" });
    const { rows } = await db.query(
      `SELECT c.first_name, c.last_name, c.first_name_latin, c.last_name_latin, c.phone, c.source,
              p.number, p.nationality, p.sex, p.birth_date, p.issue_date, p.expiry_date, p.received_via
       FROM customers c JOIN passports p ON p.customer_id = c.id`,
    );
    expect(rows).toEqual([
      {
        first_name: "שרה",
        last_name: "כהן",
        first_name_latin: "SARAH",
        last_name_latin: "COHEN",
        phone: SENDER,
        source: "whatsapp",
        number: "31195855",
        nationality: "ISR",
        sex: "F",
        birth_date: "1990-05-14",
        issue_date: "2021-03-10",
        expiry_date: "2031-03-09",
        received_via: "whatsapp",
      },
    ]);
    expect(await readdir(filesDir)).toEqual([`${outcome.intakeId}.jpg`]);
    const audit = await db.query("SELECT action, customer_id FROM audit_log");
    expect(audit.rows).toEqual([{ action: "passport-received", customer_id: outcome.customerId }]);
  });

  it("adds the passport to the customer with the same name and fills in a missing phone", async () => {
    const saraId = await addCustomer("שרה", "כהן", null);

    const outcome = await receivePassportPhoto(deps(), photo());

    expect(outcome).toEqual({ intakeId: outcome.intakeId, status: "matched", reason: "name", customerId: saraId });
    const { rows } = await db.query("SELECT phone, first_name_latin FROM customers WHERE id = $1", [saraId]);
    expect(rows).toEqual([{ phone: SENDER, first_name_latin: "SARAH" }]);
    expect((await db.query("SELECT 1 FROM customers")).rows).toHaveLength(1);
  });

  it("makes a new card for a family member, noting whose number sent it", async () => {
    await addCustomer("רחל", "כהן", SENDER);

    const outcome = await receivePassportPhoto(deps(), photo());

    expect(outcome).toMatchObject({ status: "new-card", reason: "phone-of-other-customer" });
    expect((await db.query("SELECT 1 FROM customers")).rows).toHaveLength(2);
  });

  it("sends a photo whose MRZ doesn't check out to review, keeping what was read", async () => {
    // The birth date misread, its check digit as printed: the check fails.
    readPhoto.mockResolvedValue(saraReading({ mrzLine2: SARA_MRZ.line2.replace("900514", "900515") }));

    const outcome = await receivePassportPhoto(deps(), photo());

    expect(outcome).toMatchObject({ status: "needs-review", reason: "mrz-unverified", customerId: null });
    expect((await db.query("SELECT 1 FROM customers")).rows).toHaveLength(0);
    expect((await intakeRow()).extracted?.reading?.documentNumber).toBe("31195855");
  });

  it("sends a reading the model isn't sure of to review", async () => {
    readPhoto.mockResolvedValue(saraReading({ confidence: 0.5 }));
    expect(await receivePassportPhoto(deps(), photo())).toMatchObject({ status: "needs-review", reason: "low-confidence" });
  });

  it("files a photo that isn't a passport without keeping what was read", async () => {
    readPhoto.mockResolvedValue(saraReading({ isPassport: false }));

    expect(await receivePassportPhoto(deps(), photo())).toMatchObject({ status: "not-passport", reason: "not-a-passport" });
    expect((await intakeRow()).extracted).toBeNull();
  });

  it("processes a WhatsApp message only once", async () => {
    const first = await receivePassportPhoto(deps(), photo());
    const second = await receivePassportPhoto(deps(), photo());

    expect(second).toEqual(first);
    expect(readPhoto).toHaveBeenCalledTimes(1);
    expect(await readdir(filesDir)).toHaveLength(1);
  });

  it("refuses a file type it can't keep", async () => {
    await expect(receivePassportPhoto(deps(), photo({ mimeType: "application/pdf" }))).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("retryPendingIntakes", () => {
  it("records a failure, then files the photo on the retry", async () => {
    readPhoto.mockRejectedValueOnce(new Error("OpenRouter 502"));

    const first = await receivePassportPhoto(deps(), photo());
    expect(first.status).toBe("failed");
    expect(await intakeRow()).toMatchObject({ status: "failed", attempts: 1 });

    // A minute ahead of the database clock, so the failed intake counts as old enough.
    const later = deps({ now: () => new Date(Date.now() + 60_000) });
    expect(await retryPendingIntakes(later, { olderThanMs: 0 })).toBe(1);
    expect(await intakeRow()).toMatchObject({ status: "new-card", attempts: 2 });
  });

  it("gives up after the last attempt", async () => {
    readPhoto.mockRejectedValue(new Error("still down"));
    await receivePassportPhoto(deps(), photo());

    const later = deps({ now: () => new Date(Date.now() + 60_000) });
    await retryPendingIntakes(later, { olderThanMs: 0, maxAttempts: 2 });
    expect(await retryPendingIntakes(later, { olderThanMs: 0, maxAttempts: 2 })).toBe(0);
    expect(await intakeRow()).toMatchObject({ status: "failed", attempts: 2 });
  });
});
