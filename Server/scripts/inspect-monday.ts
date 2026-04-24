/**
 * Read-only Monday.com account inspector.
 *
 * Sends GraphQL `query` operations only — never `mutation`. Nothing in the Monday
 * account is created, modified, or deleted. Output is dumped to:
 *   - stdout (human summary)
 *   - scripts/output/monday-snapshot.json (raw)
 *
 * Run with:  cd Server && npx tsx scripts/inspect-monday.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN;
if (!TOKEN) {
  console.error("MONDAY_API_TOKEN missing from .env");
  process.exit(1);
}

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

interface MeResponse {
  me: { id: string; name: string; email: string; is_admin: boolean };
  account: { id: string; name: string; slug: string; tier: string };
}

interface Workspace {
  id: string;
  name: string;
  kind: string;
  description: string | null;
}

interface Column {
  id: string;
  title: string;
  type: string;
  settings_str: string;
}

interface Group {
  id: string;
  title: string;
  color: string;
}

interface Board {
  id: string;
  name: string;
  state: string;
  description: string | null;
  workspace_id: string | null;
  workspace: { id: string; name: string } | null;
  items_count: number;
  columns: Column[];
  groups: Group[];
}

interface Item {
  id: string;
  name: string;
  group: { id: string; title: string };
  column_values: Array<{
    id: string;
    text: string | null;
    type: string;
    value: string | null;
    column: { title: string };
  }>;
}

async function main() {
  console.log("=== Monday.com read-only inspection ===\n");

  // 1. Identity sanity check
  const me = await gql<MeResponse>(/* GraphQL */ `
    query {
      me { id name email is_admin }
      account { id name slug tier }
    }
  `);
  console.log(`Logged in as: ${me.me.name} <${me.me.email}> (id ${me.me.id}${me.me.is_admin ? ", admin" : ""})`);
  console.log(`Account: ${me.account.name} (slug=${me.account.slug}, tier=${me.account.tier}, id=${me.account.id})\n`);

  // 2. Workspaces
  const wsRes = await gql<{ workspaces: Workspace[] }>(/* GraphQL */ `
    query { workspaces (limit: 100) { id name kind description } }
  `);
  console.log(`Workspaces (${wsRes.workspaces.length}):`);
  for (const w of wsRes.workspaces) {
    console.log(`  - [${w.id}] "${w.name}" (kind=${w.kind})${w.description ? ` — ${w.description}` : ""}`);
  }
  console.log("");

  // 3. Boards (with columns + groups)
  const boardsRes = await gql<{ boards: Board[] }>(/* GraphQL */ `
    query {
      boards (limit: 200, state: active) {
        id
        name
        state
        description
        workspace_id
        workspace { id name }
        items_count
        columns { id title type settings_str }
        groups { id title color }
      }
    }
  `);

  console.log(`Boards (${boardsRes.boards.length} active):\n`);

  const itemSamples: Record<string, Item[]> = {};

  for (const b of boardsRes.boards) {
    const wsName = b.workspace?.name ?? "(no workspace)";
    console.log(`──────── Board "${b.name}" (id ${b.id}, workspace="${wsName}") ────────`);
    console.log(`  items_count: ${b.items_count}`);
    if (b.description) console.log(`  description: ${b.description}`);

    console.log(`  Groups (${b.groups.length}):`);
    for (const g of b.groups) {
      console.log(`    - [${g.id}] "${g.title}" (color=${g.color})`);
    }

    console.log(`  Columns (${b.columns.length}):`);
    for (const c of b.columns) {
      let extra = "";
      if (c.type === "status" || c.type === "color" || c.type === "dropdown") {
        try {
          const settings = JSON.parse(c.settings_str) as {
            labels?: Record<string, string> | string[];
            labels_v2?: Array<{ id: number; name: string }>;
          };
          if (settings.labels_v2) {
            extra = " labels=[" + settings.labels_v2.map((l) => `"${l.name}"`).join(", ") + "]";
          } else if (Array.isArray(settings.labels)) {
            extra = " labels=[" + settings.labels.map((l) => `"${l}"`).join(", ") + "]";
          } else if (settings.labels && typeof settings.labels === "object") {
            extra = " labels=[" + Object.values(settings.labels).map((l) => `"${l}"`).join(", ") + "]";
          }
        } catch {
          /* ignore */
        }
      }
      console.log(`    - [${c.id}] "${c.title}" type=${c.type}${extra}`);
    }

    // Sample up to 5 items per board so we see real data shape
    if (b.items_count > 0) {
      const itemsRes = await gql<{ boards: Array<{ items_page: { items: Item[] } }> }>(
        /* GraphQL */ `
          query ($boardId: ID!) {
            boards (ids: [$boardId]) {
              items_page (limit: 5) {
                items {
                  id
                  name
                  group { id title }
                  column_values {
                    id
                    text
                    type
                    value
                    column { title }
                  }
                }
              }
            }
          }
        `,
        { boardId: b.id },
      );
      const items = itemsRes.boards[0]?.items_page.items ?? [];
      itemSamples[b.id] = items;

      console.log(`  Sample items (showing ${items.length} of ${b.items_count}):`);
      for (const it of items) {
        console.log(`    • "${it.name}" (id ${it.id}, group="${it.group.title}")`);
        for (const cv of it.column_values) {
          if (cv.text || cv.value) {
            const display = cv.text ?? cv.value ?? "";
            const trimmed = display.length > 80 ? display.slice(0, 77) + "..." : display;
            console.log(`        ${cv.column.title} (${cv.type}): ${trimmed}`);
          }
        }
      }
    } else {
      console.log("  Sample items: (board is empty)");
      itemSamples[b.id] = [];
    }
    console.log("");
  }

  // 4. Persist raw snapshot for later reference
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outPath = join(__dirname, "output", "monday-snapshot.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        apiVersion: API_VERSION,
        me: me.me,
        account: me.account,
        workspaces: wsRes.workspaces,
        boards: boardsRes.boards,
        itemSamples,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Raw snapshot saved to: ${outPath}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
