# Lead status in the CRM, kept in step with Monday: design

2026-11-24. Part 1 of making the CRM stand on its own next to Monday and the Google Sheets.

## Why

Ronit's team wants to change a lead's status in the CRM by dragging its card to another column on the leads board. A
press outside the open lead's side panel should also close it.

The CRM must not depend on Monday or the sheets to do this. Both keep working exactly as today, and the CRM keeps Monday
in step. Later parts take the rest of the way:

1. **Statuses** (this spec).
2. New leads come straight into the CRM from each source (Meta forms, Instagram, the landing page, calls), and still go
   to Monday and the sheet.
3. The daily work moves into the CRM, copied to Monday: notes, assigning leads to agents, next steps.
4. Trips and registration move into the CRM, copied to Monday's trip boards.

## Decisions (with the user, 2026-11-24)

- **The CRM decides the status.** A change is saved in the CRM first, and it stands even if Monday is down.
- **Monday gets the change on the lead's "נוצר קשר" label only.** That's the label the office sets by hand. The CRM
  never moves leads between Monday groups: the groups name the agent or the campaign.
- **Changes made in Monday still come into the CRM** through the 2-hourly copy.
- **Registered only sets the label "נסגר".** Putting someone on a trip still means moving the lead into "נסגרו" in
  Monday, until part 4.
  - Moving a lead into "נסגרו" fires Monday's webhook 180612969.
  - The server then creates the lead on the trip's board (or the challah month), and deletes it from the CRM board.
- **The sheets aren't involved.** They're Meta's lead-form exports, with no status column.

## What the team sees

### Dragging on the board (desktop)

- **Picking a card up.** Pressing a card and moving it at least 6 px picks it up. The card lifts and follows the
  pointer, and the column under it lights up. A press without moving still opens the lead, and a drag never opens it.
- **Dropping it.** Dropping it in another column moves it there at once, and that's final in the CRM.
- **The folded "Not relevant" column takes drops too.** Its count goes up by one.
- **A drop in the column the card came from changes nothing.** For example, a "details sent" lead dropped back into
  In progress.
- **Who can drag.** Only staff with full access to Leads (`useCan("leads", "full")`). For everyone else the board
  works as today.
- **No success message.** The card moving is the confirmation. A failed save puts the card back and shows a toast
  saying why: no access, or the lead is no longer on the board.

| Column | CRM status | Monday "נוצר קשר" label |
|---|---|---|
| New | `new` | cleared |
| In progress | `talking` | נוצר קשר |
| No answer | `no-answer` | אין מענה |
| Registered | `registered` | נסגר |
| Not relevant | `not-relevant` | לא רלוונטי |

All four labels are on the live board (in use on 2026-11-24: אין מענה 228, נוצר קשר 201, לא רלוונטי 55, נסגר 2).

### Without dragging

The status in the lead's header becomes a button that opens a menu of the five statuses, with the current one marked.
It's for staff with full Leads access. It appears in the side panel on desktop and on the lead screen on phones.

- Choosing one saves the same way a drop does.
- Choosing the status the lead already has does nothing. In progress covers "details sent".
- Phones have no board, so this is how phones change a status.
- It is also the non-dragging way to do it on desktop (WCAG 2.5.7).

### When Monday is behind

While a lead's new label hasn't reached Monday, the "In Monday" section of the lead's card says so: "The status
hasn't reached Monday yet. Trying again in a few minutes." The board itself shows nothing.

### Click outside closes the lead (desktop)

While a lead is open in the floating side panel, a press anywhere outside the panel closes it, the same as ✕ or Escape.
These presses don't close it:

- a press on another lead's card, which opens that lead instead;
- presses inside menus, pop-ups, dialogs and toasts;
- presses with a button other than the main one;
- the press that starts a drag.

## Server

### Setting a status: `POST /api/dashboard/leads/:id/status`

The body is `{ status: "new" | "talking" | "no-answer" | "registered" | "not-relevant" }`, validated in
`dashboard.validator.ts`. The route needs `requireAccess("leads", "full")`. Demo sessions never reach it (`refuseDemo`).

1. **The lead can't be found:** 404 when it doesn't exist or was removed from Monday (`removed_at` set).
2. **Same status:** answers 200 with the lead. Nothing is written, sent or logged.
3. **Otherwise, in one transaction:**
   - Set `status`, `status_changed_at = now`, `status_changed_by = the staff member`, `monday_sync_attempts = 0` and
     `monday_sync_error = NULL`.
   - Set `monday_label_pending` to the new label (`''` for cleared), for leads on the live CRM board
     (`MONDAY_BOARD_CRM_ID`). Old-board leads change in the CRM only, so for them it stays `NULL`.
   - Add an `audit_log` row: action `lead-status-changed`, `by_user_id`, and details `{ leadId, from, to }`.
     - It isn't added to the users screen's list of sensitive actions.
