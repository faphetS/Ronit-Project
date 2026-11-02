import type { Db } from "../config/pg.js";
import { logger } from "../config/logger.js";
import { MIGRATIONS, type Migration } from "./migrations/index.js";

// Any constant works; it only stops two server processes migrating at the same time.
const MIGRATION_LOCK_KEY = 4_215_011;

/**
 * Applies every migration not yet recorded in schema_migrations, in order, each in its own
 * transaction. Returns the ids it applied (empty when the database is up to date).
 */
export async function migrate(db: Db, migrations: Migration[] = MIGRATIONS): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const applied: string[] = [];
  for (const migration of migrations) {
    const ran = await db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_KEY]);
      const { rows } = await tx.query("SELECT 1 FROM schema_migrations WHERE id = $1", [migration.id]);
      if (rows.length > 0) return false;
      await tx.exec(migration.sql);
      await tx.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
      return true;
    });
    if (ran) {
      applied.push(migration.id);
      logger.info({ migration: migration.id }, "CRM migration applied");
    }
  }
  return applied;
}
