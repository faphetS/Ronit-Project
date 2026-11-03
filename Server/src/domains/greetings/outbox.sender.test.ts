import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createTestDb, TEST_DB_TIMEOUT_MS, type TestDb } from "../../db/test-db.js";
import { failInterruptedSends } from "./outbox.repository.js";
import { sendDueMessages, type SenderDeps, type WhatsAppChannel } from "./outbox.sender.js";

const NOW = new Date("2026-12-04T14:00:00Z");

let db: TestDb;
const sendText = vi.fn<NonNullable<WhatsAppChannel["sendText"]>>();
const sleep = vi.fn<SenderDeps["sleep"]>();

function deps(overrides: Partial<SenderDeps> = {}): SenderDeps {
  return {
    db,
    channel: { name: "test", dryRun: false, sendText },
    isAllowed: () => true,
    maxPerRun: 10,
    pacingMs: 3000,
    now: () => NOW,
    sleep,
    ...overrides,
  };
}

async function addMessage(options: { kind?: "holiday" | "birthday"; sendAt?: Date; to?: string; status?: string; claimedAt?: Date } = {}): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO messages (kind, dedup_key, to_phone, body, send_at, status, claimed_at)
     VALUES ($1, $2, $3, 'חג שמח', $4, $5, $6) RETURNING id`,
    [
      options.kind ?? "holiday",
      randomUUID(),
      options.to ?? "972501111111",
      options.sendAt ?? new Date(NOW.getTime() - 60_000),
      options.status ?? "queued",
      options.claimedAt ?? null,
    ],
  );
  return rows[0]!.id;
}

async function statusOf(id: string) {
  const { rows } = await db.query<{ status: string; failure: string | null; provider_message_id: string | null }>(
    "SELECT status, failure, provider_message_id FROM messages WHERE id = $1",
    [id],
  );
  return rows[0];
}

beforeAll(async () => {
  db = await createTestDb();
}, TEST_DB_TIMEOUT_MS);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.reset();
  sendText.mockReset();
  sendText.mockResolvedValue({ ok: true, providerMessageId: null });
  sleep.mockReset();
  sleep.mockResolvedValue(undefined);
});

describe("sendDueMessages", () => {
  it("sends what is due and records it", async () => {
    sendText.mockResolvedValue({ ok: true, providerMessageId: "wamid.1" });
    const id = await addMessage();

    expect(await sendDueMessages(deps())).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(sendText).toHaveBeenCalledWith("972501111111", "חג שמח");
    expect(await statusOf(id)).toEqual({ status: "sent", failure: null, provider_message_id: "wamid.1" });
  });

  it("leaves messages that aren't due yet", async () => {
    await addMessage({ sendAt: new Date(NOW.getTime() + 60_000) });
    expect(await sendDueMessages(deps())).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(sendText).not.toHaveBeenCalled();
  });

  it("marks a failed send failed and never sends it again", async () => {
    sendText.mockResolvedValue({ ok: false, error: "gateway-send-failed" });
    const id = await addMessage();

    expect(await sendDueMessages(deps())).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(await statusOf(id)).toMatchObject({ status: "failed", failure: "gateway-send-failed" });
    await sendDueMessages(deps());
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it("treats a channel that throws as a failed send", async () => {
    sendText.mockRejectedValue(new Error("socket hang up"));
    const id = await addMessage();
    await sendDueMessages(deps());
    expect(await statusOf(id)).toMatchObject({ status: "failed", failure: "socket hang up" });
  });

  it("skips numbers the allowlist doesn't open", async () => {
    const id = await addMessage();
    expect(await sendDueMessages(deps({ isAllowed: () => false }))).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(sendText).not.toHaveBeenCalled();
    expect(await statusOf(id)).toMatchObject({ status: "skipped", failure: "not-allowed" });
  });

  it("sends nothing in a dry run, marking the messages skipped", async () => {
    const id = await addMessage();
    const dryRun = { name: "dry-run", dryRun: true, sendText };
    expect(await sendDueMessages(deps({ channel: dryRun }))).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(sendText).not.toHaveBeenCalled();
    expect(await statusOf(id)).toMatchObject({ status: "skipped", failure: "dry-run" });
  });

  it("skips birthday greetings once birthdays are switched off", async () => {
    const birthday = await addMessage({ kind: "birthday" });
    const holiday = await addMessage({ kind: "holiday" });
    await db.query("UPDATE birthday_settings SET enabled = false");

    expect(await sendDueMessages(deps())).toEqual({ sent: 1, failed: 0, skipped: 1 });
    expect(await statusOf(birthday)).toMatchObject({ status: "skipped", failure: "birthdays-off" });
    expect(await statusOf(holiday)).toMatchObject({ status: "sent" });
  });

  it("paces real sends and stops at maxPerRun", async () => {
    for (let i = 0; i < 4; i += 1) await addMessage({ to: `97250000000${i}` });

    expect(await sendDueMessages(deps({ maxPerRun: 3 }))).toEqual({ sent: 3, failed: 0, skipped: 0 });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(3000);
  });
});

describe("failInterruptedSends", () => {
  it("fails a send a dead run left behind instead of sending it again", async () => {
    const stale = await addMessage({ status: "sending", claimedAt: new Date(NOW.getTime() - 20 * 60_000) });
    const recent = await addMessage({ status: "sending", claimedAt: new Date(NOW.getTime() - 60_000) });

    expect(await failInterruptedSends(db, NOW)).toBe(1);
    expect(await statusOf(stale)).toMatchObject({ status: "failed", failure: "interrupted" });
    expect(await statusOf(recent)).toMatchObject({ status: "sending" });
  });
});
