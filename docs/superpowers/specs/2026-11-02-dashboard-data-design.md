# The dashboard's data: design

- **Date:** 2026-11-02
- **Status:** approved in chat; built on `feat/dashboard-data`
- **For:** Ronit Barash, אור הצדיק (built by Clix Solution)
- **Readers:** Justin (owner of `Server/`), and whoever builds the switch-over from Monday

## 1. Goal

Every screen of the dashboard shows Ronit's real data, and the demo data is gone. This is step 2 of 2; sign-in (step 1) is live.

Today the database holds only the staff. Leads, customers and trips live in Monday, and Justin's automations keep writing there (Instagram, the website, Facebook ads, call summaries, the close flow that moves a lead to its trip board). So the server **copies Monday into the dashboard's database** on a schedule, and the dashboard reads the copy. The team keeps working in Monday until a later switch-over.

## 2. Decisions

| Question | Choice | Why |
|---|---|---|
| Where the dashboard's leads, customers and trips come from | A read-only copy of Monday, refreshed every 2 hours from 07:00 to 23:00 Israel time, plus "sync now" for admins | Chosen in chat ("Copy from Monday"). The team and Justin's automations keep working as they are |
| Editing leads | In Monday, until the switch-over. The dashboard links each lead to its Monday row | Two places editing the same lead would fight; the copy would overwrite the dashboard's edits |
| What the dashboard owns | Customer notes, passport views, users and invites, the security switches, birthday settings | They don't exist in Monday |
| The demo data | Deleted, with the "skip Google" demo sign-in. A screen with nothing to show says so | Asked for in chat ("remove the fake data") |
| Greeting campaigns | Read from the database; nothing creates them yet, so the screen shows its empty state. Drafting a holiday's greeting comes with the greetings step | The automations are off and the server has no drafting step |
| The API's address | `/api/dashboard/*` on this server, passed on by Vercel like `/api/auth` | First-party cookies on the dashboard's host; nothing new is public |

## 3. The copy from Monday

### Boards

The copy lists the account's active boards (one call) and reads these:

| Monday board | Kind | Lands as |
|---|---|---|
| `MONDAY_BOARD_CRM_ID` (רונית - CRM) | `crm` | Leads in the pipeline |
| `MONDAY_BOARD_CRM_ARCHIVE_ID` (רונית -CRM ישן, default 5094895163) | `crm-archive` | Archived leads: searchable, never in the pipeline |
| A name with "טיסה" or "אומן" (טיסה טו באב 26) | `flight` | One trip; its rows are participants |
| A name with "הפרשות חלה" (הפרשות חלה 26, 27) | `challah` | One event per Monday month group; each row is a booking |

Columns are matched by **title**, not id, with aliases (`עיר` / `עיר מגורים`, `דרכון` / `דרכון בתוקף`), so a new year's board works without code changes.

### Cost and pacing

Monday's plan allows 1,000 API calls a day, shared with Justin's automations (no rate-limit errors in the 7 days before this step).

- One call lists the boards, and one reads every board's columns and groups.
- Monday's board `updated_at` does **not** change when rows change (the 2026 challah board said May while rows were added in September), so every copy reads every board in full: one call per 500 rows. The old CRM board, which no longer changes, is read once a day.
- Notes (Monday "updates"): each copy reads the board's feed newest first, 100 per call, down to the notes it already has (usually one call). The feed also lists notes of rows deleted or moved off the board (those aren't kept), and it misses notes edited or deleted in Monday and notes of rows moved in from another board. So once a day, and on the first copy, every row's notes are read from the row itself, 100 rows per call (about 23 calls for both boards).
- A copy is about 9 calls, about 110 a day on the schedule with the daily notes read. The first copy is about 34. A run stops at 150 calls.
- Calls go through `monday.client.ts`, so the copy shares its rate-limit circuit breaker: while Monday is limiting calls, a copy is recorded as skipped.

### Leads (the CRM boards)

Only rows with a phone become leads. On 2026-11-02, the live board had 276 of 1,104; the other 828 are Instagram chats that never left a number. The Import page counts them, and a row that gains a phone becomes a lead at the next copy.

| Dashboard field | From Monday |
|---|---|
| name, phone, email | The row's name, `מספר טלפון` (normalized like the WhatsApp gateway: 972…, no plus), `מייל` |
| service | `שירות`: contains "אומן" → `uman`; contains "חלה" → `challah`; otherwise none |
| source | `מקור ליד` "ממומן" → `facebook`; a row with `הודעה אחרונה באינסטגרם` → `instagram`; otherwise → `landing-page` |
| status | Below |
| mondayGroup | The group's title, e.g. "פולואפ" or "לידים נווה" (the group often names the agent) |
| calls, lastCallOn, inquiryOn | `כמות שיחות שבוצעו`, `שיחה אחרונה`, `תאריך פנייה` |
| lastMessage, nextStep | `הודעה אחרונה באינסטגרם`, `שלב הבא -` |
| history | The row's Monday notes, newest first |
| createdAt, updatedAt | The row's times in Monday |

