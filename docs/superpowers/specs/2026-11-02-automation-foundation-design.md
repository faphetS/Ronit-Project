# Automation foundation: design

- **Date:** 2026-11-02
- **Status:** approved in chat; built on `feat/automation-foundation`
- **For:** Ronit Barash, אור הצדיק (built by Clix Solution)
- **Readers:** Justin (owner of `Server/`), and whoever builds the next steps

## 1. Goal

The PRD's automations run inside the existing server on Ronit's Hostinger VPS, on a Postgres database next to it:

- passports that arrive on WhatsApp become customer records;
- birthday greetings go out automatically;
- holiday greetings go out in an organized process, with their history kept.

This step builds the foundation: the database, its tables, and both automation pipelines. Everything stays switched off until a WhatsApp connection and real data are ready.

## 2. Decisions

| Question | Choice | Why |
|---|---|---|
| Where the automations run | New domains in `Server/`: `passports` and `greetings` | The server already has Israel-time crons, the WhatsApp gateway, OpenRouter, phone normalization and the allowlist |
| Database | Postgres 17 in Docker on the VPS, reached only by `crm` | One server and no extra bill; set up on 2026-11-02 (section 3) |
| How the dashboard gets data | Through the server's API at `api.ronitbarash.site` (next step) | The database is private to the server |
| WhatsApp connection | Still open | The `ronit-send` gateway carries text only, so photos can't arrive through it yet |
| Monday | Stays the lead CRM until the import and cutover | Out of scope here |

Until the WhatsApp connection is decided:

- greetings leave through a channel interface, either `dry-run` (the default, which only logs) or the existing `gateway` (text);
- a script feeds passport photos to the intake for testing;
- DualHook (the PRD's choice) plugs in behind the same interface if it's chosen.

## 3. On the VPS (done 2026-11-02)

**The database**
- Service `postgres` (`postgres:17-alpine`) in `/root/docker-compose.yml`, on the stack's private network.
- No published port.
- Data in the `root_postgres_data` volume.
- Credentials in `/root/postgres.env`, readable by root only.

**Backups**
- `/usr/local/bin/ronit-pg-backup.sh`, run by `/etc/cron.d/ronit-postgres-backup` at 01:15 UTC.
- Writes `pg_dump --format=custom` to `/opt/ronit-backups` and keeps 14 days.
- Not yet copied off the server.

**Before the change**
- The compose file was backed up to `/root/docker-compose.yml.bak.1793610203`.
- `crm`, `n8n` and `traefik` weren't restarted.

**To switch it on**
1. Add `DATABASE_URL=postgres://ronit:<password from /root/postgres.env>@postgres:5432/ronit` to `Server/.env`.
2. Deploy as usual.

## 4. How it fits together

```
WhatsApp photo (channel, later) ─┐
scripts/ingest-passport (now)   ─┴─► passports: save photo → AI reads it → check the MRZ → match → customer + passport

node-cron, Asia/Jerusalem
  every hour   → birthdays: queue today's and tomorrow's greetings, by the Shabbat rule
  every minute → campaigns: queue a scheduled holiday greeting, staggered at its rate
               → outbox: send what's due through the channel, behind RONIT_WA_ALLOWED_NUMBERS
  every 5 min  → passports: retry intakes that failed
```

Rules the code follows:

- **It never takes the server down.** If `DATABASE_URL` is unset or a migration fails, the new crons don't start, and the Instagram, Monday, Salestrail and WhatsApp flows run as before.
- **Off by default.** `PASSPORTS_ENABLED` and `GREETINGS_ENABLED` default to `false`. The channel defaults to `dry-run`. Every real send passes `RONIT_WA_ALLOWED_NUMBERS`, the same switch as the Uman flows.
- **No double sends.**
  - Each message has a unique dedup key.
  - Messages are claimed with `FOR UPDATE SKIP LOCKED`.
  - A message interrupted mid-send is marked failed and is never resent automatically. A missed greeting can be resent by hand; a double one can't be undone.

## 5. Database

Migrations are TypeScript modules in `Server/src/db/migrations/`, because `tsc` copies only `.ts` into `dist/`. They're applied at startup, in order, each in a transaction under an advisory lock, and recorded in `schema_migrations`.

Migration `001_crm_foundation`:

| Table | Holds |
|---|---|
| `staff_users` | Ronit's team: role (admin, office, sales) and passport access; sign-in comes with the dashboard API |
| `customers` | Hebrew and Latin names, phone (`9725…`, no plus), source, Monday item, greetings opt-out |
| `passports` | One per customer: number, nationality, sex, birth, issue and expiry dates, photo path, how it came in |
| `groups`, `group_members` | Trips and events, and who's registered (holiday audiences) |
| `passport_intakes` | Each photo received: status (`received`, `matched`, `new-card`, `needs-review`, `not-passport`, `failed`), a reason code, what the AI read, attempts |
| `campaigns` | Holiday greetings: text with tokens, audience, send time, rate (default 50 every 10 minutes), status as on the dashboard |
| `birthday_settings` | One row: on/off, send time, Shabbat rule, template |
| `messages` | The outbox and the history: dedup key, recipient, the exact text, send time, status, failure |
| `audit_log` | Sensitive actions, such as a passport received |

## 6. Passport intake

1. **Save the photo** to `PASSPORT_FILES_DIR` (`/data/passports`, so `/opt/ronit-data/passports` on the host). Files are `0600` and the folder is `0700`. A photo already received from the same message ID is skipped.
2. **The AI reads it.** The OpenRouter vision model is `OPENROUTER_PASSPORT_MODEL`, with `provider.data_collection: "deny"`. It returns whether this is a passport data page, the Hebrew and Latin names, the dates, and the two MRZ lines.
3. **Check the MRZ.** Passport details are written automatically only when:
   - the ICAO 9303 check digits hold;
   - the AI's confidence is at least `PASSPORT_MIN_CONFIDENCE`;
   - there's a name and a birth date.

   The MRZ values win over the AI's reading, because they're checksummed. Anything less goes to review, with what was read kept for the office.
4. **Match by name, as the PRD says.**
   - Names are compared ignoring niqqud, punctuation, final letters, case and word order. A middle name on the passport still matches.
   - **One customer with that name:** the passport is added to that card. Their phone is filled in if it was empty.
   - **Several customers with that name:** the one with the sender's number wins. With no such customer, it goes to review.
   - **No customer with that name:** a new card is created with the sender's number. If that number belongs to someone else (a parent sending a child's passport), the reason says so.
