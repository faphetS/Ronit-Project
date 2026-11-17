/**
 * Demo accounts: someone signs in and the dashboard shows sample data instead of Ronit's. The
 * server refuses such a session every /api/dashboard route, so none of her real data reaches
 * it. Made from the server console only (staff-user invite --demo).
 */
export const DEMO_ACCOUNTS = `
ALTER TABLE staff_users ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
`;
