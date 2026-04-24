/**
 * Monday.com restructure — Phase 1 (Ronit CRM columns) + Phase 2 (service boards).
 *
 * Run with DRY_RUN=true to preview every mutation without executing.
 * Run with DRY_RUN=false to actually mutate Monday.
 *
 *   cd Server && DRY_RUN=true  npx tsx scripts/restructure-monday.ts
 *   cd Server && DRY_RUN=false npx tsx scripts/restructure-monday.ts
 *
 * On real run, every mutation is logged with its result. If it fails partway,
 * the log tells you exactly where to resume.
 */

import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN;
if (!TOKEN) {
  console.error("MONDAY_API_TOKEN missing from .env");
  process.exit(1);
}

const DRY_RUN = (process.env.DRY_RUN ?? "true").toLowerCase() !== "false";
const MONDAY_URL = "https://api.monday.com/v2";
const API_VERSION = "2025-04";

// --- Known IDs from the snapshot taken just before this run ---
const CRM_BOARD_ID = "5094895163";

const TEST_ITEM_IDS = {
  crm_task1: "2852600847",
  crm_task2: "2852657485",
  crm_task3: "2852600848",
  uman_adsadas: "2861596954",
};

const OLD_CRM_COLUMNS = {
  phone: "text_mm2nhvt2", // "phone call number-"
  service: "text_mm2nazte", // "what the servie"
  next_step: "text_mm2ncsvk", // "what the next step"
  paid: "text_mm2nq9y", // "PAID/DIDNT"
  date_of_event: "text_mm2nt1z4", // "date of event"
  price_quote: "text_mm2nsqc9", // "PRICE QUTE" (rename only, keep)
  owner: "project_owner", // remove
  due_date: "date", // remove
  notes: "text", // remove
  orphan: "text_mm2nvrc1", // "Text" — remove
};

const SERVICE_BOARDS = [
  { id: "5095040372", name: "טיסות לאומן 26" },
  { id: "5095040377", name: "טיסות לפולין 26" },
  { id: "5095040476", name: "הפרשות חלה 26" },
];

const MONTH_GROUPS_2026 = [
  "Jan 2026",
  "Feb 2026",
  "Mar 2026",
  "Apr 2026",
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
  "Oct 2026",
  "Nov 2026",
  "Dec 2026",
];

const SERVICE_DROPDOWN_LABELS = [
  { id: 1, name: "טיסות לאומן" },
  { id: 2, name: "טיסות לפולין" },
  { id: 3, name: "הפרשות חלה" },
];

// --- Logging helpers ---
let stepCount = 0;
function step(label: string) {
  stepCount++;
  console.log(`\n[${stepCount}] ${DRY_RUN ? "DRY" : "EXEC"} — ${label}`);
}

async function gql<T>(
  description: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T | null> {
  if (DRY_RUN) {
    console.log(`     would: ${description}`);
    if (Object.keys(variables).length > 0) {
      console.log(`     vars: ${JSON.stringify(variables)}`);
    }
    return null;
  }

  console.log(`     run: ${description}`);
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
    console.error(`     ERROR: ${JSON.stringify(json.errors, null, 2)}`);
    throw new Error(`GraphQL error in step ${stepCount}: ${description}`);
  }
  console.log(`     ok: ${JSON.stringify(json.data)}`);
  return json.data ?? null;
}

