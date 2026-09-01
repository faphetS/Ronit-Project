# Ronit Barash CRM Automation

Backend-only automation for an Israeli religious-influencer client. Ingests leads from Instagram DMs, classifies them with an LLM, routes to the right Monday.com service board, transcribes sales calls, runs weekly follow-ups, and orchestrates holiday-greeting campaigns. **Monday.com is the UI — there is no frontend in this repo.**

## Tech stack

- Node.js 22 LTS, TypeScript strict, ES modules (`"type": "module"`, imports use `.js` suffix)
- Express 5
- Zod (validation), Pino (logging), Helmet, HPP, cors, cookie-parser, express-rate-limit, dotenv
- Vitest + Supertest (tests)
- ESLint flat config, typescript-eslint
- Planned (not yet wired): Supabase Postgres + Storage, pg-boss (queue on Postgres, no Redis), node-cron

## Where things live

- [Server/](Server/) — the Express service (only deployable here)
- [Server/src/server.ts](Server/src/server.ts) — entry point, full middleware stack
- [Server/src/config/](Server/src/config/) — env, logger (and supabase when added)
- [Server/src/lib/](Server/src/lib/) — `errors.ts` (AppError + global handler), `classify.ts` (OpenRouter lead classifier)
- [Server/src/middleware/](Server/src/middleware/) — `requestId`, `validate` (Zod)
- [Server/src/routes/index.ts](Server/src/routes/index.ts) — domain routers mount here, served at `/api`
- [Server/src/domains/](Server/src/domains/) — one folder per integration; pattern is `{name}.controller.ts`, `{name}.service.ts`, `{name}.routes.ts`, `{name}.validator.ts`
  - `meta/` — Instagram DM webhook ingest, HMAC verification, lead classification (fully implemented)
  - `monday/` — GraphQL client + lead-row creation service (partially implemented — no webhook handler yet)
- [Server/scripts/](Server/scripts/) — utility scripts (`inspect-monday.ts`, `restructure-monday.ts`)
- [rawNote.md](rawNote.md) — original business requirements notes
- [PLAN.md](PLAN.md) — full domain plan (flows, board structure, env vars, Hebrew column values)
- [.claude/agents/](.claude/agents/) — `backend-expert`, `supabase-expert`
- [.claude/skills/](.claude/skills/) — `nodejs-backend-typescript`, `supabase`

## Architecture rules (CRITICAL — follow these)

- **Domain-driven structure** — new features go in [Server/src/domains/{name}/](Server/src/domains/) and mount in [Server/src/routes/index.ts](Server/src/routes/index.ts).
- **Env access** — always import `env` from [Server/src/config/env.ts](Server/src/config/env.ts). Never read `process.env` directly. New vars go through the Zod schema.
- **Logging** — always use `logger` from [Server/src/config/logger.ts](Server/src/config/logger.ts). Never `console.log`.
- **Errors** — throw `AppError` from [Server/src/lib/errors.ts](Server/src/lib/errors.ts). Never throw a generic `Error`. The global handler catches `AppError` and `ZodError` automatically.
- **Validation** — use the `validate({ body?, params?, query? })` middleware with Zod schemas, not ad-hoc parsing in controllers.
- **Webhook signature verification** — verify HMAC BEFORE parsing the body. See "Pitfalls" below.
- **No `any`** — strict mode is on; use `unknown` and narrow.

## Implemented data flow

**Instagram DM → Classification → Monday.com CRM**

1. Meta sends POST to `/api/meta/webhook` with raw body
2. `meta.controller.ts` verifies HMAC-SHA256 against raw bytes (timing-safe)
3. Parses JSON, validates against `MetaWebhookPayloadSchema`
4. For each text message, calls `handleIncomingMessage()` in `meta.service.ts`
5. `classify.ts` sends message to OpenRouter LLM → returns `{interested, service, extractedName, extractedPhone, confidence}`
6. If interested, `monday.service.ts` creates a lead row in the CRM board via GraphQL
7. Always returns 200 to Meta (prevents retries)

## Middleware order (do not change without reason)

requestId → CORS → Helmet → pino-http (autoLogging skips `/health`) → `express.raw` (on `/api/meta/webhook` only, 1 MB) → `express.json` (1 MB) → `express.urlencoded` (1 MB) → cookie-parser → HPP → `/api` rate limit → routes → 404 → globalErrorHandler

