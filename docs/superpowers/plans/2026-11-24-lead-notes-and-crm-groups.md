# Lead notes and CRM groups: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.
> The user asked for speed, so tasks give exact interfaces, SQL, routes and test cases, but not every line of code.
> Implement by following the patterns named in each task.

**Goal:** lead notes in the CRM (add, edit, delete, with Monday's notes alongside), and groups made in the CRM (flight,
event, project) that leads join from the group's page.

**Spec:** `docs/superpowers/specs/2026-11-24-lead-notes-and-crm-groups-design.md`. Read it first; it is authoritative.

**Two tracks run in parallel in the same worktree:**
- server: Task 1, then Task 2;
- dashboard: Task 3, then Task 4, then Task 5.

The tracks touch different folders. If a commit fails on `index.lock`, wait a few seconds and commit again.

## Global constraints

- **Where to work:** the worktree `D:\work\Ronit-Project-lead-status`, branch `feat/lead-notes-groups` (off origin/main e3bb914).
  Never work in `D:\work\Ronit-Project`.
- **The migration is `010_lead_notes_and_crm_groups`.** Never rename it. The passport-bot branch's migration becomes 011.
- **Route patterns:**
  - every change is a POST behind `requireAccess(...)`, validated with zod in `dashboard.validator.ts` (`.strict()` bodies);
  - answers go through `sendData`;
  - ids go through `idParam`.
- **Permissions:**
  - notes need leads full;
  - creating, editing or removing a group, and removing a member, need customers full;
  - joining needs customers full and leads full;
  - demo sessions are refused by the router;
  - only the author or an admin edits or deletes a note.
- **Test data is made up.** Logs never carry phones.
- **Commands:**
  - the full server suite needs `MONDAY_API_TOKEN=dummy-test-token-not-real-000000 npm test` in `Server/`;
  - dashboard checks are `npm run typecheck`, `npm run lint` and `npx vitest run src/screens src/data src/ui`;
  - 5 tests in `src/app` fail on main too and are known.
- **Copy:** every new string goes into both `dashboard/src/content/*.he.ts` and `*.en.ts`. The en file is typed `Widen<typeof he>`.
- **Commits** use conventional prefixes, plus a `Co-Authored-By:` trailer naming the model that wrote them. Don't push.
- **Never commit** `.superpowers/` or local demo files.

---

### Task 1 (server): lead notes

**Files:**
- Create: `Server/src/db/migrations/010_lead_notes_and_crm_groups.ts`
- Modify: `Server/src/db/migrations/index.ts`
- Create: `Server/src/domains/dashboard/lead-notes.service.ts`
- Modify: `Server/src/domains/dashboard/leads.service.ts`
- Modify: `Server/src/domains/dashboard/dashboard.validator.ts`
- Modify: `Server/src/domains/dashboard/dashboard.routes.ts`
- Tests: `Server/src/domains/dashboard/dashboard.routes.test.ts`, in a new describe "lead notes".

**The migration SQL**, exactly:

```sql
CREATE TABLE lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  by_user_id uuid REFERENCES staff_users (id) ON DELETE SET NULL,
  at timestamptz NOT NULL DEFAULT now(),
  text text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 2000),
  edited_at timestamptz
);
CREATE INDEX lead_notes_lead_idx ON lead_notes (lead_id, at DESC);
ALTER TABLE leads ADD COLUMN customer_id uuid REFERENCES customers (id) ON DELETE SET NULL;
ALTER TABLE groups DROP CONSTRAINT groups_kind_check;
ALTER TABLE groups ADD CONSTRAINT groups_kind_check CHECK (kind IN ('flight', 'event', 'project'));
```

Export it as `LEAD_NOTES_AND_CRM_GROUPS`, give it a short header comment, and register it as
`{ id: "010_lead_notes_and_crm_groups", sql: ... }`.

**`lead-notes.service.ts`:**

