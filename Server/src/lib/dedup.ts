import { getDb } from "../config/db.js";

export function isMessageProcessed(source: string, externalId: string): boolean {
  const row = getDb()
    .prepare("SELECT id FROM processed_webhooks WHERE source = ? AND external_id = ?")
    .get(source, externalId);
  return row !== undefined;
}

export function markMessageProcessed(source: string, externalId: string): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO processed_webhooks (source, external_id) VALUES (?, ?)",
    )
    .run(source, externalId);
}

export interface KnownSender {
  monday_item_id: string;
  phone: string | null;
}

export function findKnownSender(
  platform: string,
  senderId: string,
): KnownSender | null {
  const row = getDb()
    .prepare(
      "SELECT monday_item_id, phone FROM known_senders WHERE platform = ? AND sender_id = ?",
    )
    .get(platform, senderId) as KnownSender | undefined;
  return row ?? null;
}

export function upsertKnownSender(input: {
  platform: string;
  senderId: string;
  senderUsername?: string;
  mondayItemId: string;
  phone?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO known_senders (platform, sender_id, sender_username, monday_item_id, phone, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(platform, sender_id) DO UPDATE SET
         sender_username = excluded.sender_username,
         monday_item_id = excluded.monday_item_id,
         phone = excluded.phone,
         updated_at = datetime('now')`,
    )
    .run(
      input.platform,
      input.senderId,
      input.senderUsername ?? null,
      input.mondayItemId,
      input.phone ?? null,
    );
}

export function updateSenderPhone(
  platform: string,
  senderId: string,
  phone: string,
): string | null {
  const row = getDb()
    .prepare(
      `UPDATE known_senders SET phone = ?, updated_at = datetime('now')
       WHERE platform = ? AND sender_id = ?
       RETURNING monday_item_id`,
    )
    .get(phone, platform, senderId) as { monday_item_id: string } | undefined;
  return row?.monday_item_id ?? null;
}