4. **After the commit, tell Monday:** try once right away and wait up to 4 seconds. Answer with the lead whatever
   Monday did. The CRM's change already stands.
   - If Monday hasn't answered by then, the call carries on in the background and clears the pending label when it
     succeeds.

### Keeping Monday in step

The mirror lives in one new unit with one job, `lead-status-mirror.ts` in the dashboard domain:

- **`labelFor(status)`:** the table above.
- **`mirrorStatus(deps, leadId)`:** reads the lead's pending label and writes it to Monday:
  - **The column:** "נוצר קשר" is found by its title on the lead's board, read once per board per server run, then
    cached. The copy finds columns by title the same way.
  - **The call:** `change_column_value` through `gql` in `monday.client.ts`, so it shares the rate-limit circuit
    breaker with the automations and the copy. The value is `{"label": "…"}`, or `{}` to clear the label. Labels are
    never created: a missing label is an error.
  - **Only the live board:** a lead on any other board gets no label in Monday. Its pending label is cleared, the
    reason is kept in `monday_sync_error`, and nothing is sent.
  - **One write per lead at a time, in order:** calls for the same lead wait for each other, so an older label never
    lands in Monday after a newer one. This holds for one server process.
  - **When Monday accepts:** compare and clear.

    ```sql
    UPDATE leads SET monday_label_pending = NULL, contact_status = <label, or NULL when cleared>,
           monday_sync_attempts = 0, monday_sync_error = NULL
     WHERE id = $1 AND monday_label_pending = <the label sent>
    ```

    A newer drag made meanwhile stays pending.
  - **When Monday fails:** `monday_sync_attempts + 1`, a short `monday_sync_error`, and `monday_sync_next_at`. That's
    now + 2 minutes for the first 30 attempts (about an hour), then now + 1 hour. The lead stays pending.
  - **When the lead has left Monday:** the copy has marked it removed (`removed_at`). Pending is cleared with that
    reason kept, since there's nothing left to update. Monday's own error texts aren't parsed for this.
- **The retry job:** a cron job every 2 minutes.
  - It takes at most 20 pending leads whose `monday_sync_next_at` is empty or due, oldest first.
  - Each is retried until Monday accepts.
  - A Monday rate-limit error ends the run.
  - Logs carry the lead's id, never its phone.

Monday's own history shows the change under the account the server's Monday key belongs to. The CRM's `audit_log`
has the staff member.

### The copy brings in Monday's edits, not echoes of the CRM's

`saveLeads` in `monday-copy.repository.ts` stops overwriting `status` and `contact_status` unconditionally. It keeps
the CRM's values when any of these is true:

1. **A change is on its way to Monday:** `leads.monday_label_pending IS NOT NULL`.
2. **The CRM changed the status after this copy began:** `leads.status_changed_at > $copyStart`. `$copyStart` is the
   `at` that `copyBoards` takes before reading any board, so it covers a drag made while the copy was reading Monday.
3. **Nothing about the status changed in Monday:** `monday_group` and `contact_status` equal what Monday says now, NULL
   matching NULL.

Otherwise it takes Monday's: an edit made in Monday is newer. `monday_group` and every other column always take
Monday's value, as today. A lead that is new to the CRM takes Monday's status, as today.

### Data: migration `009_lead_status_in_crm`

New columns on `leads`:

| Column | Type |
|---|---|
| `status_changed_at` | `timestamptz NULL` |
| `status_changed_by` | `uuid NULL REFERENCES staff_users (id) ON DELETE SET NULL` |
| `monday_label_pending` | `text NULL` |
| `monday_sync_attempts` | `integer NOT NULL DEFAULT 0` |
| `monday_sync_error` | `text NULL` |
| `monday_sync_next_at` | `timestamptz NULL` |

There is also a partial index on `leads (monday_sync_next_at) WHERE monday_label_pending IS NOT NULL`, for the retry
job.

The local `feat/passport-bot` branch's migration must now become 010.

### Lead data for the dashboard

`LeadDto` gains `mondayPending: boolean`, true when `monday_label_pending IS NOT NULL`. The dashboard's `Lead` type,
the test fixtures and the demo data gain the same field.