// --- Phase 1: Restructure Ronit CRM ---
async function phase1() {
  console.log("\n===== PHASE 1 — Restructure Ronit CRM =====");

  // 1a. Delete 3 test items
  for (const [name, id] of Object.entries({
    "Task 1": TEST_ITEM_IDS.crm_task1,
    "Task 2": TEST_ITEM_IDS.crm_task2,
    "Task 3": TEST_ITEM_IDS.crm_task3,
  })) {
    step(`delete CRM test item "${name}"`);
    await gql(
      `delete_item ${id}`,
      `mutation { delete_item(item_id: ${id}) { id } }`,
    );
  }

  // 1b. Create new typed columns
  step(`create CRM column "Phone" (phone)`);
  await gql(
    `create_column Phone phone`,
    `mutation { create_column(board_id: ${CRM_BOARD_ID}, title: "Phone", column_type: phone) { id title type } }`,
  );

  step(`create CRM column "Service" (dropdown, 3 Hebrew labels)`);
  const serviceDefaults = JSON.stringify({
    settings: { labels: SERVICE_DROPDOWN_LABELS },
  });
  await gql(
    `create_column Service dropdown`,
    `mutation ($defaults: JSON!) { create_column(board_id: ${CRM_BOARD_ID}, title: "Service", column_type: dropdown, defaults: $defaults) { id title type settings_str } }`,
    { defaults: serviceDefaults },
  );

  step(`create CRM column "Next step" (long_text)`);
  await gql(
    `create_column "Next step" long_text`,
    `mutation { create_column(board_id: ${CRM_BOARD_ID}, title: "Next step", column_type: long_text) { id title type } }`,
  );

  step(`rename CRM column "PRICE QUTE" → "Price quote"`);
  await gql(
    `change_column_title PRICE QUTE → Price quote`,
    `mutation { change_column_title(board_id: ${CRM_BOARD_ID}, column_id: "${OLD_CRM_COLUMNS.price_quote}", title: "Price quote") { id title } }`,
  );

  step(`create CRM column "Paid" (status, Hebrew כן/לא)`);
  const paidDefaults = JSON.stringify({
    labels: { "0": "כן", "1": "לא" },
    labels_colors: {
      "0": { color: "#00C875", border: "#00B461", var_name: "green-shadow" },
      "1": { color: "#E2445C", border: "#CE3048", var_name: "red-shadow" },
    },
  });
  await gql(
    `create_column Paid status`,
    `mutation ($defaults: JSON!) { create_column(board_id: ${CRM_BOARD_ID}, title: "Paid", column_type: status, defaults: $defaults) { id title type settings_str } }`,
    { defaults: paidDefaults },
  );

  step(`create CRM column "Last phone call date" (date)`);
  await gql(
    `create_column "Last phone call date" date`,
    `mutation { create_column(board_id: ${CRM_BOARD_ID}, title: "Last phone call date", column_type: date) { id title type } }`,
  );

  step(`create CRM column "Phone calls count" (numbers)`);
  await gql(
    `create_column "Phone calls count" numbers`,
    `mutation { create_column(board_id: ${CRM_BOARD_ID}, title: "Phone calls count", column_type: numbers) { id title type } }`,
  );

  step(`create CRM column "Date of event" (date)`);
  await gql(
    `create_column "Date of event" date`,
    `mutation { create_column(board_id: ${CRM_BOARD_ID}, title: "Date of event", column_type: date) { id title type } }`,
  );

  // 1c. Delete the old/replaced/clutter columns
  const toDelete: Array<{ name: string; id: string }> = [
    { name: "phone call number- (old phone)", id: OLD_CRM_COLUMNS.phone },
    { name: "what the servie (old service)", id: OLD_CRM_COLUMNS.service },
    { name: "what the next step (old next step)", id: OLD_CRM_COLUMNS.next_step },
    { name: "PAID/DIDNT (old paid)", id: OLD_CRM_COLUMNS.paid },
    { name: "date of event (old, text type)", id: OLD_CRM_COLUMNS.date_of_event },
    { name: "Owner (people)", id: OLD_CRM_COLUMNS.owner },
    { name: "Due date (default template)", id: OLD_CRM_COLUMNS.due_date },
    { name: "Notes (default template)", id: OLD_CRM_COLUMNS.notes },
    { name: "Text (orphan)", id: OLD_CRM_COLUMNS.orphan },
  ];
  for (const c of toDelete) {
    step(`delete CRM column "${c.name}" (id ${c.id})`);
    await gql(
      `delete_column ${c.id}`,
      `mutation { delete_column(board_id: ${CRM_BOARD_ID}, column_id: "${c.id}") { id } }`,
    );
  }

  console.log("\n--- Phase 1 complete ---");
}

