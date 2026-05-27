import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";
import { gql } from "./monday.client.js";
import { deleteItem } from "./monday.service.js";

const LABEL_ID_TO_BOARD: Record<number, string> = {
  1: env.MONDAY_BOARD_UMAN_ID,
  2: env.MONDAY_BOARD_POLAND_ID,
  3: env.MONDAY_BOARD_CHALLAH_ID,
};

const TITLE_ALIASES: Record<string, string[]> = {
  "עיר": ["עיר מגורים"],
  "עיר מגורים": ["עיר"],
  "דרכון בתוקף": ["דרכון"],
  "דרכון": ["דרכון בתוקף"],
};

// name is set via item_name param; dropdown_mm2p1nvf (service) is CRM-only routing column
const SKIP_COLUMNS = new Set(["name", "dropdown_mm2p1nvf"]);

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

interface ColumnValue {
  id: string;
  value: string | null;
}

interface ColumnInfo {
  id: string;
  title: string;
}

interface BoardColumnsResponse {
  boards: Array<{ columns: ColumnInfo[] }>;
}

async function getColumnTitles(boardId: string): Promise<ColumnInfo[]> {
  const data = await gql<BoardColumnsResponse>(
    `query ($ids: [ID!]!) { boards(ids: $ids) { columns { id title } } }`,
    { ids: [boardId] },
  );
  return data.boards[0]?.columns ?? [];
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

export interface MoveResult {
  moved: boolean;
  sourceItemId: number;
  targetItemId?: string;
  targetBoardId?: string;
  skipped?: "no_service" | "no_date";
}

export async function moveClosedItem(
  itemId: number,
): Promise<MoveResult> {
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
    logger.warn({ itemId, serviceRaw }, "Skipping move — no valid service");
    return { moved: false, sourceItemId: itemId, skipped: "no_service" };
  }

  const dateRaw = colMap.get(env.MONDAY_COL_EVENT_DATE_ID);
  const eventDate = extractDate(dateRaw);
  if (!eventDate) {
    logger.warn({ itemId, dateRaw }, "Skipping move — no date of event");
    return { moved: false, sourceItemId: itemId, skipped: "no_date" };
  }

  const targetBoardId = LABEL_ID_TO_BOARD[labelId];
  const targetGroupId = await findMonthGroup(targetBoardId, eventDate);

  const [crmCols, targetCols] = await Promise.all([
    getColumnTitles(env.MONDAY_BOARD_CRM_ID),
    getColumnTitles(targetBoardId),
  ]);

  const targetColIds = new Set(targetCols.map((c) => c.id));
  const targetByTitle = new Map(targetCols.map((c) => [c.title, c.id]));

  const columnValues: Record<string, unknown> = {};
  for (const cv of item.column_values) {
    if (!cv.value || SKIP_COLUMNS.has(cv.id)) continue;

    let targetColId: string | null = null;

    if (targetColIds.has(cv.id)) {
      targetColId = cv.id;
    }

    if (!targetColId) {
      const crmCol = crmCols.find((c) => c.id === cv.id);
      if (crmCol) {
        const exactMatch = targetByTitle.get(crmCol.title);
        if (exactMatch) {
          targetColId = exactMatch;
        }
        if (!targetColId) {
          const aliases = TITLE_ALIASES[crmCol.title];
          if (aliases) {
            for (const alias of aliases) {
              const aliasMatch = targetByTitle.get(alias);
              if (aliasMatch) {
                targetColId = aliasMatch;
                break;
              }
            }
          }
        }
      }
    }

    if (targetColId) {
      try {
        columnValues[targetColId] = JSON.parse(cv.value) as unknown;
      } catch {
        columnValues[targetColId] = cv.value;
      }
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

  await deleteItem(String(itemId));

  logger.info(
    {
      sourceItemId: itemId,
      targetItemId: create_item.id,
      targetBoardId,
      targetGroupId,
      service: labelId,
      eventDate: `${eventDate.year}-${String(eventDate.month + 1).padStart(2, "0")}`,
    },
    "Item moved from CRM to service board (original deleted)",
  );

  return {
    moved: true,
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
