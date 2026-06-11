import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";
import { gql } from "./monday.client.js";

const SERVICE_TO_LABEL_ID: Record<"uman" | "challah", number> = {
  uman: 1,
  challah: 3,
};

const PHONE_TYPE_TO_LABEL_ID: Record<"kosher" | "regular", number> = {
  kosher: 1,
  regular: 2,
};

const PASSPORT_TO_LABEL_ID: Record<"yes" | "no", number> = {
  yes: 1,
  no: 2,
};

/** Optional website-form fields shared by create + update. */
export interface FormFields {
  age?: number;
  birth_date?: string;
  city?: string;
  occupation?: string;
  email?: string;
  phone_type?: "kosher" | "regular";
  passport?: "yes" | "no";
}

export interface CreateLeadInput extends FormFields {
  name: string;
  phone: string | null;
  service: "uman" | "challah" | null;
  source: "instagram" | "whatsapp" | "website";
}

export interface UpdateLeadInput extends FormFields {
  name?: string;
  phone?: string;
  service?: "uman" | "challah";
}

function buildPhoneColumn(phone: string): Record<string, unknown> {
  const digits = phone.replace(/\D/g, "");
  const country = digits.startsWith("63") ? "PH" : "IL";
  return { phone: digits, countryShortName: country };
}

/** Build the Monday column_values JSON for any combination of fields. */
function buildColumnValues(
  fields: FormFields & {
    phone?: string | null;
    service?: "uman" | "challah" | null;
  },
): Record<string, unknown> {
  const columnValues: Record<string, unknown> = {};

  if (fields.phone) {
    columnValues[env.MONDAY_COL_PHONE_ID] = buildPhoneColumn(fields.phone);
  }
  if (fields.service) {
    columnValues[env.MONDAY_COL_SERVICE_ID] = {
      ids: [SERVICE_TO_LABEL_ID[fields.service]],
    };
  }
  if (fields.age !== undefined) {
    columnValues[env.MONDAY_COL_AGE_ID] = String(fields.age);
  }
  if (fields.birth_date) {
    columnValues[env.MONDAY_COL_BIRTH_DATE_ID] = { date: fields.birth_date };
  }
  if (fields.city) {
    columnValues[env.MONDAY_COL_CITY_ID] = fields.city;
  }
  if (fields.occupation) {
    columnValues[env.MONDAY_COL_OCCUPATION_ID] = fields.occupation;
  }
  if (fields.email) {
    columnValues[env.MONDAY_COL_EMAIL_ID] = {
      email: fields.email,
      text: fields.email,
    };
  }
  if (fields.phone_type) {
    columnValues[env.MONDAY_COL_PHONE_TYPE_ID] = {
      ids: [PHONE_TYPE_TO_LABEL_ID[fields.phone_type]],
    };
  }
  if (fields.passport) {
    columnValues[env.MONDAY_COL_PASSPORT_ID] = {
      ids: [PASSPORT_TO_LABEL_ID[fields.passport]],
    };
  }

  return columnValues;
}

interface CreateItemResponse {
  create_item: { id: string };
}

export async function createLeadRow(
  input: CreateLeadInput,
): Promise<{ itemId: string }> {
  const columnValues = buildColumnValues(input);

  // Inquiry date — when this lead first appeared in our system. Set once on
  // creation and never touched by updateLeadRow.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  columnValues[env.MONDAY_COL_INQUIRY_DATE_ID] = { date: today };

  const mutation = /* GraphQL */ `
    mutation (
      $boardId: ID!
      $groupId: String!
      $itemName: String!
      $columnValues: JSON!
    ) {
      create_item(
        board_id: $boardId
        group_id: $groupId
        item_name: $itemName
        column_values: $columnValues
      ) {
        id
      }
    }
  `;

  const data = await gql<CreateItemResponse>(mutation, {
    boardId: env.MONDAY_BOARD_CRM_ID,
    groupId: env.MONDAY_GROUP_NEW_LEADS_ID,
    itemName: input.name,
    columnValues: JSON.stringify(columnValues),
  });

  logger.info(
    {
      itemId: data.create_item.id,
      service: input.service,
      source: input.source,
      hasPhone: !!input.phone,
    },
    "Monday CRM lead row created",
  );

  return { itemId: data.create_item.id };
}