Graceful SIGTERM/SIGINT shutdown is wired; do not bypass it.

## Subagents — when to use which

- **backend-expert** — any Express / Node / TS work: routes, controllers, services, validators, middleware, error handling, tests. Reads the `nodejs-backend-typescript` skill before acting.
- **supabase-expert** — any Postgres / migration / RLS / Storage / Edge Function / type-generation work. Reads the `supabase` skill before acting.
- **NOTE:** the project-local agent files in [.claude/agents/](.claude/agents/) may not be auto-discovered by every Claude Code session. If `subagent_type: "backend-expert"` errors with "agent type not found", invoke via `general-purpose` and instruct it to read the agent file + skill file before acting.

Parallelize independent subagent work — single message, multiple Agent calls.

## Commands (from `Server/`)

| Command | What it does |
|---|---|
| `npm install` | install deps |
| `npm run dev` | nodemon + tsx, port 3000, reloads on change |
| `npm run build` | `tsc` → `dist/` |
| `npm start` | run compiled `dist/server.js` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint |
| `npm test` | vitest run (one-shot) |
| `npm run test:watch` | vitest watch mode |

## Integrations

Status of each integration. When a new decision is made, update this section and create the matching domain folder in [Server/src/domains/](Server/src/domains/).

### Instagram DMs (inbound + outbound)
- **Decision:** Implemented — Meta Cloud API
- **What's done:** Webhook ingest at `POST /api/meta/webhook` with HMAC-SHA256 signature verification (timing-safe). GET handshake at same path echoes `hub.challenge`. Dev-only `POST /api/meta/test-inject` for end-to-end testing. Incoming messages are classified via OpenRouter and routed to Monday.com CRM. **Auto-reply templates (2026-07 copy update — short, link-free except where noted).** Routing in `pickReplyTemplate` (`meta.outbound.service.ts`) is (service) × (phone?) × (first contact vs. answer to the service question):
  - **uman opener** → `IG_MSG_PHONE_PRESENT` / `IG_MSG_PHONE_MISSING` (short, no teaser/link).
  - **challah opener** → `IG_MSG_SERVICE_PHONE_PRESENT` / `IG_MSG_SERVICE_PHONE_MISSING`.
  - **vague opener** (interested, no service named) → `IG_MSG_ASK_SERVICE` ("challah or uman?"), re-asked up to 3× via `pending_clarification`; her answer routes to `IG_MSG_UMAN_ANSWER_PHONE_PRESENT` / `IG_MSG_UMAN_ANSWER_PHONE_MISSING` (the ONLY conversational reply still carrying the teaser + `{form_link}`) / `IG_MSG_CHALLAH_ANSWER_PHONE_PRESENT` / `IG_MSG_CHALLAH_ANSWER_PHONE_MISSING`.
  - **Phone thank-you** — `IG_MSG_PHONE_THANKS` (תודה , ניצור קשר בהקדם💕) fires ONCE when a known **uman** lead without a stored phone hands one over (known-sender branch only; works even when the bare number classifies not-interested; challah stays silent; pending branch re-asks instead). Best-effort: skipped permanently if Monday 429s that exact message.
  - A missing phone always selects the ask-for-phone variant. Not-interested and already-known senders get no opener DM.
  - **Flyer second bubble (SEASONAL — remove after 2026-09-30):** the 4 uman DM templates (`UMAN_PHONE_*` + `UMAN_ANSWER_PHONE_*`) are followed by a second bubble: the hilula campaign flyer image, sent as an `image` attachment pointing at `https://api.ronitbarash.site/static/file.jpg` (served via `express.static` from [Server/public/](Server/public/), `COPY public ./public` in the Dockerfile). Hardcoded in `meta.outbound.service.ts` (`FLYER_IMAGE_URL` + `FLYER_TEMPLATE_LABELS`) — deliberate user decision, no env var; removal = code change. Best-effort: text-send failure skips the flyer; flyer failure retries once (~1s) then logs, never throws. NOT sent for: challah, ask-service, phone-thanks, comment private replies (Meta hard limit — **one private reply per comment, ever**; second bubble impossible there), WhatsApp/website paths. To swap next season's flyer: replace `Server/public/file.jpg` (name stays stable).
  - **Comment → private-reply DM flows** (`meta.comment.service.ts`, gated by `IG_COMMENT_HANDLER_ENABLED`, paced via `ig_comment_queue` + shared cap `IG_COMMENT_REPLY_MAX_PER_HOUR`, cron drain every 1 min, ≤5/tick, 6-day queue expiry, one private reply per comment ever). Two keywords, `kind` column routes the drain:
    - **אומן (any post)** → `IG_MSG_COMMENT_UMAN` + Monday Uman lead + known-sender registration; skips existing live leads. The code default is teaser + `{form_link}`, but a **VPS `.env` override (2026-09-01, per Shahar) replaces it with the short phone-ask — no teaser/link** (the linked orhazadik.online page pitched the departed ט"ו באב trip; IG renders the link as a preview card). Don't remove that override until the site is updated + client approves.
    - **פרנסה (knife-sale reel ONLY, 2026-08-26)** → `IG_MSG_COMMENT_KNIFE` (price/delivery/wa.me pitch, no link substitution) — **no Monday row, no sender registration by design** (sale closes in Ronit's WhatsApp). Post-scoped by `IG_COMMENT_KNIFE_MEDIA_ID` (default `18109858310601054`, empty = flow off; knife wins over אומן on that media). Recipients get a 14-day `ig_knife_recipient` mark that suppresses ONLY the vague ask-service question on their DM replies (explicit uman/challah still flows). For a future knife post: change the media-ID env var.
- **Not yet done:** 24-hour window enforcement, business verification (long-pole, 3–10 business days).
- **Env in use:** `META_APP_SECRET`, `META_VERIFY_TOKEN`, `IG_ACCESS_TOKEN`. IG message templates (all defaulted in `env.ts`, overridable per var): the 9 `IG_MSG_*` templates listed above + `IG_MSG_COMMENT_UMAN` / `IG_MSG_COMMENT_KNIFE`; comment flow: `IG_COMMENT_HANDLER_ENABLED`, `IG_COMMENT_REPLY_MAX_PER_HOUR`, `IG_COMMENT_KNIFE_MEDIA_ID`.
- **Env to add later:** `META_APP_ID`, `IG_PROFESSIONAL_ACCOUNT_ID`.

### WhatsApp (custom Supabase edge-function gateway)
- **Decision:** Custom gateway — a Supabase Edge Function (Deno) bridges WhatsApp ↔ this backend. **Replaces GreenAPI** (GreenAPI is being retired). Lives in a *separate* Supabase project, not this repo.
- **Outbound — send a message.** POST to the `ronit-send` edge function:
  ```
  POST https://gctijcljpjtmpyuzaohm.supabase.co/functions/v1/ronit-send
  Authorization: Bearer <RONIT_WA_SEND_TOKEN>
  Content-Type: application/json

  { "to": "<country code + number, NO plus sign>", "text": "<message>" }
  ```
  - `to` = digits only, country code prefixed, no `+` (e.g. `+63 960 391 3514` → `"639603913514"`; Israeli `0XXXXXXXXX` → `"972XXXXXXXXX"`).
  - Success response: `{"ok":true,"gateway":{"status":"sent"}}` with HTTP 200.
  - The Bearer token is a **secret** — it is NOT stored in this committed file. It lives in the gateway project + Ronit's `.env` on the VPS. When wiring outbound from this backend, add it to `env.ts` as `RONIT_WA_SEND_TOKEN` (+ `RONIT_WA_SEND_URL`) and read via `env`, never hardcode.
- **Inbound — receive a message.** The gateway POSTs to `POST /api/whatsapp/webhook` on THIS backend (`https://api.ronitbarash.site/api/whatsapp/webhook`).
  - As of 2026-06-18 the route is a **plain receiver**: no schema validation, accepts ANY JSON body, logs it (`"Inbound webhook received"`), returns 200. GreenAPI parsing/file-upload/owner-text logic was stripped out ([whatsapp.controller.ts](Server/src/domains/whatsapp/whatsapp.controller.ts), [whatsapp.routes.ts](Server/src/domains/whatsapp/whatsapp.routes.ts)). No auth/signature check on it yet.
  - **Real inbound payload shape** (flat, much simpler than GreenAPI):
    ```json
    {
      "customerId": "ronit-id",
      "type": "incoming",
      "chatType": "private",
      "from": "639603913514",
      "pushName": "Yul",
      "message": "hey",
      "messageType": "text",
      "timestamp": 1781712601
    }
    ```
  - `from` = sender digits (country code, no `+`). `timestamp` = Unix epoch **seconds** (multiply by 1000 for JS `Date`).
- **Status:** Both directions verified end-to-end 2026-06-18 (outbound 200 `status:sent`, inbound 200 logged). Handling logic (classify → create/update Monday lead) **not yet rebuilt** — webhook currently only logs. The dormant GreenAPI holiday/follow-up flows, crons, client, env vars, and SQLite tables still exist but are unused and slated for removal.
- **Env to add when wiring outbound from this backend:** `RONIT_WA_SEND_URL`, `RONIT_WA_SEND_TOKEN`.

### Monday.com
- **Decision:** Partially implemented — GraphQL API (version 2025-04)
- **⚠️ CRM board migration (2026-08-09):** the live CRM board is now **`5101856136` "רונית - CRM"**. The old board `5094895163` was renamed **"רונית -CRM ישן"** and still holds all pre-migration leads. The new board is a Monday *duplicate*, so ALL group and column IDs are identical — no other env/code change was needed beyond the board ID (code default updated; VPS `.env` also sets it explicitly, backup `.env.bak-2026-08-09`). The 4 Monday webhooks were re-created on the new board (close 180612969, phone-change 180612971, service-change 180612972, create_item 180612973); the old board's 4 webhooks were **deliberately left active** so Ronit can still close leftover old-board leads (close flow works there because column IDs match) — delete them when the old board is archived. n8n "Ronit Leads Monday Entry" Create-item node updated to the new board. **Known gap:** phone lookups (calls webhook, website dedup, follow-up) search the new board only — calls to pre-migration leads no longer match a row; returning IG senders with an old-board row self-heal into a fresh new-board row (history stays behind on the old board).
- **What's done:** GraphQL client wrapper (`monday.client.ts`) with auth and error handling. Lead creation service (`monday.service.ts`) — creates rows in CRM board with phone (IL country code), service dropdown (uman→1, poland→2, challah→3), and notes. Column IDs are env-configurable with defaults.
- **Webhook endpoints (all live):** `POST /api/monday/webhook` (close flow — `moveClosedItem` routes to service boards), `POST /api/monday/lead-ready` (create_item → WA welcome, `verifyMondaySecret`-gated), `POST /api/monday/lead-fallback` (n8n FB-lead fallback → `monday_lead_queue`, same gate). Full domain: `monday.routes.ts`, `monday.controller.ts`, `monday.validator.ts`, `monday.service.ts`, `monday.webhook.service.ts`, `monday.queue.service.ts`, `monday.client.ts`, `monday.cron.ts`.
- **Env in use:** `MONDAY_API_TOKEN`, `MONDAY_BOARD_CRM_ID`, `MONDAY_GROUP_NEW_LEADS_ID`, `MONDAY_COL_PHONE_ID`, `MONDAY_COL_SERVICE_ID`, `MONDAY_COL_NOTES_ID`, `MONDAY_BOARD_UMAN_ID` (bootstrap flight board), `MONDAY_BOARD_CHALLAH_ID` (2026 board — template for future year boards), `MONDAY_UMAN_COL_DATE_ID` (per-row flight date column on Uman boards).
- **Two services only:** `uman` and `challah`. Poland was removed (board deleted upstream). The CRM service dropdown still has the legacy `טיסות לפורים` label; close flow ignores it (skip with `no_service`).
- **Close flow:** `moveClosedItem` reads `MONDAY_COL_INQUIRY_DATE_ID` (Monday-managed row-creation date) + service label, then routes:
  - **Challah (label 3) — year-aware boards.** `getOrCreateChallahYearBoard(year)` resolves `הפרשות חלה NN` via SQLite `settings` (key `challah_board_id:<year>`) → in-memory cache → name-search bootstrap → duplicate-template. Month group titles are Hebrew (`ינואר 2027`, …).
  - **Uman (label 1) — flight-aware boards.** `getActiveUmanBoard()` resolves the *currently active* Uman flight board: reads `current_uman_board_id` from `settings` (fallback env), inspects every row's `MONDAY_UMAN_COL_DATE_ID` value, picks `max(dates)` and compares to today. If today < max OR no dates set → that board is active. Otherwise → duplicate the current Uman board (structure only), name `טיסה לאומן <HE_MONTH> <YY>`, rename the lone group to match, persist new ID. **Uman boards never get month groups** — 1 board = 1 flight = 1 group.
  - There is no event-date column on CRM. Service boards have their own date columns that Ronit fills manually after closes.
- **Rename safety:** Both resolvers persist board IDs in SQLite `settings` and look up by ID on subsequent closes. Ronit can rename any board or group on Monday without breaking automation. Names are only used as (a) initial defaults on creation, (b) one-time bootstrap fallback for boards that pre-date this code.
- **Calendar view setup (manual, per year board):** Monday API has no view-creation mutation. On each new year board: `+` → **Calendar** → gear → Columns: **תאריך** / Groups: check all 12 Hebrew months (leave `ביטולים` off) / Time range: All time.
- **Board column structures:** Uman and Challah boards have custom column structures seeded from Google Sheets. The close flow uses dynamic title-based column matching with `TITLE_ALIASES` for known mismatches (e.g., `עיר` ↔ `עיר מגורים`).
- **Phone search scope:** `findLeadByPhoneAllBoards`, `getAllLeadsWithPhones`, and `getAllLeadsForFollowup` all search CRM only. Service boards are write-once at close + manually maintained.
- **Cross-board limitation — `הודעה אחרונה באינסטגרם` (Last IG message):** Lives on every board for visual consistency, but `updateLastIgMessage` only writes to CRM because `known_senders.monday_item_id` is CRM-only. After a close, the service-board copy of `lastIgMessage` is frozen.
- **CRM groups (as of 2026-08-09, new board):** 17 groups; the wired ones are לידים חדשים אורטל (`new_group29179`, lead-creation target), ללא מספרי טלפון (`group_mm469wrf`, no-phone target), נסגרו טו באב2026 (`group_mm2n54r9`, close-webhook trigger). The rest are manual working groups (פולואפ הילולה, אין מענה, לידים טל/נווה/טליה, etc.). Group renames are safe (IDs persist); group deletions can break wiring silently.
- **Daily group watchdog:** `monday.cron.ts` (`startMondayCrons`, 07:00 Asia/Jerusalem) fetches CRM board groups via `getBoardGroups`, diffs against SQLite `settings` key `crm_groups_snapshot`, logs warn on add/remove/rename, logs error if the new-leads group ID disappears (lead creation would break). All other flows are group-agnostic (updates by item ID).
- **Returning-lead handling (live, E2E-verified 2026-06-11):** when a known IG sender writes an interested message: (a) live CRM row → moved back to the new-leads group from wherever it drifted; (b) stale `known_senders` mapping (item deleted/archived/off-board — checked via `state === "active"` in `getItemBoardAndGroup`, because trashed items still return from `items(ids)`) → mapping dropped, sender treated as new; (c) before creating the fresh row, if a service was named, the ACTIVE service board (`getCurrentUmanBoardState` / `challah_board_id:<yr>`+`<yr+1>` settings) is searched by phone-variants or IG username (`findLeadOnBoard`) — a hit means already booked → no CRM row. `moveClosedItem` deletes the `known_senders` row after deleting the CRM item. Cross-board duplicates are intended; per-board uniqueness holds because one service board is active at a time.
- **API rate-limit resilience (built 2026-07-08 — Monday Standard plan = 1,000 API calls/day, resets midnight UTC):** all lead paths are now lossless under 429s (`DAILY_LIMIT_EXCEEDED` / minute cap):
  - `monday.client.ts` classifies 429s into `MondayRateLimitError` (kind `daily`|`minute` + `retryInSeconds`), does one short inline retry max, and keeps a module-level circuit breaker (`rateLimitedUntilMs`) so webhook handlers fail fast during an outage instead of stacking latency.
  - **Durable retry queue** — SQLite `monday_lead_queue` (`UNIQUE(platform, sender_id)` upsert-merge, per-row `next_attempt_at` exponential backoff, 7-day expiry with error logging). `drainMondayLeadQueue` (`monday.queue.service.ts`, cron every minute, batch 5) dispatches by platform: `instagram` (dedup + create + known-sender), `website` (replays `submitWebsiteLeadToMonday`), `n8n` (see fallback below). A daily-limit error bumps by `retry_in_seconds + 60` and breaks the whole batch.
  - **Caching** — Uman board-state TTL cache (`MONDAY_UMAN_STATE_TTL_MS`, 15 min) + `ig_message_mirror` (6h freshness so Ronit's manual Monday edits win) cut read volume roughly in half.
  - **WA welcome single-fire** — drain-created rows get their welcome via Monday's `create_item` lead-ready webhook (itemId dedup key), never from the drain itself.
- **n8n FB lead-ad fallback:** `POST /api/monday/lead-fallback` (gated by `verifyMondaySecret`, same `?token=` as lead-ready; body = the n8n *Normalize phone* output validated by `N8nLeadFallbackSchema` — requires `phone972` OR `email`). Enqueues `platform:"n8n"`; `drainN8nRow` dedups by `findLeadByPhone` on CRM then creates with `sourceLabel: env.MONDAY_SOURCE_LABEL_PAID` (ממומן) + the **original** `inquiryDate`. Wired from workflow `IZa9wPTd87J6Ppno` ("Ronit Leads Monday Entry"): `Create Monday item` `onError: continueErrorOutput` → "Send to queue" HTTP node. n8n API access: `N8N_API_KEY`/`N8N_API_URL` in `Server/.env`.
- **Lead-source tag:** `createLeadRow` stamps מקור ליד (`MONDAY_COL_SOURCE_ID`) with `MONDAY_SOURCE_LABEL_ORGANIC` (אורגני) by default; `sourceLabel`/`inquiryDate` are overridable per call (used only by the n8n drain path).

### LLM (classification + summarization)
- **Decision:** Implemented — OpenRouter (default model: `anthropic/claude-haiku-4.5`)
- **What's done:** Lead classifier in `lib/classify.ts`. Takes message text + optional sender username, calls OpenRouter with Hebrew system prompt, returns `{interested, service, extractedName, extractedPhone, confidence, rawResponse}`. Handles JSON parsing (strips markdown backticks), validates response schema. Services: `uman` (pilgrimage flights) and `challah` (separation events).
- **Not yet done:** Call-summary extraction, fallback model support.
- **Env in use:** `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.
- **Env to add later:** `OPENROUTER_FALLBACK_MODEL` (when fallback logic is added).

### Call recording + transcription
- **Decision:** Salestrail (Android background recorder) + Gemini 2.5 Flash audio transcription via OpenRouter. ~$20/mo total ($13 Salestrail + ~$7 Gemini).
- **How it works:** Salestrail Recorder runs in the background on Ronit's Samsung Galaxy A56 5G. Records WhatsApp + cellular calls automatically (no user action needed). Salestrail POSTs a webhook with call metadata (including the other party's phone number). Backend verifies Basic auth, looks up the phone in Monday CRM, downloads the recording via Pull API, transcribes via Gemini, and updates Monday.
- **What's done:**
  - Salestrail client at [src/domains/calls/salestrail.client.ts](Server/src/domains/calls/salestrail.client.ts) — downloads recordings via `GET https://standalone-api.salestrail.io/export/calls/{callId}/recording` with Basic auth.
  - Audio transcriber at [src/lib/transcribe.ts](Server/src/lib/transcribe.ts) — sends base64-encoded audio to Gemini 2.5 Flash via OpenRouter, returns `{ transcript, summary, customer_name, service_interest, key_points, follow_up_needed }`. Hebrew system prompt. (No event-date extraction — CRM has no event-date column.)
  - Webhook handler at `POST /api/calls/webhook` — HTTP Basic auth verification (timing-safe), parses Salestrail JSON payload, raw body mounted before `express.json()`.
  - Call service at [src/domains/calls/calls.service.ts](Server/src/domains/calls/calls.service.ts) — `handleSalestrailCall(payload)`: phone lookup via `formattedNumber` (no LLM extraction needed), download recording (non-fatal), transcribe (non-fatal), then Monday updates **in place, wherever the row sits** (any group): increment calls + update last-call date + add summary note. The old move-to-Contacted step was removed 2026-06-11 — the "called" group was deleted in a board restructure and group moves are no longer part of this flow.
  - Monday.com CRM automation — `findLeadByPhone()` searches CRM board with multi-format normalization (Israeli +972/0-prefix, Philippine +63), `incrementCallsColumn()`, `updateLastCallDate()`, `addNoteToItem()`. **Tested and working via test-inject.** Note: Monday's `items_page_by_column_values` does not match a few stale May-2026 synthetic test rows (indexing quirk); all real leads match fine.
  - Dev test endpoint at `POST /api/calls/test-inject` — takes `{ phone }` to test the Monday.com matching + increment flow directly.
- **No-filter policy:** We accept every call Salestrail sends — WhatsApp, WhatsApp Business, cellular SIM, answered or not, any duration. No pre-filtering. Natural gates: (a) phone matches a Monday lead, (b) recording exists in Salestrail.
- **Salestrail push LIVE (verified 2026-06-14):** the leading-TAB password issue is resolved. Real SIM calls are flowing — 16 call webhooks processed with 0 auth 401s since the 2026-06-11 deploy (first 2026-06-12T01:05Z, e.g. callId b588eb00 +972503366416 SIM 139s answered). Pipeline ingesting end-to-end.
- **Not yet done:** Gemini Hebrew transcript quality verification on real recordings (calls are arriving; confirm summaries land well on the Monday rows).
- **Known risk:** Android restricts third-party mic access during VoIP calls. Samsung is more permissive than Xiaomi/MIUI (which blocks completely), but WhatsApp calls may produce one-sided audio. Cellular/SIM calls should work with full two-way audio on Samsung. Samsung is Salestrail's best-supported device family.
- **2nd Salestrail org (deployed 2026-08-24, E2E test pending):** a second phone runs under a SEPARATE Salestrail organisation (1 user each; org 1 owner = barashro@gmail.com). Both orgs' Push APIs point at the same `/api/calls/webhook` with identical Basic-auth credentials (webhook creds are owner-chosen, so shared deliberately). Pull API keys are per-org: `SALESTRAIL_API_USERNAME/PASSWORD` (org 1) + `SALESTRAIL_API_USERNAME_2/PASSWORD_2` (org 2, optional — unset = old behavior). `tryDownloadOnce` tries each org key in order (a recording 404s on the non-owning org) and Monday summaries are prefixed `משתמש 1:`/`משתמש 2:` per the owning org, baked in before caching. UNVERIFIED until the org-2 test call: strict per-org key scoping (if org 1's key could fetch org 2's recordings, labels would misattribute). See [research/salestrail-multi-user.md](research/salestrail-multi-user.md).
- **Env in use:** `SALESTRAIL_WEBHOOK_USERNAME`, `SALESTRAIL_WEBHOOK_PASSWORD`, `SALESTRAIL_API_USERNAME(_2)`, `SALESTRAIL_API_PASSWORD(_2)`, `OPENROUTER_AUDIO_MODEL`, `MONDAY_COL_CALLS_ID`.
- **Research:** See [research/call-recording-comparison.md](research/call-recording-comparison.md) for full market comparison (15+ apps analyzed) and [research/salestrail-multi-user.md](research/salestrail-multi-user.md) for the 2-org setup.

### Holiday calendar
- **Decision:** Hebcal (locked — free, no auth)
- **Notes:** REST API at `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&i=on&year={year}`. Daily cron at 08:00 Asia/Jerusalem checks for holidays at `today + 3 days`.

### Database
- **Decision:** _TBD_ — leaning Supabase (managed Postgres + Storage). pg-boss runs on the same DB so no Redis needed.
- **Notes:** Holds `processed_webhooks` (dedup), `followup_log`, `holiday_campaign`, `holiday_campaign_send`, plus pg-boss's own `pgboss.*` schema. Monday is the source of truth for lead data.
- **Env to add when chosen:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.

### Hosting
- **Decision:** Hostinger VPS (locked — client-provided)
- **Notes:** PM2 (cluster mode, auto-restart, log rotation) + Nginx (TLS via certbot/Let's Encrypt). `app.set("trust proxy", 1)` is already on for the rate-limiter to see real IPs through the proxy.

### Job queue + scheduling
- **Decision:** pg-boss (delayed/retried jobs) + node-cron (recurring schedules) — **planned**, not yet installed.
- **Notes:** Daily 08:00 (holiday), daily 09:00 (follow-up). pg-boss creates its own schema on first `boss.start()`.

## Pitfalls — read before adding a domain

- **Webhook signature verification needs raw bytes.** `express.json()` is mounted globally, which destroys the raw body. For routes that verify HMAC (Meta `x-hub-signature-256`, Twilio `x-twilio-signature`), mount `express.raw({ type: "application/json", limit: "1mb" })` on the specific webhook path **before** the JSON parser, then verify HMAC, then `JSON.parse(req.body)` manually. Apply per-domain in `server.ts`.
- **Meta GET verification handshake.** Meta requires `GET /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` to echo `hub.challenge` as `text/plain`. Implement this alongside the POST handler.
- **Rate limiter is global on `/api`.** Meta retries aggressively; when the meta domain lands, narrow the limiter or add a `skip` predicate for `/api/meta/webhook`.
- **24-hour messaging window (Meta).** Outbound IG/WhatsApp messages outside the 24h window since the last inbound need approved templates. Follow-up flow must check + skip.
- **ESM imports need `.js` suffix.** TypeScript source imports each other as `./foo.js` even though the file is `foo.ts`. NodeNext requires this.
- **No `console.log`.** Use `logger`. Pino respects `LOG_LEVEL` and stays parseable in production.
- **No raw `process.env`.** Add the var to the Zod schema in `env.ts` first.
- **Strict timezone.** All date math must run in `Asia/Jerusalem` (`env.TZ`). Hebcal returns Israel-local dates; cron schedules use the TZ env.

## Build roadmap

**Completed:**
1. Express skeleton — middleware stack, health check, error handling, env validation, logging
2. Meta domain — Instagram DM webhook ingest with HMAC verification, GET handshake, outbound auto-reply, echo filtering, IG token auto-refresh
3. LLM classifier — OpenRouter integration for lead classification (uman/poland/challah)
4. Monday.com client — GraphQL client + lead-row creation/update in CRM board, form columns, cross-board search
5. Call recording domain — Salestrail webhook handler (Basic auth), recording download via Pull API, Gemini audio transcription, Monday.com lead matching + group move + calls increment + last-call date + summary note. Backend tested via test-inject.
6. Website domain — form submission endpoint with IG + phone dedup
7. WhatsApp domain — GreenAPI integration, holiday campaigns, follow-up campaigns, file upload to Monday
8. SQLite database — dedup, known senders, holiday campaigns (migrated from Supabase)

**Next up:**
- Salestrail end-to-end test on Ronit's Samsung A56 (see steps below)
- Monday.com webhook handler (item_moved_to_specific_group → service board routing)
- Weekly follow-up flow refinement

### Steps to connect Salestrail (for Ronit's phone)
1. Ronit signs up at https://callanalytics.salestrail.io/signup (free 5-day trial, no card).
2. Phone setup:
   - Install main Salestrail app from Play Store
   - Sideload Salestrail Recorder APK from https://salestrail.io/apk
   - Allow Play Protect bypass + "Allow restricted settings"
   - Enable Accessibility for Salestrail Recorder
   - Set BOTH apps to "Don't optimize" in Battery + Autostart ON
   - Grant Notification access to both apps
   - In main app: Settings → Recording Settings → toggle "Record WhatsApp Calls" ON
3. Dashboard: Integrations → Apps → Push API → Connect
   - Webhook URL: `https://api.ronitbarash.site/api/calls/webhook`
   - Username + Password: strong random values, also put into Hostinger env as `SALESTRAIL_WEBHOOK_USERNAME` / `SALESTRAIL_WEBHOOK_PASSWORD`
4. Make a real test call with a colleague whose phone is in the Monday CRM board.
5. Verify on the Salestrail dashboard: is the recording audible? Both sides?
   - If silent/one-sided on WhatsApp → try different Recording Source (Voice Recognition / Voice Communication / Default). Cellular/SIM calls should work regardless.
   - If nothing works → abort within 5-day trial (no charge) and pivot to PLAUD Note hardware (~$159 + $18/mo).
6. Check Hostinger server logs: webhook → auth OK → audio downloaded → Gemini transcript → Monday updated.

See [PLAN.md](PLAN.md) for full domain plan details.

## Temporary testing overrides (revert before production)

- **`RONIT_OWNER_WA_NUMBER` on Hostinger** is set to `639620616308` ("aj smrt") for testing the WhatsApp holiday flow. Revert to Ronit's real number `639219909210` before going live.
- **GreenAPI self-message limitation**: GreenAPI does not fire webhooks for messages sent to yourself (same phone as the instance). In production, the GreenAPI instance number must differ from the owner's personal number, OR the owner replies from a different device/number.
- **Supabase `holiday_campaigns`** has a test row (id=1, holiday_date=2026-04-26, status=pending_reply). Delete or reset test data before production.

## Audience risk note

User chose "all leads in CRM" for the holiday-greeting audience. Recommend revisiting after the first send — broad blast risks spam-flagging the IG/WhatsApp number. Safer alternative: gate to leads with at least one inbound message in the last 90 days.
