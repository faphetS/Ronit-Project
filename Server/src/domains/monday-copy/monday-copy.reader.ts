import { AppError } from "../../lib/errors.js";
import type { MondayBoardInfo, MondayColumn, MondayGroup, MondayNote, MondayRow } from "./monday-copy.mapping.js";

/** monday.client.ts's gql, or a fake in tests. */
export type Gql = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

/** A safety net: a copy normally takes about 9 calls, the first one about 40. */
export class CopyCallLimitError extends AppError {
  constructor(limit: number) {
    super(503, `The copy stopped at its limit of ${limit} Monday calls`, "COPY_CALL_LIMIT");
  }
}

const ROWS_PER_CALL = 500;
const NOTES_PER_CALL = 100;
const ITEMS_PER_CALL = 100;

const ROW_FIELDS = "id name created_at updated_at group { id } column_values { id text }";

interface RawRow {
  id: string;
  name: string | null;
  created_at: string;
  updated_at: string;
  group: { id: string } | null;
  column_values: Array<{ id: string; text: string | null }>;
}

interface RawPage {
  cursor: string | null;
  items: RawRow[];
}

function toRow(raw: RawRow): MondayRow {
  const values: Record<string, string> = {};
  for (const value of raw.column_values) if (value.text) values[value.id] = value.text;
  return { id: raw.id, name: raw.name ?? "", groupId: raw.group?.id ?? "", createdAt: raw.created_at, updatedAt: raw.updated_at, values };
}

export interface MondayReader {
  /** Calls made so far. */
  calls(): number;
  /** The account's active boards. */
  listBoards(): Promise<MondayBoardInfo[]>;
  /** The columns and groups of several boards, in one call. */
  readStructure(boardIds: string[]): Promise<Map<string, { columns: MondayColumn[]; groups: MondayGroup[] }>>;
  /** Every row of a board, 500 per call. */
  readRows(boardId: string): Promise<MondayRow[]>;
  /**
   * A board's notes newer than `since` (all of them without it), newest first, 100 per call.
   * `complete` is false when it stopped at `maxCalls` before reaching `since` or the end.
   */
  readNotes(boardId: string, since: Date | null, maxCalls: number): Promise<{ notes: MondayNote[]; complete: boolean }>;
  /** Every note of these rows, from each row itself, 100 rows per call. Exact, but a call per 100 rows. */
  readItemNotes(itemIds: string[]): Promise<MondayNote[]>;
}

/** Reads Ronit's boards; read-only. Stops the whole copy at `maxCalls`. */
export function mondayReader(gql: Gql, maxCalls: number): MondayReader {
  let calls = 0;

  function call<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    if (calls >= maxCalls) throw new CopyCallLimitError(maxCalls);
    calls += 1;
    return gql<T>(query, variables);
  }

  return {
    calls: () => calls,

    async listBoards() {
      const data = await call<{ boards: Array<{ id: string; name: string; type: string | null; updated_at: string | null; items_count: number | null }> }>(
        "query { boards(limit: 200, state: active) { id name type updated_at items_count } }",
      );
      return data.boards
        .filter((board) => board.type === "board")
        .map((board) => ({ id: String(board.id), name: board.name, updatedAt: board.updated_at, items: board.items_count ?? 0 }));
    },

    async readStructure(boardIds) {
      const structure = new Map<string, { columns: MondayColumn[]; groups: MondayGroup[] }>();
      if (boardIds.length === 0) return structure;
      const data = await call<{ boards: Array<{ id: string; columns: MondayColumn[]; groups: MondayGroup[] }> }>(
        "query ($ids: [ID!]) { boards(ids: $ids) { id columns { id title } groups { id title } } }",
        { ids: boardIds },
      );
      for (const board of data.boards) structure.set(String(board.id), { columns: board.columns, groups: board.groups });
      return structure;
    },

    async readRows(boardId) {
      const first = await call<{ boards: Array<{ items_page: RawPage }> }>(
        `query ($ids: [ID!]) { boards(ids: $ids) { items_page(limit: ${ROWS_PER_CALL}) { cursor items { ${ROW_FIELDS} } } } }`,
        { ids: [boardId] },
      );
      let page: RawPage | undefined = first.boards[0]?.items_page;
      const rows = (page?.items ?? []).map(toRow);
      while (page?.cursor) {
        const next: { next_items_page: RawPage } = await call(
          `query ($cursor: String!) { next_items_page(limit: ${ROWS_PER_CALL}, cursor: $cursor) { cursor items { ${ROW_FIELDS} } } }`,
          { cursor: page.cursor },
        );
        page = next.next_items_page;
        rows.push(...page.items.map(toRow));
      }
      return rows;
    },

    async readNotes(boardId, since, maxNoteCalls) {
      const sinceMs = since?.getTime() ?? Number.NEGATIVE_INFINITY;
      const notes: MondayNote[] = [];
      for (let page = 1; page <= maxNoteCalls; page += 1) {
        const data = await call<{
          boards: Array<{ updates: Array<{ id: string; item_id: string | null; created_at: string; text_body: string | null; creator: { name: string } | null }> }>;
        }>(`query ($ids: [ID!], $page: Int!) { boards(ids: $ids) { updates(limit: ${NOTES_PER_CALL}, page: $page) { id item_id created_at text_body creator { name } } } }`, {
          ids: [boardId],
          page,
        });
        const updates = data.boards[0]?.updates ?? [];
        let reachedKnown = false;
        for (const update of updates) {
          if (Date.parse(update.created_at) <= sinceMs) {
            reachedKnown = true;
            continue;
          }
          const body = update.text_body?.trim();
          if (!update.item_id || !body) continue;
          notes.push({ id: String(update.id), itemId: String(update.item_id), at: update.created_at, author: update.creator?.name ?? null, body });
        }
        if (reachedKnown || updates.length < NOTES_PER_CALL) return { notes, complete: true };
      }
      return { notes, complete: false };
    },

    async readItemNotes(itemIds) {
      const notes: MondayNote[] = [];
      for (let start = 0; start < itemIds.length; start += ITEMS_PER_CALL) {
        const data = await call<{
          items: Array<{ id: string; updates: Array<{ id: string; created_at: string; text_body: string | null; creator: { name: string } | null }> }>;
        }>(`query ($ids: [ID!]) { items(ids: $ids, limit: ${ITEMS_PER_CALL}) { id updates(limit: 100) { id created_at text_body creator { name } } } }`, {
          ids: itemIds.slice(start, start + ITEMS_PER_CALL),
        });
        for (const item of data.items) {
          for (const update of item.updates) {
            const body = update.text_body?.trim();
            if (body) notes.push({ id: String(update.id), itemId: String(item.id), at: update.created_at, author: update.creator?.name ?? null, body });
          }
        }
      }
      return notes;
    },
  };
}