**Status**, from the group title and the `נוצר קשר` column, first match wins:

1. Group contains "לא רלוונטי" → `not-relevant`; group starts with "נסגר" → `registered`.
2. The column: "לא רלוונטי" or "תרומה" → `not-relevant`; "נסגר" → `registered`; starts with "קיבלה פרטים" → `details-sent`; "נוצר קשר", "לחזור אליה שוב" or "מעוניינת להתקדם" → `talking`; "אין מענה" → `no-answer`.
3. Group contains "תרומה" → `not-relevant`; "אין מענה" → `no-answer`; a follow-up group (פולואפ, פולו אפ, פולאו אפ, פולואו אפ, פולואופ) → `talking`.
4. Otherwise `new`.

`no-answer` ("אין מענה") is a new status: 172 live leads sit there, and folding them into "new" would hide that work.

### Trips and events

- **A flight board** becomes one trip (`flight`), named as the board.
  - Each row becomes one entry on the trip (a seat), linked to a customer.
  - The trip note is the room (`חדר`).
  - `סטטוס` (תשלום חלקי, נסגר, צוות, בתהליך) is kept as the participant's Monday status.
  - `דרכון` ("יש" / "בהנפקה") is kept as Monday's passport mark. Readiness counts a passport on file or "יש".
  - Dates come from the rows' `Date` column when filled; until then the trip has no date. Capacity isn't in Monday, so trips have none.
- **A challah board** becomes one event per month group, such as "הפרשות חלה · נובמבר 2026".
  - The month's dates come from the group title. A group with no rows, and `ביטולים`, are skipped.
  - Each booking is one entry (a woman who booked twice in a month shows twice); its woman (`שם המזמינה`) is the customer. The note holds the event's type and city, and the entry its date.

### Customers

Every participant and booker is a customer.

- **The same phone and the same name are the same person**, across boards. A phone shared under another name (a mother and her daughter) is someone else, and a row without a phone is its own customer.
- A row keeps the customer it was first linked to, so a rename or a new phone in Monday follows her.
- The name and phone are the newest Monday row's, the name split at the last space (first name(s), then last name).
- The source comes from her lead with the same phone, else `שיווק` "אינסטגרם" → `instagram`, else `monday`.
- A customer that came from Monday, and no longer has a row there, a passport, notes or messages, is removed.

### Rows deleted in Monday

For each board read in a run, leads missing from it are hidden (and come back if they reappear), and trip memberships missing from it are removed. A board that disappears from the account hides its leads and trips.

### Runs

Each run is recorded with its trigger (schedule or manual), the boards it read, its counts and its number of API calls. The Import page shows the latest one. Scheduled runs need `MONDAY_COPY_ENABLED=true`; the first runs at startup when the last copy is older than 2 hours. A manual run is refused while one is running, or within 5 minutes of the last one.

## 4. Database (migration 003)

- `monday_boards`: the boards the copy knows, with kind, row count, `updated_at` in Monday, when it was last copied, the newest note copied, and when every row's notes were last read.
- `monday_copy_runs`: one row per run, as above.
- `leads`: the copied leads (fields as in section 3), unique by Monday row id, with `archived` and `removed_at`.
- `monday_notes`: Monday notes by row id (any row, so a chat that gains a phone keeps its history).
- `groups` gains `monday_key` (unique: the board, or the board and month group), `monday_board_name` and `removed_at`.
- `group_members` gets its own `id`, and one row per Monday row: `monday_item_id` (unique), `monday_status`, `monday_passport` (`yes` / `in-progress`) and `event_on`. Memberships added in the dashboard stay one per person per trip.
- `customer_notes`: notes the staff add in the dashboard.

Customers keep their existing table. Monday-born rows have `source = 'monday'` (or the source found above) and `monday_item_id` when they have no phone.

## 5. The dashboard API

Mounted at `/api/dashboard`, behind `noStore`, the sign-in dependencies, `requireDashboardOrigin` (state-changing requests come from the dashboard) and `requireStaff`. Writes are `POST`. Answers are `{ status: "ok", data }`; errors keep the server's `{ status: "error", code, message }`.

**Access** is the dashboard's permission table, enforced here:

| Area | admin | office | sales |
|---|---|---|---|
| Leads | full | full | full |
| Customers and trips | full | full | view (no notes) |
| Passports (details, intakes, views, access log) | full | full | none |
| Greetings and birthdays | full | full | none |
| Import (sync now) | full | none | none |
| Users (directory details, invites, removing, security, the log) | full | none | none |

Passports also need the user's own passport access. Everyone signed in can read the staff names (for "who did it" lines), the permission table, the latest copy's summary, and change their own name.

**Request limit:** every dashboard request reaches the server through Vercel, so all users share Vercel's address. The server's global `/api` limit (100 a minute per address) skips `/api/dashboard/`; the dashboard router limits 600 requests a minute per session instead.

**Routes**

