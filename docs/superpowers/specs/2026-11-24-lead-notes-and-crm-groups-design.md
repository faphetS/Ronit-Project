# Lead notes and groups in the CRM: design

2026-11-24. The CRM's own notes and groups, so the work no longer depends on Monday (parts 3 and 4 of the plan in
`2026-11-24-lead-status-crm-first-design.md`).

## Decisions (with the user, 2026-11-24)

- **Notes are CRM only.**
  - Each lead has its own notes: add, edit, delete.
  - Monday's notes keep showing in the same timeline, read-only, marked as from Monday.
  - Nothing is written to Monday.
- **Groups can be created in the CRM:** a flight, an event or a project.
- **Putting a lead into a group means the lead joins it:**
  - a customer card is found by phone, or created;
  - the person becomes a participant of the group;
  - the lead's status becomes Registered, and Monday's label follows as for any status change.
  Monday's trip boards are not changed.

## Lead notes

- **Table `lead_notes`:**

  | Column | Type |
  |---|---|
  | `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
  | `lead_id` | `uuid NOT NULL REFERENCES leads (id) ON DELETE CASCADE` |
  | `by_user_id` | `uuid REFERENCES staff_users (id) ON DELETE SET NULL` |
  | `at` | `timestamptz NOT NULL DEFAULT now()` |
  | `text` | `text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 2000)` |
  | `edited_at` | `timestamptz` |

  It has an index on `(lead_id, at DESC)`.
- **Routes**, all needing `requireAccess("leads", "full")`:
  - `POST /api/dashboard/leads/:id/notes` with `{ text }` (trimmed, 1–2000 characters) → 201 with the note.
  - `POST /api/dashboard/leads/:id/notes/:noteId` with `{ text }` edits it and sets `edited_at`.
  - `POST /api/dashboard/leads/:id/notes/:noteId/delete` deletes it.
  - Editing and deleting are for the note's author, or an admin. Anyone else gets 403 `NOT_YOUR_NOTE`.
  - A missing lead or note, or a note of another lead, gets 404.
- **The lead's history** (`getLead`) holds the CRM notes and Monday's notes, newest first.
  - Each event gains `source: "crm" | "monday"` and `editedAt: string | null`.
  - A CRM note has `byUserId` set to the staff id and `author: null`.
  - A Monday note is unchanged.
  - The list's `lastNote` is the newest of either kind.

## Groups in the CRM

- **Migration:** `groups.kind` also allows `'project'`. Its CHECK constraint is `groups_kind_check`.
- **`GroupDto`:** `type` gains `"project"`, and a new field `fromCrm: boolean` is true when the group has no `monday_key`. Only
  groups made in the CRM can be edited or removed in the CRM.
- **Routes for groups**, all needing `requireAccess("customers", "full")`:
  - `POST /api/dashboard/groups` creates a group → 201 with the group. The body:
    - `name`: trimmed, 1–80 characters;
    - `type`: `"flight" | "event" | "project"`;
    - `startsOn` and `endsOn`: optional, YYYY-MM-DD, with the end not before the start;
    - `capacity`: optional, 1–1000.
  - `POST /api/dashboard/groups/:id` edits it: any of `name`, `startsOn`, `endsOn` or `capacity`; `null` clears a date or
    the capacity.
  - `POST /api/dashboard/groups/:id/remove` sets `removed_at`.
  - Editing or removing a Monday group gives 409 `MONDAY_GROUP`. An unknown or removed group gives 404.
- **Joining:** `POST /api/dashboard/groups/:id/members` with `{ leadId }`. It needs customers full AND leads full. In one
  transaction:
  1. **Checks:** the group exists and isn't removed, and the lead exists and isn't removed. Otherwise 404.
  2. **The customer card:**
     - the lead's linked customer (`leads.customer_id`);
     - else the newest customer with the same phone;
     - else a new customer: `splitName(lead.name)` for the names, `phone = lead.phone`, `source = lead.source`, `from_monday = false`.
  3. **Membership:**
     - if the customer already has any membership in the group, nothing is added and `alreadyMember` is true;
     - otherwise one `group_members` row is added (`group_id`, `customer_id`, with no `monday_item_id`).
  4. **The link:** `leads.customer_id` is set to the customer.
  5. **The status:** the lead becomes `registered` through the same code as the status route: `status_changed_at` and
     `by` are set, the label "נסגר" waits for live-board leads, and the `lead-status-changed` audit row is written. This
     is skipped if the lead is already registered.
  6. **Audit:** an `audit_log` row with action `lead-joined-group`, the `customer_id`, and details `{ leadId, groupId }`.

  After the commit, the route tells Monday the way the status route does (`mirrorSoon`). The response is
  `{ customerId, alreadyMember }`.
- **Removing:** `POST /api/dashboard/groups/:id/members/:memberId/remove` (customers full) works only on members added in
  the CRM (no `monday_item_id`):
  - a member from Monday gives 409 `MONDAY_MEMBER`;
  - an unknown member gives 404;
  - the lead's status doesn't change.
- **Participants:** each one gains `addedInCrm: boolean`.
- **The lead DTO** gains `customerId: string | null`. Its detail (`getLead`) gains `groups: Array<{ id, name, type }>`: the
  active groups its customer is in.
- **The Monday copy** leaves all of this alone:
  - it touches only groups with a `monday_key`;
  - it deletes only members with a `monday_item_id`;
  - it deletes only customers it made (`from_monday`).

## Dashboard

- **The lead card's "Notes and calls":**
  - a note box and a "שמירה" (save) button, for full Leads access;
  - the CRM notes and Monday's in one list, newest first;
  - a CRM note shows the staff member's first name. Its author, or an admin, can edit it in place or delete it, with a
    confirm step;
  - a Monday note shows its author and a "Monday" tag.
- **The lead card's "Groups" section:** links to each group the person is in. With none, it says "עוד לא בקבוצה".
- **The Groups screen:** a "קבוצה חדשה" (new group) button, for full Customers access, opens a sheet. The sheet has:
  - a name;
  - the type (טיסה / אירוע / פרויקט);
  - start and end dates;
  - a capacity.
  Saving opens the new group.
- **A group's page:**
  - CRM groups have "עריכה" (edit, the same sheet) and "הסרת הקבוצה" (remove the group, with a confirm step).
  - "הוספת ליד" (add a lead), for customers full and leads full: type at least 2 characters of a name or phone, and
    matching leads are listed through `GET /leads?search=`. Each row has "הוספה" (add), which joins the lead.
    - A toast says the lead joined, and the participants refresh.
  - Participants added in the CRM have a remove button, with a confirm step.
- **The demo services** do all of this in memory.

## Rollout

- **Migration 010 adds a table** (`lead_notes`). After deploying, run `/root/handover-2026-11-25/lockdown.sql` against
  Supabase.
- **The local passport-bot branch's migration** becomes 011.
- **Deploy** the server, then Vercel, only on the user's "push live".

## Testing

- **Server route tests:** every route, every permission, author-or-admin for notes, Monday groups and members refused,
  and joining (a new customer, a phone match, already a member, status Registered with the label waiting, an old-board
  lead).
- **Dashboard tests:** the hooks, and the components' main paths.
- **A headless Chrome check** on the local demo.
