/**
 * A special account that never gets the emailed code: the person signs in with the password
 * (or Google) alone. Set from the server console only (staff-user two-step), never from the
 * dashboard, and shown on the users screen and in the access log.
 */
export const TWO_STEP_EXEMPT = `
ALTER TABLE staff_users ADD COLUMN two_step_exempt boolean NOT NULL DEFAULT false;
`;
