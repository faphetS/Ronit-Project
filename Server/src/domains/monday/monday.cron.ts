import cron from "node-cron";
import { logger } from "../../config/logger.js";
import { getSetting, setSetting } from "../../config/db.js";
import { env } from "../../config/env.js";
import { getBoardGroups, type BoardGroup } from "./monday.service.js";

export type { BoardGroup };

export interface GroupDiff {
  added: BoardGroup[];
  removed: BoardGroup[];
  renamed: Array<{ id: string; from: string; to: string }>;
}

export function diffGroups(prev: BoardGroup[], next: BoardGroup[]): GroupDiff {
  const prevById = new Map(prev.map((g) => [g.id, g.title]));
  const nextById = new Map(next.map((g) => [g.id, g.title]));

  const added: BoardGroup[] = [];
  const removed: BoardGroup[] = [];
  const renamed: Array<{ id: string; from: string; to: string }> = [];

  for (const [id, title] of nextById) {
    if (!prevById.has(id)) {
      added.push({ id, title });
    } else if (prevById.get(id) !== title) {
      renamed.push({ id, from: prevById.get(id)!, to: title });
    }
  }

  for (const [id, title] of prevById) {
    if (!nextById.has(id)) {
      removed.push({ id, title });
    }
  }

  return { added, removed, renamed };
}

const SNAPSHOT_KEY = "crm_groups_snapshot";

export async function checkCrmGroups(): Promise<void> {
  const groups = await getBoardGroups(env.MONDAY_BOARD_CRM_ID);

  const raw = getSetting(SNAPSHOT_KEY);

  if (!raw) {
    setSetting(SNAPSHOT_KEY, JSON.stringify(groups));
    logger.info({ groupCount: groups.length }, "CRM board groups snapshot stored (baseline)");
    return;
  }

  const prev = JSON.parse(raw) as BoardGroup[];
  const { added, removed, renamed } = diffGroups(prev, groups);

  if (added.length > 0 || removed.length > 0 || renamed.length > 0) {
    logger.warn({ added, removed, renamed }, "CRM board groups changed");
  }

  if (groups.every((g) => g.id !== env.MONDAY_GROUP_NEW_LEADS_ID)) {
    logger.error(
      { expectedGroupId: env.MONDAY_GROUP_NEW_LEADS_ID },
      "New-leads group missing from CRM board — lead creation will fail",
    );
  }

  setSetting(SNAPSHOT_KEY, JSON.stringify(groups));
}

export function startMondayCrons(): void {
  cron.schedule(
    "0 7 * * *",
    async () => {
      try {
        await checkCrmGroups();
      } catch (err) {
        logger.error({ err }, "Cron: CRM groups check failed");
      }
    },
    { timezone: "Asia/Jerusalem" },
  );

  logger.info("Monday cron jobs scheduled (CRM groups check daily 07:00 Asia/Jerusalem)");
}