```ts
export interface LeadNoteDto { id: string; at: string; text: string; byUserId: string | null; editedAt: string | null }
export async function addLeadNote(db: Queryable, leadId: string, byUserId: string, text: string, now: Date): Promise<LeadNoteDto>
export async function editLeadNote(db: Queryable, editor: { id: string; role: Role }, leadId: string, noteId: string, text: string, now: Date): Promise<LeadNoteDto>
export async function deleteLeadNote(db: Queryable, editor: { id: string; role: Role }, leadId: string, noteId: string): Promise<void>
```

- `addLeadNote` throws `NotFoundError("Lead")` for a missing or removed lead (`removed_at`).
- Edit and delete throw `NotFoundError("Note")` when the note doesn't exist on that lead.
- Edit and delete throw `new AppError(403, "Only the note's author or an admin can change it", "NOT_YOUR_NOTE")` when the
  editor is neither the author nor an admin.
- `Role` comes from `../auth/auth.service.js`.

**History in `leads.service.ts`:**
- `LeadEventDto` gains `source: "crm" | "monday"` and `editedAt: string | null`. A CRM note has `byUserId` set to the
  staff id, `author: null` and `mondayBoard: null`. A Monday note has `source: "monday"` and `editedAt: null`.
- `getLead` merges both kinds, newest first.
- The list's `last_note` subquery takes the newest of a CRM note or a Monday note.
- `LeadDto` gains `customerId: string | null` (the `l.customer_id` column).

**The validator:** `LeadNoteSchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict()`.

**The routes**, after the existing `/leads/:id/status` route:
- `POST /leads/:id/notes` → 201 with the note;
- `POST /leads/:id/notes/:noteId` → 200 with the note;
- `POST /leads/:id/notes/:noteId/delete` → 200 with `{ deleted: true }`.

All three use `requireAccess("leads", "full")`. Validate the ids with `idParam`. The editor is
`{ id: staffOf(req).user.id, role: staffOf(req).user.role }`.

**Tests (TDD), in a new describe "lead notes":**
1. Adding a note saves it, and the lead's history shows it first, with `source: "crm"`, `byUserId` and `editedAt: null`.
   Monday notes are still there with `source: "monday"`.
2. Editing your own note changes the text and sets `editedAt`.
3. Another office user gets 403 `NOT_YOUR_NOTE` on edit and on delete, but an admin (ronit) can edit and delete.
4. Delete removes it from the history.
5. A note on lead A addressed through lead B gives 404. A bad body (empty, or 2001 characters) gives 400. View-only gets
   403 `NO_ACCESS`.
6. The list's `lastNote` becomes the new CRM note's text.

Then run the full suite, typecheck and lint, and commit as `feat: notes on each lead in the CRM`.

### Task 2 (server): groups in the CRM, and leads joining them

Do this after Task 1, which owns the migration.

**Files:**
- Create: `Server/src/domains/dashboard/crm-groups.service.ts`
- Modify: `Server/src/domains/dashboard/groups.service.ts`, for the DTO fields
- Modify: `Server/src/domains/dashboard/lead-status.service.ts`, to extract the status change
- Modify: `Server/src/domains/dashboard/leads.service.ts`, for the detail's `groups`
- Modify: `dashboard.validator.ts` and `dashboard.routes.ts`
- Tests: `dashboard.routes.test.ts`, in a new describe "groups in the CRM".

**Refactor `lead-status.service.ts`:** extract

```ts
applyStatusChange(tx: Queryable, crmBoardId: string, change: StatusChange, now: Date): Promise<"changed" | "unchanged">
```

It holds the body of today's transaction: select `FOR UPDATE`, compare, update, audit. `setLeadStatus` becomes
`db.transaction((tx) => applyStatusChange(tx, ...))`. Behavior is unchanged, and the existing tests must still pass.

**`groups.service.ts`:**
- `GroupDto.type` becomes `"flight" | "event" | "project"`, and it gains `fromCrm: boolean` (`monday_key IS NULL`).
- `GroupParticipantDto` gains `addedInCrm: boolean` (`monday_item_id IS NULL`).
- Removed groups stay out of lists, as today.

