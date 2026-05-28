import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN!;
const TEMPLATE_BOARD = "5095155077"; // הפרשות חלה 26
const EXPECTED_NAME = "הפרשות חלה 27";

const COL = {
  date: "date_mm3r77vt",
  dayOfWeek: "text_mm3r6hqy",
  phone: "phone_mm2pf4nm",
  agent: "text_mm3r84hb",
  amount: "text_mm3rckd0",
  city: "text_mm3pf74e",
  address: "text_mm3rwmag",
  eventType: "text_mm3r8e1m",
  forms: "text_mm3r7qvw",
  deposit: "numeric_mm3r14gy",
};

const HE_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

function ph(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("0") ? "+972" + d.slice(1) : d;
}

const events = [
  {
    name: "נופר עטר",
    cv: {
      [COL.date]: { date: "2027-06-01" },
      [COL.dayOfWeek]: "שלישי",
      [COL.phone]: { phone: ph("050-9480012"), countryShortName: "IL" },
      [COL.amount]: "5500",
      [COL.city]: "דימונה",
      [COL.address]: "תעדכן",
      [COL.eventType]: "הפקה לבת מצווה ללא תפאורה",
      [COL.forms]: "במערכת",
      [COL.deposit]: "1000",
    },
  },
  {
    name: "ענת מלצר",
    cv: {
      [COL.date]: { date: "2027-06-17" },
      [COL.dayOfWeek]: "חמישי",
      [COL.phone]: { phone: ph("054-5577101"), countryShortName: "IL" },
      [COL.agent]: "אורטל",
      [COL.amount]: "3500",
      [COL.city]: "ראשון לציון",
      [COL.address]: "תעדכן",
      [COL.eventType]: "הפרשת חלה+שיעור תורה לכלה",
      [COL.forms]: "במערכת",
      [COL.deposit]: "1000",
    },
  },
];

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: TOKEN, "API-Version": "2025-04" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) throw new Error(`Monday GraphQL error: ${JSON.stringify(json.errors)}`);
  if (!json.data) throw new Error("Monday returned no data");
  return json.data;
}

async function renameMonthGroups(boardId: string): Promise<void> {
  const { boards } = await gql<{ boards: Array<{ groups: Array<{ id: string; title: string }> }> }>(
    `query ($ids: [ID!]!) { boards(ids: $ids) { groups { id title } } }`,
    { ids: [boardId] },
  );
  const groups = boards[0]?.groups ?? [];
  let renamed = 0;
  for (const he of HE_MONTHS) {
    // 2026 board has one quirky title ("2026 דצמבר") with year-first ordering.
    const match = groups.find((g) => {
      const t = g.title.trim();
      return t === `${he} 2026` || t === `2026 ${he}`;
    });
    if (!match) continue;
    await gql(
      `mutation ($boardId: ID!, $groupId: String!, $value: String!) {
        update_group(
          board_id: $boardId,
          group_id: $groupId,
          group_attribute: title,
          new_value: $value
        ) { id }
      }`,
      { boardId, groupId: match.id, value: `${he} 2027` },
    );
    renamed++;
  }
  console.log(`Month groups renamed for 2027: ${renamed}/${HE_MONTHS.length}`);
}

async function findOrCreateBoard(): Promise<string> {
  const { boards } = await gql<{ boards: Array<{ id: string; name: string }> }>(
    `query { boards(limit: 200) { id name } }`,
  );
  const hit = boards.find((b) => b.name?.trim() === EXPECTED_NAME);
  if (hit) {
    console.log(`Found existing ${EXPECTED_NAME} → ${hit.id}`);
    await renameMonthGroups(hit.id);
    return hit.id;
  }

  console.log(`No ${EXPECTED_NAME} board — duplicating 2026 structure...`);
  const dup = await gql<{ duplicate_board: { board: { id: string } } }>(
    `mutation ($boardId: ID!, $name: String!) {
      duplicate_board(
        board_id: $boardId,
        duplicate_type: duplicate_board_with_structure,
        board_name: $name
      ) { board { id } }
    }`,
    { boardId: TEMPLATE_BOARD, name: EXPECTED_NAME },
  );
  const newId = dup.duplicate_board.board.id;
  console.log(`Created ${EXPECTED_NAME} → ${newId}`);
  await renameMonthGroups(newId);
  return newId;
}

async function findOrCreateJuneGroup(boardId: string): Promise<string> {
  const { boards } = await gql<{ boards: Array<{ groups: Array<{ id: string; title: string }> }> }>(
    `query ($ids: [ID!]!) { boards(ids: $ids) { groups { id title } } }`,
    { ids: [boardId] },
  );
  const groups = boards[0]?.groups ?? [];
  const hit = groups.find((g) => g.title.trim() === "יוני 2027");
  if (hit) return hit.id;
  const { create_group } = await gql<{ create_group: { id: string } }>(
    `mutation ($boardId: ID!, $name: String!) {
      create_group(board_id: $boardId, group_name: $name) { id }
    }`,
    { boardId, name: "יוני 2027" },
  );
  return create_group.id;
}

async function main(): Promise<void> {
  console.log("Seeding 2027 Challah events...\n");
  const boardId = await findOrCreateBoard();
  const groupId = await findOrCreateJuneGroup(boardId);
  for (const e of events) {
    const data = await gql<{ create_item: { id: string } }>(
      `mutation ($b: ID!, $g: String!, $n: String!, $cv: JSON!) {
        create_item(board_id: $b, group_id: $g, item_name: $n, column_values: $cv) { id }
      }`,
      { b: boardId, g: groupId, n: e.name, cv: JSON.stringify(e.cv) },
    );
    console.log(`  ✓ ${e.name} → ${data.create_item.id}`);
  }
  console.log(`\nDone — 2 events in יוני 2027 on ${EXPECTED_NAME}`);
}

main().catch((err) => { console.error("FAILED:", err); process.exit(1); });
