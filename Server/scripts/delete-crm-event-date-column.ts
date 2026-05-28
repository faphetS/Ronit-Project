import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.MONDAY_API_TOKEN!;
const BOARD = "5094895163"; // CRM
const COLUMN = "date_mm3r6b6"; // תאריך אירוע — no longer used by code

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

async function main(): Promise<void> {
  console.log(`Deleting column ${COLUMN} from CRM board ${BOARD}...`);
  await gql<{ delete_column: { id: string } }>(
    `mutation ($b: ID!, $c: String!) {
      delete_column(board_id: $b, column_id: $c) { id }
    }`,
    { b: BOARD, c: COLUMN },
  );
  console.log("Done — event date column removed");
}

main().catch((err) => { console.error("FAILED:", err); process.exit(1); });