5. **One transaction** writes the customer, the passport, the intake result and an audit entry.

Reasons are stored as codes, so the dashboard shows them in Hebrew or English.

## 7. Greetings

**Birthdays (every hour)**
- Skipped while turned off or while the template is empty.
- Looks at today and tomorrow, Israel time, so that "before Shabbat" can send a Saturday birthday on Friday.
- 29 February falls on 28 February in other years.
- If the send time already passed earlier the same day, the greeting goes now. A missed Friday send for a Saturday birthday is skipped rather than sent on Shabbat.
- Dedup key: `birthday:<customer>:<year>`.

**Holiday greetings (every minute)**
- A `scheduled` campaign whose send time has come queues one message per recipient: everyone, or the chosen groups. Recipients need a phone and no opt-out.
- The i-th message goes out at `start + floor(i / rate) × every` minutes.
- The campaign then moves to `sending`, and to `completed` when nothing is left.
- Dedup key: `holiday:<campaign>:<customer>`.

**Tokens**
- `{שם פרטי}`, `{שם הקבוצה}` and `{גיל}`, the same as the dashboard's `MESSAGE_TOKENS`.
- The filled text is stored on the message, so the history shows exactly what was sent.

**Outbox (every minute)**
- Claims at most `GREETINGS_MAX_PER_RUN` due messages.
- Skips numbers the allowlist doesn't open (`skipped`, `not-allowed`).
- Waits `GREETINGS_PACING_MS` between sends.
- A message still `sending` after 15 minutes is marked `failed`, `interrupted`.

## 8. Settings

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | unset | The CRM database; unset keeps all of this off |
| `PASSPORTS_ENABLED` | `false` | Retry failed intakes every 5 minutes |
| `PASSPORT_FILES_DIR` | `/data/passports` | Where photos are kept |
| `OPENROUTER_PASSPORT_MODEL` | `google/gemini-2.5-flash` | The vision model |
| `PASSPORT_MIN_CONFIDENCE` | `0.8` | Below this, a passport goes to review |
| `GREETINGS_ENABLED` | `false` | Queue and send birthday and holiday greetings |
| `GREETINGS_CHANNEL` | `dry-run` | `dry-run` or `gateway` |
| `GREETINGS_MAX_PER_RUN` | `10` | Sends per minute, at most |
| `GREETINGS_PACING_MS` | `3000` | Pause between sends |

## 9. Testing

- Vitest, in the server's existing style.
- The SQL runs against PGlite, which is Postgres in WebAssembly, added as a dev dependency. That means:
  - the migration, the queueing and the claim queries are tested on real Postgres;
  - no Docker is needed.
- PGlite 0.5 runs Postgres 18 while the server runs 17. The SQL here works the same on both.
- Pure logic gets unit tests: MRZ check digits, name matching, the Shabbat rule and DST.

## 10. Not in this step

- The dashboard API and sign-in with 2-step codes.
- The WhatsApp connection: photos in, delivery receipts, and Meta templates if it's DualHook.
- The Monday import, and moving lead creation from Monday to Postgres.
- Creating draft holiday campaigns ahead of each holiday.
- Copying the database and the passport photos off the server.
- Encrypting passport photos at rest.
