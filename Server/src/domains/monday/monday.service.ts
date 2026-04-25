import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { gql } from "./monday.client.js";

const SERVICE_TO_LABEL_ID: Record<"uman" | "poland" | "challah", number> = {
  uman: 1,
  poland: 2,
  challah: 3,
};

export interface CreateLeadInput {
  name: string;
  phone: string | null;
  service: "uman" | "poland" | "challah" | null;
  source: "instagram" | "whatsapp";
}

interface CreateItemResponse {
  create_item: { id: string };
}

export async function createLeadRow(
  input: CreateLeadInput,
): Promise<{ itemId: string }> {
  const columnValues: Record<string, unknown> = {};

  if (input.phone) {
    const digits = input.phone.replace(/\D/g, "");
    const country = digits.startsWith("63") ? "PH" : "IL";
    columnValues[env.MONDAY_COL_PHONE_ID] = {
      phone: digits,
      countryShortName: country,
    };
  }

  if (input.service) {
    columnValues[env.MONDAY_COL_SERVICE_ID] = {
      ids: [SERVICE_TO_LABEL_ID[input.service]],
    };
  }

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

interface MoveItemResponse {
  move_item_to_group: { id: string };
}

export async function moveItemToGroup(
  itemId: string,
  targetGroupId: string,
): Promise<void> {
  const mutation = /* GraphQL */ `
    mutation ($itemId: ID!, $groupId: String!) {
      move_item_to_group(item_id: $itemId, group_id: $groupId) {
        id
      }
    }
  `;

  await gql<MoveItemResponse>(mutation, { itemId, groupId: targetGroupId });

  logger.info(
    { itemId, targetGroupId },
    "Monday CRM lead moved to Contacted group",
  );
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
  const current = rawValue ? (JSON.parse(rawValue) as number) : 0;
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
  const firstPage = await gql<AllLeadsItemsPageResponse>(
    `query ($boardId: [ID!]!) {
      boards(ids: $boardId) {
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
    { boardId: [env.MONDAY_BOARD_CRM_ID] },
  );

  const leads: Array<{ itemId: string; name: string; phone: string }> = [];
  let items = firstPage.boards[0]?.items_page.items ?? [];
  let cursor = firstPage.boards[0]?.items_page.cursor ?? null;

  for (const item of items) {
    const phone = extractPhone(item, env.MONDAY_COL_PHONE_ID);
    if (phone) leads.push({ itemId: item.id, name: item.name, phone });
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
      if (phone) leads.push({ itemId: item.id, name: item.name, phone });
    }
  }

  logger.info({ count: leads.length }, "Fetched all CRM leads with phone numbers");
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
  const allBoardIds = [
    env.MONDAY_BOARD_CRM_ID,
    env.MONDAY_BOARD_UMAN_ID,
    env.MONDAY_BOARD_POLAND_ID,
    env.MONDAY_BOARD_CHALLAH_ID,
  ];

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
