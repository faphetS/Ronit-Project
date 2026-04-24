import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";
import { gql } from "./monday.client.js";

const LABEL_ID_TO_BOARD: Record<number, string> = {
  1: env.MONDAY_BOARD_UMAN_ID,
  2: env.MONDAY_BOARD_POLAND_ID,
  3: env.MONDAY_BOARD_CHALLAH_ID,
};

const COPYABLE_COLUMN_IDS = [
  "text_mm2nsqc9",
  "phone_mm2pf4nm",
  "dropdown_mm2p1nvf",
  "long_text_mm2pqwp9",
  "color_mm2pznkk",
  "date_mm2psp19",
  "numeric_mm2paaz",
  "date_mm2psbnf",
] as const;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

interface ColumnValue {
  id: string;
  value: string | null;
}

interface ItemQueryResponse {
  items: Array<{
    id: string;
    name: string;
    column_values: ColumnValue[];
  }>;
}

interface BoardGroupsResponse {
  boards: Array<{
    groups: Array<{ id: string; title: string }>;
  }>;
}

interface CreateGroupResponse {
  create_group: { id: string };
}

interface CreateItemResponse {
  create_item: { id: string };
}

export interface DuplicationResult {
  duplicated: boolean;
  sourceItemId: number;
  targetItemId?: string;
  targetBoardId?: string;
  skipped?: "no_service" | "no_date";
}

export async function duplicateClosedItem(
  itemId: number,
): Promise<DuplicationResult> {
  const { items } = await gql<ItemQueryResponse>(
    `query ($ids: [ID!]!) {
      items(ids: $ids) {
        id
        name
        column_values {
          id
          value
        }
      }
    }`,
    { ids: [String(itemId)] },
  );

  if (items.length === 0) {
    throw new AppError(404, `Item ${itemId} not found`, "MONDAY_ITEM_NOT_FOUND");
  }

  const item = items[0];
  const colMap = new Map(item.column_values.map((c) => [c.id, c.value]));

  const serviceRaw = colMap.get("dropdown_mm2p1nvf");
  const labelId = extractLabelId(serviceRaw);
  if (labelId === null || !(labelId in LABEL_ID_TO_BOARD)) {
    logger.warn({ itemId, serviceRaw }, "Skipping duplication — no valid service");
    return { duplicated: false, sourceItemId: itemId, skipped: "no_service" };
  }

  const dateRaw = colMap.get("date_mm2psbnf");
  const eventDate = extractDate(dateRaw);
  if (!eventDate) {
    logger.warn({ itemId, dateRaw }, "Skipping duplication — no date of event");
    return { duplicated: false, sourceItemId: itemId, skipped: "no_date" };
  }

  const targetBoardId = LABEL_ID_TO_BOARD[labelId];
  const targetGroupId = await findMonthGroup(targetBoardId, eventDate);

  const columnValues: Record<string, unknown> = {};
  for (const colId of COPYABLE_COLUMN_IDS) {
    const raw = colMap.get(colId);
    if (!raw) continue;
    try {
      columnValues[colId] = JSON.parse(raw) as unknown;
    } catch {
      columnValues[colId] = raw;
    }
  }

  const { create_item } = await gql<CreateItemResponse>(
    `mutation (
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
    }`,
    {
      boardId: targetBoardId,
      groupId: targetGroupId,
      itemName: item.name,
      columnValues: JSON.stringify(columnValues),
    },
  );

  logger.info(
    {
      sourceItemId: itemId,
      targetItemId: create_item.id,
      targetBoardId,
      targetGroupId,
      service: labelId,
      eventDate: `${eventDate.year}-${String(eventDate.month + 1).padStart(2, "0")}`,
    },
    "Item duplicated from CRM to service board",
  );

  return {
    duplicated: true,
    sourceItemId: itemId,
    targetItemId: create_item.id,
    targetBoardId,
  };
}

function extractLabelId(raw: string | null | undefined): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { ids?: number[] };
    return parsed.ids?.[0] ?? null;
  } catch {
    return null;
  }
}

function extractDate(
  raw: string | null | undefined,
): { year: number; month: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { date?: string };
    if (!parsed.date) return null;
    const [yearStr, monthStr] = parsed.date.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr) - 1;
    if (Number.isNaN(year) || Number.isNaN(month)) return null;
    return { year, month };
  } catch {
    return null;
  }
}

async function findMonthGroup(
  boardId: string,
  date: { year: number; month: number },
): Promise<string> {
  const expected = `${MONTH_NAMES[date.month]} ${date.year}`;

  const { boards } = await gql<BoardGroupsResponse>(
    `query ($ids: [ID!]!) {
      boards(ids: $ids) {
        groups {
          id
          title
        }
      }
    }`,
    { ids: [boardId] },
  );

  if (boards.length === 0) {
    throw new AppError(
      502,
      `Board ${boardId} not found`,
      "MONDAY_BOARD_NOT_FOUND",
    );
  }

  const group = boards[0].groups.find(
    (g) => g.title.trim().toLowerCase() === expected.toLowerCase(),
  );

  if (!group) {
    const { create_group } = await gql<CreateGroupResponse>(
      `mutation ($boardId: ID!, $groupName: String!) {
        create_group(board_id: $boardId, group_name: $groupName) {
          id
        }
      }`,
      { boardId, groupName: expected },
    );

    logger.info(
      { boardId, groupName: expected, groupId: create_group.id },
      "Auto-created missing month group on service board",
    );

    return create_group.id;
  }

  return group.id;
}
