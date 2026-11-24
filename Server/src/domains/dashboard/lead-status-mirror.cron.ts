import { env } from "../../config/env.js";
import type { Db } from "../../config/pg.js";
import { gql } from "../monday/monday.client.js";
import type { MirrorDeps } from "./lead-status-mirror.js";

/** The real Monday and the live CRM board. Tests pass a fake instead. */
export function mirrorDepsFromEnv(db: Db): MirrorDeps {
  return { db, gql, crmBoardId: env.MONDAY_BOARD_CRM_ID, now: () => new Date() };
}