## Dashboard

- **Services:**
  - `LeadsService.setStatus(id, status): Promise<Lead>`;
  - `http/leads.ts` posts it;
  - `demoServices.ts` changes the made-up lead in memory, with `mondayPending: false`, so the demo account's board
    drags too.
- **`useSetLeadStatus()`** in `queries.ts`:
  - moves the lead at once in every cached leads list and in the lead's own detail, through the existing
    `changeCached`;
  - rolls back on error with `rollBack`;
  - refreshes `["leads"]` and `["overview"]` when settled.
- **The drag:** `@dnd-kit/core`, pinned at 6.3.1, the only new package. Its peer dependency is React ≥ 16.8.
  - **In `LeadsKanban`:** a `DndContext` with the pointer sensor (6 px activation distance) and a `DragOverlay` that
    renders the card above the columns. The columns scroll and clip, so a card dragged inside them would be cut off.
  - **Drop targets:** every `BoardColumn` and the `FoldedColumn`. A column maps to its status as in the table.
  - **Animation:** the cards' existing layout animation carries the card into its new column.
  - **Screen-reader announcements** come from the copy files, in Hebrew and English.
- **The status menu:** a new `LeadStatusSelect`. In `LeadDetailParts` it replaces the header's status tag for full
  access.
  - It's a native `<select>` styled like the status tag, built the way `SelectChip` is. Keyboard, screen readers and
    the phone's own picker work with no extra code.
  - `SelectChip` itself doesn't fit: it treats its first option as "all".
- **The pending line:** `LeadInMonday` shows it when `lead.mondayPending`.
- **Click outside:** a small hook, `useCloseOnOutsidePress(panelRef, onClose)`, used by `LeadsDesktopPage` while a lead
  is open. It follows the rules above.
- **Copy:** `leads.he.ts` and `leads.en.ts` hold the menu label, the pending line, the toast texts and the drag
  announcements.

## Errors

| What fails | What happens |
|---|---|
| The CRM save: network, 403, 404 | The card goes back to its column, the menu shows the old status, and a toast says why |
| The Monday write | The CRM keeps the change; the lead's card shows the pending line; the job retries |
| Monday rate-limits | The retry run stops; the next run tries again |
| A copy runs during a drag | The CRM's status stays (condition 1 or 2 above) |

## Testing

- **Server (Vitest, PGlite through `createTestDb`, a fake Monday client):**
  - **The route:** full access saves; view or none gets 403; demo gets 403; a bad body gets 400; a removed lead gets
    404; the same status does nothing.
  - **What a save writes:** status, `audit_log` and the pending label for live-board leads; no pending label for
    old-board leads.
  - **The Monday call in the request:** Monday answering clears pending and sets `contact_status`. Monday failing keeps
    pending and adds an attempt.
  - **The mirror:**
    - each label, including clearing;
    - compare and clear keeps a newer pending label;
    - a lead the copy marked removed clears pending with the reason kept;
    - a rate limit ends the run.
  - **The copy:**
    - keeps the CRM's status while a change is pending;
    - keeps it when the status changed after the copy began;
    - keeps it when Monday's group and label are unchanged;
    - takes Monday's when the label or the group changed;
    - gives a new lead Monday's status.
- **Dashboard (Vitest and Testing Library):**
  - **Drops:** a drop in another column calls `setStatus` with the column's status; a drop in the same column does
    nothing; there's no drag without full access; a failed save puts the card back and shows the toast.
  - **The menu** works and is offered only with full access.
  - **Click outside:** a press outside closes the panel; a press on another card opens that lead; presses in the menu
    or a dialog don't close it.
  - **The pending line** shows while `mondayPending` is true.
- **Live, before saying it works:**
  - On the demo account, in headless Chrome: drag between columns, the menu, and click outside.
  - One real Monday write only with the user's OK: change one real lead's label, then change it back.

## Rollout

- **The pull request:** to `faphetS/Ronit-Project`, with a security review, then merge.
- **The new server:** a database backup and a rollback image first. Then pull, migrate to 009 and rebuild the crm.
- **The dashboard:** Vercel production.
- **When:** only on the user's "push live".
- **Afterwards, tell Ronit's team:** statuses can now be changed in the CRM, by dragging or with the status button, and
  Monday's label follows. Registering someone on a trip is still done in Monday.

## Not in this part

- New leads straight into the CRM (part 2).
- Notes, assigning agents, next steps (part 3).
- Trips and registration (part 4).
- Moving leads between Monday groups.
- Writing to the Google Sheets.
