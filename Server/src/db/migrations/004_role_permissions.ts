/**
 * What each role may do in each area of the dashboard. Admins change it on the users screen.
 * Admins aren't in the table: they always have full access. Some cells stay as they are (the
 * CHECKs below): sales never see passports, and only admins manage users.
 */

/** The table the dashboard started with (docs/superpowers/specs/2026-11-02-dashboard-data-design.md, section 5). */
export const ROLE_PERMISSIONS_SEED = `
INSERT INTO role_permissions (role, area, access) VALUES
  ('office', 'leads', 'full'), ('sales', 'leads', 'full'),
  ('office', 'customers', 'full'), ('sales', 'customers', 'view'),
  ('office', 'passports', 'full'), ('sales', 'passports', 'none'),
  ('office', 'greetings', 'full'), ('sales', 'greetings', 'none'),
  ('office', 'import', 'none'), ('sales', 'import', 'none'),
  ('office', 'users', 'none'), ('sales', 'users', 'none');
`;

export const ROLE_PERMISSIONS = `
CREATE TABLE role_permissions (
  role text NOT NULL CHECK (role IN ('office', 'sales')),
  area text NOT NULL CHECK (area IN ('leads', 'customers', 'passports', 'greetings', 'import', 'users')),
  access text NOT NULL CHECK (access IN ('full', 'view', 'none')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES staff_users (id) ON DELETE SET NULL,
  PRIMARY KEY (role, area),
  CONSTRAINT role_permissions_sales_no_passports CHECK (NOT (role = 'sales' AND area = 'passports' AND access <> 'none')),
  CONSTRAINT role_permissions_users_admins_only CHECK (area <> 'users' OR access = 'none')
);
${ROLE_PERMISSIONS_SEED}`;