**`crm-groups.service.ts`:**

```ts
export interface NewGroup { name: string; type: "flight" | "event" | "project"; startsOn?: string | null; endsOn?: string | null; capacity?: number | null }
export async function createGroup(db: Queryable, input: NewGroup, now: Date): Promise<string>
export async function updateGroup(db: Queryable, id: string, patch: Partial<NewGroup>, now: Date): Promise<void>
export async function removeGroup(db: Queryable, id: string, now: Date): Promise<void>
export async function joinGroup(db: Db, crmBoardId: string, groupId: string, leadId: string, byUserId: string, now: Date): Promise<{ customerId: string; alreadyMember: boolean; statusChanged: boolean }>
export async function removeMember(db: Queryable, groupId: string, memberId: string): Promise<void>
```

- **`createGroup`** inserts `name`, `short_name` (= the name), `kind` (= the type), `starts_on`, `ends_on`, `capacity`,
  and `monday_key NULL`. It returns the new group's id.
- **`updateGroup` and `removeGroup`** throw `NotFoundError("Group")` for an unknown or removed group, and
  `AppError(409, "This group comes from Monday", "MONDAY_GROUP")` when it has a `monday_key`. `removeGroup` sets
  `removed_at`.
- **`joinGroup`** follows the spec's six steps in one `db.transaction`, using `applyStatusChange` for the status step
  (with status `"registered"`).
  - Find the customer by phone: `SELECT id FROM customers WHERE phone = $1 ORDER BY created_at DESC LIMIT 1`.
  - Create it with `splitName` from `../monday-copy/monday-copy.mapping.js`.
  - The audit row: `INSERT INTO audit_log (at, by_user_id, action, customer_id, details)` with action
    `lead-joined-group` and details `{ leadId, groupId }`.
- **`removeMember`** throws `NotFoundError("Member")` when the member isn't in that group, and
  `AppError(409, "This participant comes from Monday", "MONDAY_MEMBER")` when it has a `monday_item_id`.

**The lead detail:** `getLead` adds `groups: Array<{ id: string; name: string; type: string }>`. These are the active
groups (`removed_at IS NULL`) that `leads.customer_id` is a member of, ordered by name. Lists leave it out.

**The validators:**
- `NewGroupSchema`:
  - `name`: `z.string().trim().min(1).max(80)`;
  - `type`: `z.enum(["flight","event","project"])`;
  - `startsOn` and `endsOn`: optional nullable days, using the existing `isDay` check;
  - `capacity`: optional nullable `z.number().int().min(1).max(1000)`;
  - `.strict()`, with a refine that the end is not before the start.
- `GroupPatchSchema`: the same fields, all optional, `.strict()`, with the same refine.
- `JoinGroupSchema = z.object({ leadId: z.string().uuid() }).strict()`.

**The routes:**

| Route | Access | Answer |
|---|---|---|
| `POST /groups` | customers full | 201, with `getGroup` of the new id |
| `POST /groups/:id` | customers full | `getGroup` |
| `POST /groups/:id/remove` | customers full | `{ removed: true }` |
| `POST /groups/:id/members` | customers full, then leads full (two `requireAccess`) | `{ customerId, alreadyMember }` |
| `POST /groups/:id/members/:memberId/remove` | customers full | `{ removed: true }` |

For `POST /groups/:id/members`, when the status changed and the mirror is enabled, `await mirrorSoon(mirror.deps(db(res)), leadId)`.

**Tests (TDD), in a new describe "groups in the CRM", using `post(...)` and the fake Monday:**
1. Creating a project group lists it with `type: "project"` and `fromCrm: true`. Editing renames it. Removing hides it
   from `/groups`. A Monday group refuses edit and remove with 409 `MONDAY_GROUP`.
