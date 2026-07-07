import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGql = vi.hoisted(() => vi.fn());
vi.mock("./monday.client.js", () => ({ gql: mockGql }));

const mockGetSetting = vi.hoisted(() => vi.fn());
const mockSetSetting = vi.hoisted(() => vi.fn());
vi.mock("../../config/db.js", () => ({
  getSetting: mockGetSetting,
  setSetting: mockSetSetting,
}));

import {
  getCurrentUmanBoardState,
  invalidateUmanStateCache,
  findLeadOnActiveServiceBoards,
} from "./monday.webhook.service.js";
import { env } from "../../config/env.js";

function boardResponse(dates: string[] = []) {
  return {
    boards: [
      {
        groups: [{ id: "group-1", title: "Uman Group" }],
        items_page: {
          items: dates.map((d) => ({ column_values: [{ text: d }] })),
        },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSetting.mockReturnValue(null);
  mockGql.mockResolvedValue(boardResponse());
  invalidateUmanStateCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getCurrentUmanBoardState — TTL cache", () => {
  it("a second call within the TTL window returns the cached value without another gql call", async () => {
    const first = await getCurrentUmanBoardState();
    const second = await getCurrentUmanBoardState();

    expect(mockGql).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
  });

  it("refetches after invalidateUmanStateCache()", async () => {
    await getCurrentUmanBoardState();
    invalidateUmanStateCache();
    await getCurrentUmanBoardState();

    expect(mockGql).toHaveBeenCalledTimes(2);
  });

  it("bypassCache: true always fetches, even inside the TTL window", async () => {
    await getCurrentUmanBoardState();
    await getCurrentUmanBoardState({ bypassCache: true });

    expect(mockGql).toHaveBeenCalledTimes(2);
  });

  it("refetches once the TTL window has elapsed", async () => {
    vi.useFakeTimers();
    await getCurrentUmanBoardState();

    vi.advanceTimersByTime(env.MONDAY_UMAN_STATE_TTL_MS + 1);
    await getCurrentUmanBoardState();

    expect(mockGql).toHaveBeenCalledTimes(2);
  });
});

describe("findLeadOnActiveServiceBoards (F11 — shared dedup policy)", () => {
  it("returns null immediately (no gql at all) when there are no phones and no name", async () => {
    const result = await findLeadOnActiveServiceBoards("uman", [], null);
    expect(result).toBeNull();
    expect(mockGql).not.toHaveBeenCalled();
  });

  it("finds a matching lead on the active Uman board and returns its boardId", async () => {
    mockGql
      .mockResolvedValueOnce(boardResponse()) // getCurrentUmanBoardState (no flight dates → active)
      .mockResolvedValueOnce({
        boards: [
          {
            items_page: {
              items: [
                {
                  id: "item-1",
                  name: "Some Lead",
                  column_values: [{ text: "0501234567", type: "phone" }],
                },
              ],
            },
          },
        ],
      });

    const result = await findLeadOnActiveServiceBoards("uman", ["0501234567"], null);

    expect(result).toEqual({ itemId: "item-1", boardId: env.MONDAY_BOARD_UMAN_ID });
  });

  it("returns null when no board has a match", async () => {
    mockGql
      .mockResolvedValueOnce(boardResponse())
      .mockResolvedValueOnce({ boards: [{ items_page: { items: [] } }] });

    const result = await findLeadOnActiveServiceBoards("uman", ["0501234567"], null);

    expect(result).toBeNull();
  });
});
