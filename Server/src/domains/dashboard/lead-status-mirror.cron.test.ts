import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
const scheduled = vi.hoisted(() => [] as Array<{ expression: string; job: () => Promise<void> }>);
vi.mock("../../lib/cron-job.js", () => ({
  scheduleExclusive: (expression: string, _label: string, job: () => Promise<void>) => {
    scheduled.push({ expression, job });
  },
}));

import type { Db } from "../../config/pg.js";
import { MIRROR_SCHEDULE, startLeadStatusMirror } from "./lead-status-mirror.cron.js";

describe("the lead status retry job", () => {
  it("runs every 2 minutes where the Monday copy is on, and sends the labels that are due", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const db = { query, exec: vi.fn(), transaction: vi.fn() } as unknown as Db;
    startLeadStatusMirror(db, false);
    expect(scheduled).toHaveLength(0);
    startLeadStatusMirror(db, true);
    expect(MIRROR_SCHEDULE).toBe("*/2 * * * *");
    expect(scheduled.map((entry) => entry.expression)).toEqual([MIRROR_SCHEDULE]);
    await scheduled[0].job();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("monday_label_pending IS NOT NULL"), expect.any(Array));
  });
});