2. Bad bodies give 400 (empty name, unknown type, end before start).
3. Joining a CRM lead (item "101") creates a customer with that phone and adds a participant with `addedInCrm: true`.
   The lead's detail shows `customerId` and the group, its status is `registered`, its label "נסגר" was written to the
   fake Monday, and audit has `lead-joined-group`.
4. Joining again returns `alreadyMember: true` and doesn't add a second participant.
5. A lead whose phone matches an existing customer reuses that customer.
6. An old-board lead (item "91") joins, but nothing is written to Monday.
7. Removing a CRM-added member works. A Monday member gives 409 `MONDAY_MEMBER`.
8. Permissions:
   - sales with customers "view" (`users/permissions`) gets 403 on create and join;
   - office with leads "view" gets 403 on join;
   - demo gets 403.

Then run the full suite, typecheck and lint, and commit as `feat: groups made in the CRM, and leads joining them`.

### Task 3 (dashboard): the data layer for notes and groups

**Files:**
- Modify: `dashboard/src/data/types.ts`, `services.ts`, `http/leads.ts`, `http/groups.ts`, `test/services.ts`, `data/demo/demoServices.ts`, `data/queries.ts`
- Modify: `dashboard/src/test/leads.ts`, so `testLead` has `customerId: null`
- Tests: `dashboard/src/data/queries.test.tsx`, `dashboard/src/data/demo/demoServices.test.ts`

**Types:**
- `LeadEvent` gains `source: "crm" | "monday"` and `editedAt: string | null`.
- `Lead` gains `customerId: string | null` and an optional `groups?: Array<{ id: string; name: string; type: GroupType }>`.
- The group type union gains `"project"`. Use the existing name if there is one; otherwise add
  `GroupType = "flight" | "event" | "project"`.
- The group summary gains `fromCrm: boolean`.
- `GroupParticipant` gains `addedInCrm: boolean`.

**Services:**
- `LeadsService` gains:
  - `addNote(id, text): Promise<LeadEvent>`;
  - `editNote(id, noteId, text): Promise<LeadEvent>`;
  - `deleteNote(id, noteId): Promise<void>`.
- `GroupsService` gains:
  - `create(input: { name; type; startsOn?; endsOn?; capacity? }): Promise<GroupSummary>`;
  - `update(id, patch): Promise<GroupSummary>`;
  - `remove(id): Promise<void>`;
  - `addLead(id, leadId): Promise<{ customerId: string; alreadyMember: boolean }>`;
  - `removeMember(id, memberId): Promise<void>`.
- The HTTP versions post to the Task 1 and 2 routes. Copy the pattern of `setStatus` and `customers.addNote`.
- **Test services:** a missing lead or group rejects with `NotFoundError`, the same way `get` does in the test services today.
- **Demo services:** all of it works in memory.
  - Notes are kept per lead, with `byUserId` = the demo user's id.
  - Groups are created with `fromCrm: true`.
  - `addLead` creates or links a made-up customer, adds a participant with `addedInCrm: true`, sets the lead's status to
    `registered`, and adds the group to the lead's `groups`.

**Hooks in `queries.ts`:**
- `useAddLeadNote()`, `useEditLeadNote()` and `useDeleteLeadNote()` refresh the lead's detail and the leads lists.
- `useCreateGroup()`, `useUpdateGroup()`, `useRemoveGroup()`, `useAddLeadToGroup()` and `useRemoveGroupMember()` refresh
  `["groups"]` and `["leads"]`, plus `["overview"]` and `["customers"]` where they're affected.
- Keep it simple: no optimistic updates. A note shows after the save resolves.

**Tests:**
- the demo test covers each new method;
- a hooks test shows `useAddLeadNote` refreshing the lead's detail, and `useAddLeadToGroup` refreshing the group's
  participants.

Commit as `feat(dashboard): notes and group actions in the data layer`.

### Task 4 (dashboard): notes and groups on the lead's card

