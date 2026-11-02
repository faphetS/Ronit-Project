import { CRM_FOUNDATION } from "./001_crm_foundation.js";

export interface Migration {
  /** Never rename or reorder: applied ids are recorded in schema_migrations. */
  id: string;
  sql: string;
}

// TypeScript modules rather than .sql files, because tsc copies only .ts into dist/.
export const MIGRATIONS: Migration[] = [{ id: "001_crm_foundation", sql: CRM_FOUNDATION }];