interface ChangeColumnValueResponse {
  change_multiple_column_values: { id: string };
}

interface ChangeSimpleColumnValueResponse {
  change_simple_column_value: { id: string };
}

/**
 * Updates any subset of lead fields on an existing Monday item. Used by the
 * website-form endpoint when an incoming submission matches an existing lead
 * (by IG sender id or phone). Renames the item if `name` is supplied.
 */
export async function updateLeadRow(
  boardId: string,
  itemId: string,
  fields: UpdateLeadInput,
): Promise<void> {
  // Rename the item if the form provided a real name. Item name is a
  // pseudo-column on Monday — it uses a different mutation than the others.
  if (fields.name && fields.name.trim().length > 0) {
    await gql<ChangeSimpleColumnValueResponse>(
      `mutation ($boardId: ID!, $itemId: ID!, $value: String!) {
        change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: "name", value: $value) { id }
      }`,
      { boardId, itemId, value: fields.name.trim() },
    );
  }

  const columnValues = buildColumnValues(fields);
  if (Object.keys(columnValues).length === 0) {
    logger.info({ itemId }, "updateLeadRow called with no column-side fields");
    return;
  }

  await gql<ChangeColumnValueResponse>(
    `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id }
    }`,
    { boardId, itemId, columnValues: JSON.stringify(columnValues) },
  );

  logger.info(
    { itemId, boardId, fields: Object.keys(columnValues) },
    "Monday lead row updated from form",
  );
}

const MAX_IG_MESSAGES = 3;
const IG_MSG_PREFIX = /^הודעה \d+: /;

function parseIgMessages(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split("\n")
    .filter((line) => IG_MSG_PREFIX.test(line))
    .map((line) => line.replace(IG_MSG_PREFIX, ""));
}

function formatIgMessages(messages: string[]): string {
  return messages
    .slice(0, MAX_IG_MESSAGES)
    .map((msg, i) => `הודעה ${i + 1}: ${msg}`)
    .join("\n");
}

export async function updateLastIgMessage(
  itemId: string,
  messageText: string,
): Promise<void> {
  const current = await gql<{
    items: Array<{ column_values: Array<{ id: string; text: string }> }>;
  }>(
    `query ($ids: [ID!]!) {
      items(ids: $ids) {
        column_values(ids: ["${env.MONDAY_COL_LAST_IG_MESSAGE_ID}"]) { id text }
      }
    }`,
    { ids: [itemId] },
  );

  const existing = current.items[0]?.column_values[0]?.text ?? "";
  const previousMessages = parseIgMessages(existing);
  const updated = formatIgMessages([messageText, ...previousMessages]);

  const columnValues: Record<string, unknown> = {
    [env.MONDAY_COL_LAST_IG_MESSAGE_ID]: { text: updated },
  };

  await gql<ChangeColumnValueResponse>(
    `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id }
    }`,
    {
      boardId: env.MONDAY_BOARD_CRM_ID,
      itemId,
      columnValues: JSON.stringify(columnValues),
    },
  );

  logger.info(
    { itemId, msgCount: Math.min(previousMessages.length + 1, MAX_IG_MESSAGES) },
    "Monday last IG messages updated",
  );
}

export async function updateItemPhone(
  itemId: string,
  phone: string,
): Promise<void> {
  const digits = phone.replace(/\D/g, "");
  const columnValues: Record<string, unknown> = {
    [env.MONDAY_COL_PHONE_ID]: { phone: digits, countryShortName: digits.startsWith("63") ? "PH" : "IL" },
  };

  await gql<ChangeColumnValueResponse>(
    `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(
        board_id: $boardId
        item_id: $itemId
        column_values: $columnValues
      ) {
        id
      }
    }`,
    {
      boardId: env.MONDAY_BOARD_CRM_ID,
      itemId,
      columnValues: JSON.stringify(columnValues),
    },
  );

  logger.info({ itemId, hasPhone: true }, "Monday CRM lead phone updated");
}

