import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { getSetting, setSetting } from "../../config/db.js";
import { AppError } from "../../lib/errors.js";
import { deleteKnownSenderByItemId } from "../../lib/dedup.js";
import { gql } from "./monday.client.js";
import { deleteItem, getBoardGroups } from "./monday.service.js";

const SERVICE_LABEL_UMAN = 1;
const SERVICE_LABEL_CHALLAH = 3;

const TITLE_ALIASES: Record<string, string[]> = {
  "עיר": ["עיר מגורים"],
  "עיר מגורים": ["עיר"],
  "דרכון בתוקף": ["דרכון"],
  "דרכון": ["דרכון בתוקף"],
};

// name is set via item_name param; dropdown_mm2p1nvf (service) is CRM-only routing column
const SKIP_COLUMNS = new Set(["name", "dropdown_mm2p1nvf"]);

const MONTH_NAMES_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const MONTH_NAMES_HE = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
] as const;

// Cached lookup of year → Challah board ID (year boards: הפרשות חלה 26, הפרשות חלה 27 …).
// Populated lazily on first close per year; survives for the lifetime of the process.
const challahBoardCache = new Map<number, string>();

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
  if (labelId !== SERVICE_LABEL_UMAN && labelId !== SERVICE_LABEL_CHALLAH) {
    logger.warn({ itemId, serviceRaw, labelId }, "Skipping move — no valid service");
    return { moved: false, sourceItemId: itemId, skipped: "no_service" };
  }

  let targetBoardId: string;
  let targetGroupId: string;
  let inquiryTag: string | null = null;
  if (labelId === SERVICE_LABEL_CHALLAH) {
    // Only Challah needs the inquiry date — it selects the year board + month group.
    const dateRaw = colMap.get(env.MONDAY_COL_INQUIRY_DATE_ID);
    const inquiryDate = extractDate(dateRaw);
    if (!inquiryDate) {
      logger.warn({ itemId, dateRaw }, "Skipping move — no inquiry date (challah)");
      return { moved: false, sourceItemId: itemId, skipped: "no_date" };
    }
    inquiryTag = `${inquiryDate.year}-${String(inquiryDate.month + 1).padStart(2, "0")}`;
    targetBoardId = await getOrCreateChallahYearBoard(inquiryDate.year);
    targetGroupId = await findMonthGroup(targetBoardId, inquiryDate, labelId);
  } else {
    // Uman — 1 board = 1 flight = 1 group; no month grouping. The CRM inquiry
    // date is irrelevant here (active/roll-over is decided by the Uman board's
    // own flight dates), so don't gate the close on it.
    ({ boardId: targetBoardId, groupId: targetGroupId } = await getActiveUmanBoard());
  }

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
  deleteKnownSenderByItemId(String(itemId));

  logger.info(
    {
      sourceItemId: itemId,
      targetItemId: create_item.id,
      targetBoardId,
      targetGroupId,
      service: labelId,
      inquiryDate: inquiryTag,
      knownSenderCleaned: true,
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
  serviceLabelId: number,
): Promise<string> {
  // Challah year boards use Hebrew month titles (ינואר 2027 …); Uman keeps English.
  const monthName = serviceLabelId === SERVICE_LABEL_CHALLAH
    ? MONTH_NAMES_HE[date.month]
    : MONTH_NAMES_EN[date.month];
  const expected = `${monthName} ${date.year}`;

  const groups = await getBoardGroups(boardId);

  const group = groups.find(
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

interface BoardSearchResponse {
  boards: Array<{ id: string; name: string }>;
}

interface DuplicateBoardResponse {
  duplicate_board: { board: { id: string } };
}

interface UpdateGroupResponse {
  update_group: { id: string };
}

const CHALLAH_BOARD_SETTING_PREFIX = "challah_board_id:";
const UMAN_BOARD_SETTING_KEY = "current_uman_board_id";

async function getOrCreateChallahYearBoard(year: number): Promise<string> {
  const cached = challahBoardCache.get(year);
  if (cached) return cached;

  const settingKey = `${CHALLAH_BOARD_SETTING_PREFIX}${year}`;
  const persisted = getSetting(settingKey);
  if (persisted) {
    challahBoardCache.set(year, persisted);
    return persisted;
  }

  const expectedName = `הפרשות חלה ${year % 100}`;

  // Bootstrap fallback: name-search Monday for any board matching the year's
  // canonical name. Catches boards created before this code shipped (e.g. the
  // הפרשות חלה 27 we seeded earlier this session). Persist + cache so a future
  // rename can't break us.
  const { boards } = await gql<BoardSearchResponse>(
    `query { boards(limit: 200) { id name } }`,
  );
  const existing = boards.find((b) => b.name?.trim() === expectedName);
  if (existing) {
    setSetting(settingKey, existing.id);
    challahBoardCache.set(year, existing.id);
    return existing.id;
  }

  // Missing → duplicate the 2026 Challah board's structure (no items), then
  // rename each Hebrew month group from "ינואר 2026" → "ינואר ${year}".
  const dup = await gql<DuplicateBoardResponse>(
    `mutation ($boardId: ID!, $name: String!) {
      duplicate_board(
        board_id: $boardId,
        duplicate_type: duplicate_board_with_structure,
        board_name: $name
      ) { board { id } }
    }`,
    { boardId: env.MONDAY_BOARD_CHALLAH_ID, name: expectedName },
  );
  const newBoardId = dup.duplicate_board.board.id;

  const { boards: dupBoards } = await gql<BoardGroupsResponse & { boards: Array<{ groups: Array<{ id: string; title: string }> }> }>(
    `query ($ids: [ID!]!) { boards(ids: $ids) { groups { id title } } }`,
    { ids: [newBoardId] },
  );
  const groups = dupBoards[0]?.groups ?? [];

  for (const heMonth of MONTH_NAMES_HE) {
    const newTitle = `${heMonth} ${year}`;
    // 2026 template has one quirky title ("2026 דצמבר") with year-first ordering.
    const match = groups.find((g) => {
      const t = g.title.trim();
      return t === `${heMonth} 2026` || t === `2026 ${heMonth}`;
    });
    if (!match) continue;
    await gql<UpdateGroupResponse>(
      `mutation ($boardId: ID!, $groupId: String!, $value: String!) {
        update_group(
          board_id: $boardId,
          group_id: $groupId,
          group_attribute: title,
          new_value: $value
        ) { id }
      }`,
      { boardId: newBoardId, groupId: match.id, value: newTitle },
    );
  }

  logger.info(
    { year, newBoardId, expectedName },
    "Auto-created Challah year board (duplicated from 2026, renamed month groups)",
  );

  setSetting(settingKey, newBoardId);
  challahBoardCache.set(year, newBoardId);
  return newBoardId;
}

interface ItemDatesResponse {
  boards: Array<{
    items_page: {
      items: Array<{
        column_values: Array<{ text: string | null }>;
      }>;
    };
    groups: Array<{ id: string; title: string }>;
  }>;
}

export async function getCurrentUmanBoardState(): Promise<{
  boardId: string;
  isActive: boolean;
  groupId: string | null;
}> {
  const boardId = getSetting(UMAN_BOARD_SETTING_KEY) ?? env.MONDAY_BOARD_UMAN_ID;

  const data = await gql<ItemDatesResponse>(
    `query ($ids: [ID!]!, $colIds: [String!]!) {
      boards(ids: $ids) {
        groups { id title }
        items_page(limit: 500) {
          items {
            column_values(ids: $colIds) { text }
          }
        }
      }
    }`,
    { ids: [boardId], colIds: [env.MONDAY_UMAN_COL_DATE_ID] },
  );
  const board = data.boards[0];
  if (!board) {
    throw new AppError(502, `Uman board ${boardId} not found`, "MONDAY_BOARD_NOT_FOUND");
  }

  const dates = board.items_page.items
    .map((i) => i.column_values[0]?.text?.trim())
    .filter((d): d is string => !!d);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const isActive =
    dates.length === 0 ||
    today < [...dates].sort().slice(-1)[0]!;

  const groupId = board.groups[0]?.id ?? null;
  return { boardId, isActive, groupId };
}

async function getActiveUmanBoard(): Promise<{ boardId: string; groupId: string }> {
  const state = await getCurrentUmanBoardState();

  if (state.isActive) {
    if (!state.groupId) {
      throw new AppError(502, `Uman board ${state.boardId} has no groups`, "MONDAY_BOARD_NO_GROUPS");
    }
    return { boardId: state.boardId, groupId: state.groupId };
  }

  // Past flight → roll over to a fresh board duplicated from the current one.
  const monthIdx = new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem", month: "numeric" });
  const yearTwo = new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem", year: "2-digit" });
  const heMonth = MONTH_NAMES_HE[Number(monthIdx) - 1];
  const newName = `טיסה לאומן ${heMonth} ${yearTwo}`;

  const dup = await gql<DuplicateBoardResponse>(
    `mutation ($boardId: ID!, $name: String!) {
      duplicate_board(
        board_id: $boardId,
        duplicate_type: duplicate_board_with_structure,
        board_name: $name
      ) { board { id } }
    }`,
    { boardId: state.boardId, name: newName },
  );
  const newBoardId = dup.duplicate_board.board.id;

  const { boards: dupBoards } = await gql<BoardGroupsResponse>(
    `query ($ids: [ID!]!) { boards(ids: $ids) { groups { id title } } }`,
    { ids: [newBoardId] },
  );
  const newGroup = dupBoards[0]?.groups[0];
  if (!newGroup) {
    throw new AppError(502, `Duplicated Uman board ${newBoardId} has no groups`, "MONDAY_BOARD_NO_GROUPS");
  }
  await gql<UpdateGroupResponse>(
    `mutation ($boardId: ID!, $groupId: String!, $value: String!) {
      update_group(
        board_id: $boardId,
        group_id: $groupId,
        group_attribute: title,
        new_value: $value
      ) { id }
    }`,
    { boardId: newBoardId, groupId: newGroup.id, value: newName },
  );

  setSetting(UMAN_BOARD_SETTING_KEY, newBoardId);
  logger.info(
    { previousBoardId: state.boardId, newBoardId, newName },
    "Uman flight rolled over — new active board created",
  );

  return { boardId: newBoardId, groupId: newGroup.id };
}

export async function getActiveServiceBoardIds(
  service: "uman" | "challah",
): Promise<string[]> {
  if (service === "uman") {
    const state = await getCurrentUmanBoardState();
    return state.isActive ? [state.boardId] : [];
  }

  // Challah — check current year and next year's settings keys. No board
  // creation here; only return IDs that already exist in settings.
  const now = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const year = Number(now.split("-")[0]);
  const ids: string[] = [];
  for (const y of [year, year + 1]) {
    const id = getSetting(`${CHALLAH_BOARD_SETTING_PREFIX}${y}`);
    if (id) ids.push(id);
  }
  return ids;
}