- `leads`: `GET /leads?status&service&source&search`, `GET /leads/counts`, `GET /leads/:id`
- `customers`: `GET /customers?filter&search&page&pageSize`, `GET /customers/counts`, `GET /customers/intakes`, `GET /customers/:id`, `GET /customers/:id/messages`, `GET /customers/:id/access-log`, `POST /customers/:id/notes`, `POST /customers/:id/passport-views`
- `groups`: `GET /groups`, `GET /groups/:id`, `GET /groups/:id/participants`
- `overview`: `GET /overview/stats`, `GET /overview/activity`
- `greetings`: `GET /greetings/current`, `GET /greetings/history`, `GET /greetings/audiences`
- `birthdays`: `GET /birthdays/settings`, `POST /birthdays/settings`, `GET /birthdays/overview`
- `users`: `GET /users`, `POST /users/me`, `GET /users/permissions`, `GET /users/security`, `POST /users/security`, `GET /users/audit`, `POST /users/invites`, `POST /users/:id/remove`
- `imports`: `GET /imports/latest`, `POST /imports/run`

**Passport numbers** leave the server masked while the "mask passport numbers" switch is on. Revealing one is `POST /customers/:id/passport-views`, which logs the view (when the access log is on) and returns the number.

**Profile:** a user changes their name only. The email is what Google signs them in with, so changing it would lock them out; an admin changes it by inviting the new address.

**Removing a user** signs them out everywhere. An admin can't remove themself, and the last admin can't be removed.

## 6. The dashboard

- `createServices` builds every service on the API. `src/data/mock/` (the fixtures, the generator, the demo sign-in) and `VITE_HTTP_SERVICES` are deleted.
- Tests use a small set of test services in `src/test/` instead of the demo database.
- Screen changes:
  - **Leads:** the "אין מענה" status (a sixth board column); the table grouped by service, and filtered by status, source and service (Monday has no trip or assignee per lead); the Monday group on each lead; "open in Monday" in place of changing the status or adding a note; the Monday details (calls, last call, Instagram message, next step). A search also finds archived leads, tagged "ארכיון". The Monday strip says when the last copy ran.
  - **Customers:** Monday's passport mark while no scan is on file; the "Monday" source.
  - **Trips:** trips without a capacity or a date; past trips and events hidden; Monday's passport mark and status on participants.
  - **Import:** becomes the copy's page: the last copy, the boards, the counts (leads, archived, chats without a phone, customers, trips, notes), "sync now" for admins. "Close Monday" waits for the switch-over.
  - **Users:** "הזמנת משתמש" opens an invite form (email, name, role, passport access); admins can remove a user; the email in your own profile is read-only.
  - **Overview:** activity lines are built from typed events (a new lead, a copy, a passport), so they read in Hebrew and English.

## 7. Settings

| Name | Default | Where |
|---|---|---|
| `MONDAY_COPY_ENABLED` | `false` | `Server/.env` on the VPS: `true` to copy on the schedule |
| `MONDAY_BOARD_CRM_ARCHIVE_ID` | `5094895163` | `Server/.env` |
| `MONDAY_ACCOUNT_SLUG` | `ronit550418` | `Server/.env`: for "open in Monday" links |
| Vercel rewrite `/api/dashboard/(.*)` | | `dashboard/vercel.json` |

`VITE_HTTP_SERVICES` is removed from Vercel.

## 8. Testing

- **The mapping** (pure functions): statuses, sources, services, names, phones, month titles, aliases.
- **The copy**, on PGlite with a fake Monday: inserts, updates, rows that disappear and come back, phone merges, skipped boards, notes paging, the call cap, rate limits.
- **The API**, with supertest: each route's answer, and the access table (sales gets 403 on passports, users and import).
- **The dashboard:** the HTTP adapters (stubbed fetch), then one type-check and lint. Screens are checked by eye on the deployed site.
- **Checked on the real boards** (2026-11-02): the real copy ran into a scratch database on the server (dropped afterwards), and everything the API answered was compared with an independent read of Monday, notes from each row. All checks passed:
  - every row with a phone is a lead (277 live, 650 archived), with every field equal to Monday;
  - the 1,135 notes on CRM rows are copied word for word, and nothing else;
  - 13 trips and events with their 149 seats and bookings, one entry each;
  - 139 customers;
  - the lead counts, the pipeline, the overview and the Import page's totals.

  The check found and fixed three things: notes of deleted rows were kept, a double booking showed once, and two people sharing a phone would have been one customer.

## 9. Going live

1. Merge, then on the VPS back up `Server/.env`, add `MONDAY_COPY_ENABLED=true`, pull and rebuild `crm`. Migration 003 runs at startup, and the first copy follows.
2. Check the copy's counts against Monday.
3. Deploy the dashboard, with `/api/dashboard` routed and `VITE_HTTP_SERVICES` removed.

## 10. Not in this step

- The switch-over from Monday: leads land in the database, Justin's flows write there, Monday closes.
- Drafting, approving and test-sending holiday greetings; switching the greetings and passport automations on.
- Passport photos from WhatsApp (the channel is still undecided).
- Editing trips (dates, capacity, flights) in the dashboard.