// ---------------------------------------------------------------------------
// Call tracking — find lead by phone, move to group, increment calls
// ---------------------------------------------------------------------------

function phoneVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  const variants = new Set<string>([digits]);

  // Israeli: 0XX → 972XX
  if (digits.startsWith("0") && digits.length === 10) {
    variants.add(`972${digits.slice(1)}`);
  }
  // Israeli: 972XX → 0XX
  if (digits.startsWith("972") && digits.length === 12) {
    variants.add(`0${digits.slice(3)}`);
  }
  // Strip leading country code prefix (+63 Philippines, +972 Israel, etc.)
  if (digits.startsWith("63") && digits.length === 12) {
    variants.add(`0${digits.slice(2)}`);
  }

  return [...variants];
}

interface ItemsPageResponse {
  items_page_by_column_values: {
    items: Array<{ id: string; name: string }>;
  };
}

export async function findLeadByPhone(
  phone: string,
): Promise<{ itemId: string; name: string } | null> {
  const variants = phoneVariants(phone);

  const query = /* GraphQL */ `
    query ($boardId: ID!, $columns: [ItemsPageByColumnValuesQuery!]!) {
      items_page_by_column_values(
        board_id: $boardId
        limit: 10
        columns: $columns
      ) {
        items {
          id
          name
        }
      }
    }
  `;

  for (const variant of variants) {
    const data = await gql<ItemsPageResponse>(query, {
      boardId: env.MONDAY_BOARD_CRM_ID,
      columns: [
        {
          column_id: env.MONDAY_COL_PHONE_ID,
          column_values: [variant],
        },
      ],
    });

    const items = data.items_page_by_column_values.items;

    if (items.length > 1) {
      logger.warn(
        { phone: variant, count: items.length },
        "Multiple Monday CRM leads matched phone — using first",
      );
    }

    if (items.length > 0) {
      return { itemId: items[0].id, name: items[0].name };
    }
  }

  logger.info({ phone, variants }, "No Monday CRM lead matched phone");
  return null;
}

interface ItemColumnValuesResponse {
  items: Array<{
    column_values: Array<{ id: string; value: string | null }>;
  }>;
}

export async function incrementCallsColumn(itemId: string): Promise<void> {
  if (!env.MONDAY_COL_CALLS_ID) {
    logger.warn(
      { itemId },
      "MONDAY_COL_CALLS_ID not set — skipping calls increment",
    );
    return;
  }

  const readQuery = /* GraphQL */ `
    query ($ids: [ID!]!) {
      items(ids: $ids) {
        column_values(ids: ["${env.MONDAY_COL_CALLS_ID}"]) {
          id
          value
        }
      }
    }
  `;

  const readData = await gql<ItemColumnValuesResponse>(readQuery, {
    ids: [itemId],
  });

  const rawValue =
    readData.items[0]?.column_values[0]?.value;
  const current = rawValue ? Number(JSON.parse(rawValue)) || 0 : 0;
  const next = current + 1;

  const columnValues: Record<string, string> = {
    [env.MONDAY_COL_CALLS_ID]: String(next),
  };

  await gql<ChangeColumnValueResponse>(
    `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(
        board_id: $boardId
        item_id: $itemId
        column_values: $columnValues
      ) {
        id
      }
    }`,
    {
      boardId: env.MONDAY_BOARD_CRM_ID,
      itemId,
      columnValues: JSON.stringify(columnValues),
    },
  );

  logger.info(
    { itemId, oldValue: current, newValue: next },
    "Monday CRM calls column incremented",
  );
}

// ---------------------------------------------------------------------------
// Cross-board phone search (for WhatsApp file detection)
// ---------------------------------------------------------------------------