**Files:**
- Modify: `dashboard/src/screens/leads/LeadDetailParts.tsx` (`LeadHistory`, a new `LeadGroups`)
- Modify: `LeadSidePanel.tsx` and `LeadPhoneDetail.tsx`, to render `LeadGroups`
- Modify: `content/leads.he.ts` and `.en.ts`
- Tests: `dashboard/src/screens/leads/LeadNotes.test.tsx`

**`LeadHistory` ("Notes and calls"):**
- With `useCan("leads","full")`, it shows a `TextArea` and a "שמירה" (save) button, and adds the note through `useAddLeadNote`.
  The box clears on success; a toast explains a failure.
- The list renders `lead.history`:
  - CRM notes show the author's first name, found through the existing staff lookup pattern (see
    `screens/customers/useStaffLookup.ts`);
  - Monday notes show their author and a small "Monday" tag;
  - an edited note says so.
- For CRM notes by the signed-in user, or for admins: "עריכה" (edit) swaps in a textarea with save and cancel, and
  "מחיקה" (delete) asks first, using the existing `ConfirmDialog`.

**`LeadGroups` ("קבוצות"):** links to `/groups/:id` for each of `lead.groups`. With none, "עוד לא בקבוצה" / "Not in a group yet".

**Tests:**
- adding a note calls `addNote`, and the box clears;
- edit and delete appear only on your own CRM notes;
- a Monday note shows the Monday tag;
- groups render as links.

Commit as `feat(dashboard): write, edit and delete notes on a lead, and see its groups`.

### Task 5 (dashboard): groups made in the CRM, and adding leads

**Files:**
- Modify: `dashboard/src/screens/groups/*`. Read `GroupsScreen.tsx`, `GroupDetails.tsx`, `GroupCards.tsx` and
  `groups.ts` first.
- Modify: `content/groups.he.ts` and `.en.ts`
- Create: `dashboard/src/screens/groups/GroupSheet.tsx` and `dashboard/src/screens/groups/AddLeadToGroup.tsx`
- Tests: `dashboard/src/screens/groups/CrmGroups.test.tsx`

**The groups screen:** a "קבוצה חדשה" (new group) button for `useCan("customers","full")` opens `GroupSheet`.
- Follow the pattern of `screens/users/InviteSheet.tsx` and `ui/Sheet.tsx`.
- The sheet has:
  - a name;
  - a type, with `Segmented`: טיסה / אירוע / פרויקט;
  - optional start and end dates (native date inputs);
  - an optional capacity.
- Saving creates the group and navigates to `/groups/:id`.
- The project type shows the label "פרויקט" / "Project" wherever group types are shown. Pick an existing icon.

**A group's page:**
- When `group.fromCrm` (and customers full): "עריכה" opens `GroupSheet` filled in; "הסרת הקבוצה" asks to confirm,
  removes, and goes back to `/groups`.
- **`AddLeadToGroup`**, shown with customers full and leads full:
  - a search field: at 2+ characters, use `useLeads({ search })` and list up to 8 leads (name, phone, status);
  - each has "הוספה" → `useAddLeadToGroup`;
  - the toast says "{name} הצטרפה לקבוצה" (en "{name} joined the group"), or "כבר בקבוצה" (en "Already in the group")
    when `alreadyMember`;
  - errors give a warning toast.
- Participants with `addedInCrm` get a remove button with a confirm step, through `useRemoveGroupMember`.

**Tests:**
- creating a group navigates to it;
- a CRM group shows edit and remove, and a Monday group doesn't;
- searching and adding a lead calls `addLead`;
- the remove button shows only for `addedInCrm`.

Commit as `feat(dashboard): make groups in the CRM and add leads to them`.

### Task 6: checks, review, hand-off (the controller does this)

1. Full server checks; dashboard typecheck, lint, tests and build.
2. A headless Chrome check on the local demo:
   - add a note;
   - edit and delete it;
   - create a project group;
   - add a lead to it;
   - see it on the lead's card.
3. A final whole-branch review, then one round of fixes.
4. Hand-off. Deploy only on "push live". After the deploy, run Supabase's `lockdown.sql`, because of the new table.
