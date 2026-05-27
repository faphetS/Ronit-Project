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
- **What's done:** Webhook ingest at `POST /api/meta/webhook` with HMAC-SHA256 signature verification (timing-safe). GET handshake at same path echoes `hub.challenge`. Dev-only `POST /api/meta/test-inject` for end-to-end testing. Incoming messages are classified via OpenRouter and routed to Monday.com CRM.
- **Not yet done:** Outbound reply messaging, 24-hour window enforcement, business verification (long-pole, 3–10 business days).
- **Env in use:** `META_APP_SECRET`, `META_VERIFY_TOKEN`.
- **Env to add later:** `META_APP_ID`, `IG_ACCESS_TOKEN`, `IG_PROFESSIONAL_ACCOUNT_ID` (needed for outbound messaging).

### WhatsApp (Ronit owner channel + optional lead messaging)
- **Decision:** _TBD_
- **Notes:** Used for Flow 6 (holiday prompt to Ronit + her reply). Meta Cloud API on a dedicated business number, OR a third party (360dialog, Twilio, GreenAPI). Owner reply is matched back to a `holiday_campaign` row by sender phone.
- **Env to add when chosen:** `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `RONIT_OWNER_WA_NUMBER`.

### Monday.com
- **Decision:** Partially implemented — GraphQL API (version 2025-04)
- **What's done:** GraphQL client wrapper (`monday.client.ts`) with auth and error handling. Lead creation service (`monday.service.ts`) — creates rows in CRM board with phone (IL country code), service dropdown (uman→1, poland→2, challah→3), and notes. Column IDs are env-configurable with defaults.
- **Not yet done:** Webhook handler for `item_moved_to_specific_group` events at `POST /api/monday/webhook`, service board routing (3 service boards), dedup by `event.pulseId + event.timestamp`. Missing `monday.routes.ts`, `monday.controller.ts`, `monday.validator.ts`.
- **Env in use:** `MONDAY_API_TOKEN`, `MONDAY_BOARD_CRM_ID`, `MONDAY_GROUP_NEW_LEADS_ID`, `MONDAY_COL_PHONE_ID`, `MONDAY_COL_SERVICE_ID`, `MONDAY_COL_NOTES_ID`.
- **Env to add later:** `MONDAY_BOARD_UMAN_ID`, `MONDAY_BOARD_POLAND_ID`, `MONDAY_BOARD_CHALLAH_ID` (needed for service board routing).
- **Notes:** Hebrew dropdown values for the `Service` column must match exactly: `טיסות לאומן`, `טיסות לפורים`, `הפרשות חלה`. Uman board ID is 5097312406.
- **Board column structures:** Uman and Challah boards have custom column structures seeded from Google Sheets (columns differ from CRM by ID and sometimes title). Duplication flow uses dynamic title-based column matching with `TITLE_ALIASES` for known mismatches (e.g., "עיר" ↔ "עיר מגורים").
- **Phone search scope:** `findLeadByPhoneAllBoards`, `getAllLeadsWithPhones`, and `getAllLeadsForFollowup` all search CRM board only. Service boards are read-only from the backend perspective; leads are created in CRM and duplicated on close.
- **Cross-board limitation — `הודעה אחרונה באינסטגרם` (Last IG message):** The column exists on all 4 boards (CRM/Uman/Poland/Challah) for visual consistency, but `updateLastIgMessage` always writes to CRM because `known_senders.monday_item_id` is CRM-only. When a CRM row is duplicated to a service board on close, the service-board copy's `lastIgMessage` is frozen at duplication time; subsequent IG messages keep updating the CRM row, not the service board. Cross-board sync is a future plan.

### LLM (classification + summarization)
- **Decision:** Implemented — OpenRouter (default model: `anthropic/claude-haiku-4.5`)
- **What's done:** Lead classifier in `lib/classify.ts`. Takes message text + optional sender username, calls OpenRouter with Hebrew system prompt, returns `{interested, service, extractedName, extractedPhone, confidence, rawResponse}`. Handles JSON parsing (strips markdown backticks), validates response schema. Services: uman (Uman pilgrimage), poland (Poland tours), challah (challah separation events).
- **Not yet done:** Call-summary extraction, fallback model support.
- **Env in use:** `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.
- **Env to add later:** `OPENROUTER_FALLBACK_MODEL` (when fallback logic is added).

### Call recording + transcription
- **Decision:** Salestrail (Android background recorder) + Gemini 2.5 Flash audio transcription via OpenRouter. ~$20/mo total ($13 Salestrail + ~$7 Gemini).
- **How it works:** Salestrail Recorder runs in the background on Ronit's Samsung Galaxy A56 5G. Records WhatsApp + cellular calls automatically (no user action needed). Salestrail POSTs a webhook with call metadata (including the other party's phone number). Backend verifies Basic auth, looks up the phone in Monday CRM, downloads the recording via Pull API, transcribes via Gemini, and updates Monday.
- **What's done:**
  - Salestrail client at [src/domains/calls/salestrail.client.ts](Server/src/domains/calls/salestrail.client.ts) — downloads recordings via `GET https://standalone-api.salestrail.io/export/calls/{callId}/recording` with Basic auth.
  - Audio transcriber at [src/lib/transcribe.ts](Server/src/lib/transcribe.ts) — sends base64-encoded audio to Gemini 2.5 Flash via OpenRouter, returns `{ transcript, summary, customer_name, service_interest, key_points, follow_up_needed }`. Hebrew system prompt.
  - Webhook handler at `POST /api/calls/webhook` — HTTP Basic auth verification (timing-safe), parses Salestrail JSON payload, raw body mounted before `express.json()`.
  - Call service at [src/domains/calls/calls.service.ts](Server/src/domains/calls/calls.service.ts) — `handleSalestrailCall(payload)`: phone lookup via `formattedNumber` (no LLM extraction needed), download recording (non-fatal), transcribe (non-fatal), then Monday updates: move to Contacted + increment calls + update last-call date + add summary note.
  - Monday.com CRM automation — `findLeadByPhone()` searches CRM board with multi-format normalization (Israeli +972/0-prefix, Philippine +63), `moveItemToGroup()`, `incrementCallsColumn()`, `updateLastCallDate()`, `addNoteToItem()`. **Tested and working via test-inject.**
  - Dev test endpoint at `POST /api/calls/test-inject` — takes `{ phone }` to test the Monday.com matching + move + increment flow directly.
- **No-filter policy:** We accept every call Salestrail sends — WhatsApp, WhatsApp Business, cellular SIM, answered or not, any duration. No pre-filtering. Natural gates: (a) phone matches a Monday lead, (b) recording exists in Salestrail.
- **Not yet done:** Ronit's phone setup (Salestrail account + app install), end-to-end test with real recording on Samsung A56, Gemini Hebrew transcript quality verification.
- **Known risk:** Android restricts third-party mic access during VoIP calls. Samsung is more permissive than Xiaomi/MIUI (which blocks completely), but WhatsApp calls may produce one-sided audio. Cellular/SIM calls should work with full two-way audio on Samsung. Samsung is Salestrail's best-supported device family.
- **Env in use:** `SALESTRAIL_WEBHOOK_USERNAME`, `SALESTRAIL_WEBHOOK_PASSWORD`, `OPENROUTER_AUDIO_MODEL`, `MONDAY_GROUP_CONTACTED_ID`, `MONDAY_COL_CALLS_ID`.
- **Research:** See [research/call-recording-comparison.md](research/call-recording-comparison.md) for full market comparison (15+ apps analyzed).

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