export async function findLeadByPhoneAllBoards(
  phone: string,
): Promise<{ itemId: string; name: string; boardId: string } | null> {
  const variants = phoneVariants(phone);
  const allBoardIds = [env.MONDAY_BOARD_CRM_ID];

  const query = /* GraphQL */ `
    query ($boardId: ID!, $columns: [ItemsPageByColumnValuesQuery!]!) {
      items_page_by_column_values(
        board_id: $boardId
        limit: 10
        columns: $columns
      ) {
        items {
          id
          name
        }
      }
    }
  `;

  for (const variant of variants) {
    for (const boardId of allBoardIds) {
      const data = await gql<ItemsPageResponse>(query, {
        boardId,
        columns: [
          {
            column_id: env.MONDAY_COL_PHONE_ID,
            column_values: [variant],
          },
        ],
      });

      const items = data.items_page_by_column_values.items;

      if (items.length > 0) {
        logger.info(
          { phone: variant, boardId, itemId: items[0].id },
          "Lead found by phone (CRM search)",
        );
        return { itemId: items[0].id, name: items[0].name, boardId };
      }
    }
  }

  logger.info({ phone, variants }, "No lead matched phone in CRM");
  return null;
}

// ---------------------------------------------------------------------------
// File upload to Monday.com files column
// ---------------------------------------------------------------------------

