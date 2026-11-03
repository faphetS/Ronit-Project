import { CRM_FOUNDATION } from "./001_crm_foundation.js";
import { STAFF_SIGN_IN } from "./002_staff_sign_in.js";
import { MONDAY_COPY } from "./003_monday_copy.js";
import { ROLE_PERMISSIONS } from "./004_role_permissions.js";

export interface Migration {
  /** Never rename or reorder: applied ids are recorded in schema_migrations. */
  id: string;
  sql: string;
}

// TypeScript modules rather than .sql files, because tsc copies only .ts into dist/.
export const MIGRATIONS: Migration[] = [
  { id: "001_crm_foundation", sql: CRM_FOUNDATION },
  { id: "002_staff_sign_in", sql: STAFF_SIGN_IN },
  { id: "003_monday_copy", sql: MONDAY_COPY },
  { id: "004_role_permissions", sql: ROLE_PERMISSIONS },
];
