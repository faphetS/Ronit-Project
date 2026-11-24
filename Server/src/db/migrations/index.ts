import { CRM_FOUNDATION } from "./001_crm_foundation.js";
import { STAFF_SIGN_IN } from "./002_staff_sign_in.js";
import { MONDAY_COPY } from "./003_monday_copy.js";
import { ROLE_PERMISSIONS } from "./004_role_permissions.js";
import { WHATSAPP_TEMPLATES } from "./005_whatsapp_templates.js";
import { PASSWORD_SIGN_IN } from "./006_password_sign_in.js";
import { TWO_STEP_EXEMPT } from "./007_two_step_exempt.js";
import { DEMO_ACCOUNTS } from "./008_demo_accounts.js";
import { LEAD_STATUS_IN_CRM } from "./009_lead_status_in_crm.js";
import { LEAD_NOTES_AND_CRM_GROUPS } from "./010_lead_notes_and_crm_groups.js";
import { LEAD_NOTE_MENTIONS } from "./011_lead_note_mentions.js";

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
  { id: "005_whatsapp_templates", sql: WHATSAPP_TEMPLATES },
  { id: "006_password_sign_in", sql: PASSWORD_SIGN_IN },
  { id: "007_two_step_exempt", sql: TWO_STEP_EXEMPT },
  { id: "008_demo_accounts", sql: DEMO_ACCOUNTS },
  { id: "009_lead_status_in_crm", sql: LEAD_STATUS_IN_CRM },
  { id: "010_lead_notes_and_crm_groups", sql: LEAD_NOTES_AND_CRM_GROUPS },
  { id: "011_lead_note_mentions", sql: LEAD_NOTE_MENTIONS },
];
