# Demo account on the real site

**Date:** 2026-11-17
**Status:** the user chose "Demo login on the real site" over a separate demo site

## Why

The user asked to "create a demo account and demo data when logged in": a login for showing the CRM to people without showing Ronit's data.

## How it works

- **The flag:** `staff_users.is_demo` (migration 008). The session tells the dashboard (`user.demo`).
- **The server:** it refuses a demo session every `/api/dashboard` route with `403 DEMO_ACCOUNT`. Leads, customers, passports, greetings, users, the log and password changes are all refused, so none of Ronit's data reaches it, even if someone calls the API by hand with the demo cookie. Signing in and out work as usual.
- **The dashboard:** while a demo account is signed in, `createServices` sends every service except the session to sample data in the browser (`src/data/demo`).
  - The sample data is the test services' fixed records, plus made-up leads over the last five weeks, customers on a made-up trip and challah months around today.
  - Changes stay in the tab and are gone on refresh.
  - Signing out switches back to the API.
- **On screen:** a "demo mode · all data is sample data" tag on every screen.
- **Making one:** from the server console only: `staff-user invite --demo --username <name> --password-stdin …`. A demo account never gets the emailed code (it has no real mailbox), and no invite email goes out.

## Out of scope

- Saving demo changes between visits.
- A sample-data reset button. A refresh resets it.
