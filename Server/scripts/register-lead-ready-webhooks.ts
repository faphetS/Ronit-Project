/**
 * One-off script: register two Monday column-change webhooks on the CRM board
 * that fire when the phone or service column is updated.
 *
 * Both webhooks call POST /api/monday/lead-ready on this backend; the handler
 * checks whether the item now has service=uman AND a phone, and fires the
 * Uman WhatsApp welcome exactly once (deduped on the Monday item ID).
 *
 * Existing webhooks for the same columnId are detected and skipped so the
 * script is safe to re-run.
 *
 * Run with:  cd Server && npx tsx scripts/register-lead-ready-webhooks.ts
 */

import dotenv from "dotenv";

dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN;
if (!TOKEN) {
  console.error("MONDAY_API_TOKEN missing from .env");
  process.exit(1);
}

const BOARD_ID = process.env.MONDAY_BOARD_CRM_ID ?? "5094895163";
const PHONE_COL_ID = process.env.MONDAY_COL_PHONE_ID ?? "phone_mm2pf4nm";
const SERVICE_COL_ID = process.env.MONDAY_COL_SERVICE_ID ?? "dropdown_mm2p1nvf";
const WEBHOOK_SECRET = process.env.MONDAY_WEBHOOK_SECRET ?? "";

const BASE_URL = "https://api.ronitbarash.site";
const TOKEN_SUFFIX = WEBHOOK_SECRET ? `?token=${WEBHOOK_SECRET}` : "";
const WEBHOOK_URL = `${BASE_URL}/api/monday/lead-ready${TOKEN_SUFFIX}`;

const MONDAY_URL = "https://api.monday.com/v2";
const API_VERSION = "2025-04";

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(MONDAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: TOKEN!,
      "API-Version": API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) {
    console.error("GraphQL error:", JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }
  if (!json.data) {
    console.error("No data returned");
    process.exit(1);
  }
  return json.data;
}

interface ExistingWebhook {
  id: string;
  event: string;
  config: string;
}

interface WebhooksResponse {
  webhooks: ExistingWebhook[];
}

interface CreateWebhookResponse {
  create_webhook: { id: string; board_id: string };
}

async function main() {
  console.log(`Board: ${BOARD_ID}`);
  console.log(`Webhook URL: ${WEBHOOK_URL.replace(WEBHOOK_SECRET, "<secret>")}\n`);

  // Fetch existing webhooks for this board to avoid duplicates.
  const existing = await gql<WebhooksResponse>(
    `query ($boardId: ID!) { webhooks(board_id: $boardId) { id event config } }`,
    { boardId: BOARD_ID },
  );

  console.log(`Existing webhooks on board (${existing.webhooks.length}):`);
  for (const w of existing.webhooks) {
    console.log(`  [${w.id}] event=${w.event} config=${w.config}`);
  }
  console.log("");

  const columnIds = [PHONE_COL_ID, SERVICE_COL_ID];

  for (const columnId of columnIds) {
    const config = JSON.stringify({ columnId });
    const alreadyExists = existing.webhooks.some((w) => {
      try {
        const parsed = JSON.parse(w.config) as { columnId?: string };
        return w.event === "change_specific_column_value" && parsed.columnId === columnId;
      } catch {
        return false;
      }
    });

    if (alreadyExists) {
      console.log(`Skipping columnId=${columnId} — webhook already exists`);
      continue;
    }

    const result = await gql<CreateWebhookResponse>(
      `mutation ($boardId: ID!, $url: String!, $config: String!) {
        create_webhook(
          board_id: $boardId
          url: $url
          event: change_specific_column_value
          config: $config
        ) {
          id
          board_id
        }
      }`,
      { boardId: BOARD_ID, url: WEBHOOK_URL, config },
    );

    console.log(
      `Created webhook for columnId=${columnId}: id=${result.create_webhook.id} board=${result.create_webhook.board_id}`,
    );
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