export async function uploadFileToColumn(
  itemId: string,
  columnId: string,
  fileBuffer: Buffer,
  fileName: string,
): Promise<void> {
  if (!env.MONDAY_API_TOKEN) {
    throw new AppError(
      503,
      "Monday not configured — MONDAY_API_TOKEN missing",
      "MONDAY_NOT_CONFIGURED",
    );
  }

  const query = `mutation ($file: File!) { add_file_to_column (item_id: ${itemId}, column_id: "${columnId}", file: $file) { id } }`;

  const boundary = `----MondayFileUpload${Date.now()}`;
  const parts: Buffer[] = [];

  function appendField(name: string, value: string): void {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ));
  }

  appendField("query", query);
  appendField("map", JSON.stringify({ image: "variables.file" }));

  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  ));
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const res = await fetch("https://api.monday.com/v2/file", {
    method: "POST",
    headers: {
      Authorization: env.MONDAY_API_TOKEN,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AppError(
      502,
      `Monday file upload HTTP ${res.status}: ${text.slice(0, 300)}`,
      "MONDAY_FILE_UPLOAD_ERROR",
    );
  }

  const json = (await res.json()) as { data?: { add_file_to_column?: { id: string } }; errors?: unknown };

  if (json.errors) {
    throw new AppError(
      502,
      `Monday file upload GraphQL error: ${JSON.stringify(json.errors).slice(0, 400)}`,
      "MONDAY_FILE_UPLOAD_GRAPHQL_ERROR",
    );
  }

  logger.info(
    { itemId, columnId, fileName, assetId: json.data?.add_file_to_column?.id },
    "File uploaded to Monday.com",
  );
}

// ---------------------------------------------------------------------------
// WhatsApp / holiday / follow-up helpers
// ---------------------------------------------------------------------------

interface AllLeadsItemsPageResponse {
  boards: Array<{
    id: string;
    items_page: {
      cursor: string | null;
      items: Array<{
        id: string;
        name: string;
        column_values: Array<{ id: string; value: string | null }>;
      }>;
    };
  }>;
}

interface AllLeadsNextItemsPageResponse {
  next_items_page: {
    cursor: string | null;
    items: Array<{
      id: string;
      name: string;
      column_values: Array<{ id: string; value: string | null }>;
    }>;
  };
}

type LeadItem = AllLeadsItemsPageResponse["boards"][0]["items_page"]["items"][0];

function extractPhone(item: LeadItem, phoneColId: string): string | null {
  const phoneCol = item.column_values.find((c) => c.id === phoneColId);
  if (!phoneCol?.value) return null;
  try {
    const parsed = JSON.parse(phoneCol.value) as { phone?: string };
    return parsed.phone ?? null;
  } catch {
    return null;
  }
}

export async function getAllLeadsWithPhones(): Promise<
  Array<{ itemId: string; name: string; phone: string }>
> {
  const allBoardIds = [env.MONDAY_BOARD_CRM_ID];

  const leads: Array<{ itemId: string; name: string; phone: string }> = [];
  const seenPhones = new Set<string>();

  for (const boardId of allBoardIds) {
    const firstPage = await gql<AllLeadsItemsPageResponse>(
      `query ($boardId: [ID!]!) {
        boards(ids: $boardId) {
          id
          items_page(limit: 500) {
            cursor
            items {
              id
              name
              column_values(ids: ["${env.MONDAY_COL_PHONE_ID}"]) {
                id
                value
              }
            }
          }
        }
      }`,
      { boardId: [boardId] },
    );

    let items = firstPage.boards[0]?.items_page.items ?? [];
    let cursor = firstPage.boards[0]?.items_page.cursor ?? null;

    for (const item of items) {
      const phone = extractPhone(item, env.MONDAY_COL_PHONE_ID);
      if (!phone) continue;
      const digits = phone.replace(/\D/g, "");
      if (seenPhones.has(digits)) continue;
      seenPhones.add(digits);
      leads.push({ itemId: item.id, name: item.name, phone });
    }

    while (cursor) {
      const nextPage = await gql<AllLeadsNextItemsPageResponse>(
        `query ($cursor: String!) {
          next_items_page(limit: 500, cursor: $cursor) {
            cursor
            items {
              id
              name
              column_values(ids: ["${env.MONDAY_COL_PHONE_ID}"]) {
                id
                value
              }
            }
          }
        }`,
        { cursor },
      );

      items = nextPage.next_items_page.items;
      cursor = nextPage.next_items_page.cursor ?? null;

      for (const item of items) {
        const phone = extractPhone(item, env.MONDAY_COL_PHONE_ID);
        if (!phone) continue;
        const digits = phone.replace(/\D/g, "");
        if (seenPhones.has(digits)) continue;
        seenPhones.add(digits);
        leads.push({ itemId: item.id, name: item.name, phone });
      }
    }
  }

  logger.info({ count: leads.length }, "Fetched all CRM leads with phone numbers (deduped)");
  return leads;
}

export interface FollowupLead {
  itemId: string;
  boardId: string;
  name: string;
  phone: string;
  lastCallDate: string;
}

export async function getAllLeadsForFollowup(): Promise<FollowupLead[]> {
  const allBoardIds = [env.MONDAY_BOARD_CRM_ID];

  const colIds = [env.MONDAY_COL_PHONE_ID, env.MONDAY_COL_LAST_CALL_DATE_ID];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

  function extractDateStr(item: LeadItem): string | null {
    const col = item.column_values.find((c) => c.id === env.MONDAY_COL_LAST_CALL_DATE_ID);
    if (!col?.value) return null;
    try {
      const parsed = JSON.parse(col.value) as { date?: string };
      return parsed.date ?? null;
    } catch {
      return null;
    }
  }

  const raw: Array<{ itemId: string; boardId: string; name: string; phone: string; lastCallDate: string }> = [];

  const firstPage = await gql<AllLeadsItemsPageResponse>(
    `query ($boardIds: [ID!]!) {
      boards(ids: $boardIds) {
        id
        items_page(limit: 500) {
          cursor
          items {
            id
            name
            column_values(ids: ${JSON.stringify(colIds)}) {
              id
              value
            }
          }
        }
      }
    }`,
    { boardIds: allBoardIds },
  );

  const boardsData = firstPage.boards;
  const cursors: Array<{ cursor: string; boardId: string }> = [];

  for (const board of boardsData) {
    const boardId = board.id;
    const page = board.items_page;

    for (const item of page.items) {
      const phone = extractPhone(item, env.MONDAY_COL_PHONE_ID);
      if (!phone) continue;

      let lastCallDate = extractDateStr(item);
      if (!lastCallDate) {
        await updateLastCallDate(boardId, item.id);
        lastCallDate = today;
        logger.info({ itemId: item.id, boardId }, "Set missing last_call_date to today");
      }

      raw.push({ itemId: item.id, boardId, name: item.name, phone, lastCallDate });
    }

    if (page.cursor) {
      cursors.push({ cursor: page.cursor, boardId });
    }
  }

  for (const { cursor: startCursor, boardId } of cursors) {
    let cursor: string | null = startCursor;

    while (cursor) {
      const currentCursor = cursor;
      const nextPage: AllLeadsNextItemsPageResponse = await gql<AllLeadsNextItemsPageResponse>(
        `query ($cursor: String!) {
          next_items_page(limit: 500, cursor: $cursor) {
            cursor
            items {
              id
              name
              column_values(ids: ${JSON.stringify(colIds)}) {
                id
                value
              }
            }
          }
        }`,
        { cursor: currentCursor },
      );

      cursor = nextPage.next_items_page.cursor ?? null;

      for (const item of nextPage.next_items_page.items) {
        const phone = extractPhone(item, env.MONDAY_COL_PHONE_ID);
        if (!phone) continue;

        let lastCallDate = extractDateStr(item);
        if (!lastCallDate) {
          await updateLastCallDate(boardId, item.id);
          lastCallDate = today;
          logger.info({ itemId: item.id, boardId }, "Set missing last_call_date to today");
        }

        raw.push({ itemId: item.id, boardId, name: item.name, phone, lastCallDate });
      }
    }
  }

  // Deduplicate by normalized phone — keep the entry with the earliest lastCallDate
  const byPhone = new Map<string, FollowupLead>();

  for (const lead of raw) {
    const key = lead.phone.replace(/\D/g, "");
    const existing = byPhone.get(key);

    if (!existing) {
      byPhone.set(key, lead);
    } else if (lead.lastCallDate < existing.lastCallDate) {
      logger.info(
        { phone: key, kept: lead.itemId, dropped: existing.itemId },
        "Phone dedup — keeping earlier lastCallDate",
      );
      byPhone.set(key, lead);
    } else if (lead.lastCallDate > existing.lastCallDate) {
      logger.info(
        { phone: key, kept: existing.itemId, dropped: lead.itemId },
        "Phone dedup — dropping later lastCallDate",
      );
    }
  }

  const leads = [...byPhone.values()];
  logger.info({ count: leads.length, raw: raw.length }, "Fetched all leads for follow-up");
  return leads;
}

export async function updateLastCallDate(boardId: string, itemId: string): Promise<void> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const columnValues: Record<string, unknown> = {
    [env.MONDAY_COL_LAST_CALL_DATE_ID]: { date: today },
  };

  await gql<ChangeColumnValueResponse>(
    `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id }
    }`,
    { boardId, itemId, columnValues: JSON.stringify(columnValues) },
  );

  logger.info({ itemId, boardId, date: today }, "Monday last call date updated");
}

export interface BoardGroup { id: string; title: string }

export async function getBoardGroups(boardId: string): Promise<BoardGroup[]> {
  const data = await gql<{ boards: Array<{ groups: BoardGroup[] }> }>(
    `query ($ids: [ID!]!) { boards(ids: $ids) { groups { id title } } }`,
    { ids: [boardId] },
  );
  return data.boards[0]?.groups ?? [];
}

export async function deleteItem(itemId: string): Promise<void> {
  await gql<{ delete_item: { id: string } }>(
    `mutation ($itemId: ID!) { delete_item(item_id: $itemId) { id } }`,
    { itemId },
  );
  logger.info({ itemId }, "Monday item deleted");
}

export async function addNoteToItem(itemId: string, text: string): Promise<void> {
  const columnValues: Record<string, unknown> = {
    [env.MONDAY_COL_NOTES_ID]: { text },
  };

  await gql<ChangeColumnValueResponse>(
    `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id }
    }`,
    {
      boardId: env.MONDAY_BOARD_CRM_ID,
      itemId,
      columnValues: JSON.stringify(columnValues),
    },
  );

  logger.info(
    { itemId, textLen: text.length },
    "Monday notes column updated",
  );
}