// --- Phase 2: Rebuild service boards ---
async function phase2() {
  console.log("\n===== PHASE 2 — Rebuild service boards =====");

  // 2a. Delete the lone test item on Uman
  step(`delete Uman test item "adsadas"`);
  await gql(
    `delete_item ${TEST_ITEM_IDS.uman_adsadas}`,
    `mutation { delete_item(item_id: ${TEST_ITEM_IDS.uman_adsadas}) { id } }`,
  );

  // 2b. Delete the 3 existing service boards
  for (const sb of SERVICE_BOARDS) {
    step(`delete existing service board "${sb.name}" (id ${sb.id})`);
    await gql(
      `delete_board ${sb.id}`,
      `mutation { delete_board(board_id: ${sb.id}) { id } }`,
    );
  }

  // 2c. For each service board: duplicate CRM, replace groups
  for (const sb of SERVICE_BOARDS) {
    step(`duplicate Ronit CRM (structure-only) → "${sb.name}"`);
    const dup = await gql<{
      duplicate_board: { board: { id: string; name: string } };
    }>(
      `duplicate_board structure-only as "${sb.name}"`,
      `mutation ($name: String!) { duplicate_board(board_id: ${CRM_BOARD_ID}, duplicate_type: duplicate_board_with_structure, board_name: $name) { board { id name } } }`,
      { name: sb.name },
    );

    // In DRY_RUN mode we don't have a real new board id, so we can't proceed
    // with dependent steps. Log placeholders and move on.
    const newBoardId = dup?.duplicate_board.board.id ?? "<new_board_id>";
    console.log(`     → new board id: ${newBoardId}`);

    // 2d. Add 12 month groups FIRST (so we can safely delete the inherited 3 after)
    for (const m of MONTH_GROUPS_2026) {
      step(`create group "${m}" on "${sb.name}" (board ${newBoardId})`);
      await gql(
        `create_group "${m}"`,
        `mutation ($groupName: String!) { create_group(board_id: ${newBoardId}, group_name: $groupName) { id title } }`,
        { groupName: m },
      );
    }

    // 2e. Query current groups on the new board, delete the 3 inherited ones
    if (DRY_RUN) {
      step(`(dry) would delete inherited groups: new leads / contacted / closed`);
    } else {
      step(`fetch groups on new board ${newBoardId} to find inherited group ids`);
      const groupsRes = await gql<{
        boards: Array<{ groups: Array<{ id: string; title: string }> }>;
      }>(
        `read groups on ${newBoardId}`,
        `query ($id: [ID!]) { boards(ids: $id) { groups { id title } } }`,
        { id: [newBoardId] },
      );

      const inheritedTitles = new Set(["new leads", "contacted", "closed"]);
      const inheritedGroups =
        groupsRes?.boards[0]?.groups.filter((g) =>
          inheritedTitles.has(g.title),
        ) ?? [];

      for (const g of inheritedGroups) {
        step(
          `delete inherited group "${g.title}" (id ${g.id}) on "${sb.name}"`,
        );
        await gql(
          `delete_group ${g.id}`,
          `mutation { delete_group(board_id: ${newBoardId}, group_id: "${g.id}") { id } }`,
        );
      }
    }
  }

  console.log("\n--- Phase 2 complete ---");
}

async function main() {
  console.log(`========================================`);
  console.log(`Monday.com restructure`);
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN (no mutations executed)" : "LIVE EXECUTION"}`);
  console.log(`========================================`);

  await phase1();
  await phase2();

  console.log(
    `\n========================================\nDone. ${stepCount} steps ${DRY_RUN ? "previewed" : "executed"}.\n========================================`,
  );

  console.log(`\nManual follow-ups (not API-able):
  - For each of the 3 new service boards, in the Monday UI:
      Click "+" next to the view tabs → choose "Calendar"
      → set Date column to "Date of event"
      (~5 seconds per board)
`);
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});
