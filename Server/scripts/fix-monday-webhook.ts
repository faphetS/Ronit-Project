/**
 * One-shot: delete the dead Monday webhook (was pointing at the deleted Render
 * URL) and recreate it at the Hostinger URL.
 *
 * Run with:  cd Server && npx tsx scripts/fix-monday-webhook.ts
 */

import dotenv from "dotenv";

dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN;
if (!TOKEN) {
  console.error("MONDAY_API_TOKEN not set");
  process.exit(1);
}

const OLD_WEBHOOK_ID = "165878168";
const BOARD_ID = "5094895163";
const GROUP_ID = "group_mm2n54r9";
const NEW_URL = "https://api.ronitbarash.site/api/monday/webhook";

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: TOKEN!,
      "API-Version": "2025-04",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) throw new Error(`Monday GraphQL error: ${JSON.stringify(json.errors)}`);
  if (!json.data) throw new Error("Monday returned no data");
  return json.data;
}

async function main() {
  // 1. List current webhooks for confirmation
  const before = await gql<{ webhooks: Array<{ id: string; event: string; board_id: string; config: string }> }>(
    `query ($b: ID!) { webhooks(board_id: $b) { id event board_id config } }`,
    { b: BOARD_ID },
  );
  console.log("Webhooks BEFORE:", JSON.stringify(before.webhooks, null, 2));

  // 2. Delete the dead webhook (if it's still there)
  const stillExists = before.webhooks.some((w) => w.id === OLD_WEBHOOK_ID);
  if (stillExists) {
    const del = await gql<{ delete_webhook: { id: string } }>(
      `mutation ($id: ID!) { delete_webhook(id: $id) { id } }`,
      { id: OLD_WEBHOOK_ID },
    );
    console.log("Deleted webhook id:", del.delete_webhook.id);
  } else {
    console.log(`Old webhook ${OLD_WEBHOOK_ID} not present — skipping delete`);
  }

  // 3. Create the new one at the Hostinger URL
  const created = await gql<{ create_webhook: { id: string; board_id: string } }>(
    `mutation ($boardId: ID!, $url: String!, $event: WebhookEventType!, $config: JSON) {
      create_webhook(board_id: $boardId, url: $url, event: $event, config: $config) {
        id
        board_id
      }
    }`,
    {
      boardId: BOARD_ID,
      url: NEW_URL,
      event: "item_moved_to_specific_group",
      config: JSON.stringify({ groupId: GROUP_ID }),
    },
  );
  console.log(`Created webhook id ${created.create_webhook.id} on board ${created.create_webhook.board_id} → ${NEW_URL}`);

  // 4. Confirm
  const after = await gql<{ webhooks: Array<{ id: string; event: string; board_id: string; config: string }> }>(
    `query ($b: ID!) { webhooks(board_id: $b) { id event board_id config } }`,
    { b: BOARD_ID },
  );
  console.log("Webhooks AFTER:", JSON.stringify(after.webhooks, null, 2));
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
