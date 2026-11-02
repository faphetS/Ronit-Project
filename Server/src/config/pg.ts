import pg from "pg";
import { env } from "./env.js";
import { logger } from "./logger.js";

/** What the CRM code needs from Postgres: parameterised queries and plain SQL scripts. */
export interface Queryable {
  query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
  /** Runs a script of one or more statements, without parameters (migrations). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  /** Runs fn on one connection between BEGIN and COMMIT, and rolls back if it throws. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

// DATE columns come back as "YYYY-MM-DD" strings. The default (a Date at local midnight)
// shifts a birthday by a day in any timezone east or west of UTC.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (value: string) => value);

function clientQueryable(client: pg.PoolClient): Queryable {
  return {
    async query<R>(text: string, values?: unknown[]) {
      const result = await client.query(text, values);
      return { rows: result.rows as R[] };
    },
    async exec(sql: string) {
      // No values: node-postgres uses the simple protocol, which allows several statements.
      await client.query(sql);
    },
  };
}

/** A Db over a node-postgres pool. */
export function poolDb(pool: pg.Pool): Db {
  return {
    async query<R>(text: string, values?: unknown[]) {
      const result = await pool.query(text, values);
      return { rows: result.rows as R[] };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(clientQueryable(client));
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

let crmPool: pg.Pool | null = null;
let crmDb: Db | null = null;

/**
 * The CRM database (the `postgres` service in the compose stack), or null when
 * DATABASE_URL is not set — the passport and greeting automations then stay off and
 * nothing else in the server changes.
 */
export function getCrmDb(): Db | null {
  if (!env.DATABASE_URL) return null;
  if (!crmDb) {
    const pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    // An idle client losing its connection must not crash the server.
    pool.on("error", (err) => logger.error({ err }, "Postgres pool error"));
    crmPool = pool;
    crmDb = poolDb(pool);
  }
  return crmDb;
}

/** Closes the pool, so a one-off script can exit. */
export async function closeCrmDb(): Promise<void> {
  const pool = crmPool;
  crmPool = null;
  crmDb = null;
  await pool?.end();
}
