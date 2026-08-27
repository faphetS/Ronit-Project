# Salestrail — Adding a 2nd Phone Number (Multi-User) to Ronit's Account

Researched 2026-08-11 from Salestrail's official site/docs + inspection of our backend code.
Second pass same day against the restructured knowledge base (new article set at salestrail.io/knowledge-base) — added the per-user integration Login step, license purchasing, and setup-mistake fixes.
Everything below is either **verified** (source linked / code inspected) or explicitly marked **UNVERIFIED**.
Do not treat UNVERIFIED items as fact — confirm with Salestrail support (`support@liid.com`).

> Note: `salestrail.io/knowledge-base/docs` (API docs) and the developer portal
> `standalone-dev.salestrail.io/integration/apidocs` could not be fetched by tooling
> (404 / JS-only app). If those docs are needed, open them in a browser and export manually.

## Context

- Today: 1 Salestrail user (Ronit's phone) → org Push API webhook → `POST /api/calls/webhook` → Monday CRM update + recording download + Gemini transcription. Live since 2026-06.
- Org Owner / dashboard login: **barashro@gmail.com** ("Ronit barash", +972502696862 — verified from a dashboard CSV export's `UserEmail` column). This is the account that runs the invite + Subscription → Purchase steps below.
- Goal: add a 2nd phone number as a 2nd user in the SAME Salestrail organisation. Their calls must also record and push into this same pipeline.

## TL;DR — what it takes

1. **Money first:** buy the extra license self-serve at Call Analytics Dashboard → **Subscription → Purchase** (users invited beyond the purchased license count can't access call data). Licensing is per user; the three components: Essential $8/user/mo + Call Recording +$3/user/mo + CRM Integration (this is what the Push API belongs to) +$7/user/mo → **$18/user/mo** (monthly) or **$12.60/user/mo** on annual (30% off). Matches the "3 payments again" expectation.
2. **Dashboard:** Owner invites the new user (User Management → Add User, by email — or share the org sign-up link). The invitee must join **via the invite** — signing up on the generic salestrail.io page lands them in a wrong/new org.
3. **Phone:** new user installs the Salestrail app, logs in with the invited email, grants ALL permissions, and does the same recording setup as Ronit's phone (built-in recorder route for cellular; details below).
4. **Per-user integration Login (easy to miss):** the new user must complete the integration login step on the dashboard (Integrations → Apps → [Push API] → Login). Per Salestrail's setup-mistakes doc, users who skip it get "calls tracked in Salestrail but not pushed to the CRM."
5. **Backend: NO code change required.** Verified in code — see "Our backend" section. The Push API endpoint/credentials are organisation-wide (one webhook config), and our handler doesn't care which user the call came from.
6. **Verify end-to-end** with one real call to a phone number that exists as a Monday lead.

---

## Verified facts (from Salestrail docs)

### Inviting the 2nd user

- Two ways to add someone: **dashboard invite** (invitee gets an email with a link) or the **organisation's sign-up link**.
- Dashboard path: **User Management → Add User** → enter their email → assign organisation role (+ team / manager role if wanted). Invite email may land in Spam.
- The invitee signs up via the link, then logs into the **Salestrail mobile app with that same email**.
- User Management shows whether each member has installed the app.
- **Roles:** `Owner` (adds/removes users, sees everyone's data, and is the ONLY role that can manage the Push API config), `Manager` (adds/removes users, sees a team's data only if made team admin), `User` (sees only their own data).
  → Recommendation: invite the 2nd person as **User**. The account Owner stays as-is.

Sources: [Roles in an organisation](https://www.salestrail.io/knowledge-base/roles-in-an-organisation), [Getting started FAQ](https://www.salestrail.io/knowledge-base/getting-started), Salestrail Help Center article "How to set up your Organisation and Teams".

### Pricing (per user — salestrail.io/pricing, checked 2026-08-11)

| Component | Monthly billing | Annual billing (30% off) |
|---|---|---|
| Essential license (app + dashboard + call tracking) | $8/user/mo | $5.60/user/mo |
| Call Recording add-on (**Android only**) | +$3/user/mo | +$2.10/user/mo |
| CRM Integration add-on — includes **Push API** (also Salesforce/HubSpot/Dynamics/LeadSquared) | +$7/user/mo | +$4.90/user/mo |
| **Total per user** | **$18/mo** | **$12.60/mo** |

- Free trial: 5 days, full feature set, no automatic charge after ("you only upgrade if you're ready").
- No setup fees or storage charges.
- **Adding licenses is self-serve:** Call Analytics Dashboard → **Subscription → Purchase**. **Reducing** licenses = email support@liid.com.
- Cancellation notice: 90 days on annual plans, 30 days on monthly (cancel via support@liid.com).
- Custom plan only matters from 30+ licenses (not us).

Source: [Pricing](https://www.salestrail.io/pricing), [Pricing structure KB](https://www.salestrail.io/knowledge-base/salestrails-pricing-structure) (the KB names the three components; the numbers are from the pricing page), [Modify/manage/cancel subscription KB](https://www.salestrail.io/knowledge-base/modify-manage-or-cancel-your-subscription), [Free trial KB](https://www.salestrail.io/knowledge-base/salestrail-free-trial).

### Push API scope — the key question, answered

- The Push API **endpoint + credentials** are configured **once per organisation**: Integrations → Apps → Push API. Docs: "Only the owner is able to set and change the username and password used in **the organisation's** Push API integration." One webhook URL + one Basic-auth pair for the whole org — the 2nd user's calls go to the **same endpoint already configured** for Ronit; nothing changes server-side.
- **BUT there is a per-user activation step.** From the setup-mistakes doc: "Individual team members don't complete their own login step. Their calls are tracked in Salestrail but not pushed to the CRM. → Each user must authenticate separately via Dashboard > Integrations > Apps > Login." The Push API article likewise says team members get a notification email and can follow it to Integrations → Apps → Push API → Login. So: user #2 must open the dashboard once and complete that Login step, or expect their calls to show in Salestrail but never reach our webhook. (How much of this applies to Push API vs. only OAuth CRMs like Salesforce isn't 100% explicit — treat the Login step as required; it's cheap. If user #2's calls appear on the dashboard but never hit `/api/calls/webhook`, this is the FIRST thing to check.)
- The troubleshooting index has a dedicated category for exactly this failure: "A user's calls are not syncing but others are."
- The pushed payload identifies who made the call: `userId`, `userName`, `userEmail`, `userPhone` alongside the call fields (`callId`, `number`, `formattedNumber`, `duration`, `answered`, `inbound`, …). Matches what our validator already accepts.

Source: [Push API integration KB](https://www.salestrail.io/knowledge-base/push-api-integration), [Common setup mistakes KB](https://www.salestrail.io/knowledge-base/common-setup-mistakes), [CRM troubleshooting index](https://www.salestrail.io/knowledge-base/help-issues-with-crm-integrations).

### Recording setup on the new phone

- Recording is Android-only ("Recording is not supported on iPhone due to Apple platform restrictions") and requires: (a) the Call Recording add-on **in the license** ("Make sure call recording is included in your Salestrail subscription before setting it up"), and (b) enablement **on the device** — Salestrail app → Settings → Recording Settings.
- Two mutually exclusive methods (chosen in Recording Settings):
  - **Built-in call recorder** — what Ronit's phone uses. "Salestrail can read those recordings directly without any additional app." Cellular/SIM calls only, never WhatsApp/VoIP. Requires the phone's native dialer to support call recording (on Samsung: Phone app → Settings → Record calls → **Auto record calls ON**; gated by region firmware/CSC — Israeli `ILO` firmware has it; EU-firmware Samsungs only from One UI 8 / Android 16). Per Salestrail's doc: make a manual test recording in the dialer FIRST, verify it's audible, then switch Salestrail to "Use built-in call recorder". **Google Dialer devices (Pixel etc.) won't work with this route** — "Salestrail cannot access the built-in recorder's storage folder on Google Dialer devices" → APK instead.
  - **Salestrail Recorder APK** (sideloaded) — needed for WhatsApp-call recording ("WhatsApp call recording always requires the Salestrail Recorder APK"), Google Dialer devices, or phones without a native recorder. On many devices the OS blocks call audio for third-party apps → silent/one-sided recordings; the fix is cycling Recording Source (start with Voice Recognition) or using speakerphone. We do NOT use this route for Ronit.
- Reliability on the device (both routes): battery **Unrestricted** for the Salestrail app (and separately for the Recorder APK if used) + add to Never-sleeping apps (Samsung) + disable "Remove permissions if app is unused" — or syncing lags/dies (this caused Ronit's early-morning dead zone).
- Permission health is visible remotely: User Management → Permissions column shows a red dot for users with missing permissions.

Sources: [How call recording works KB](https://www.salestrail.io/knowledge-base/how-call-recording-works), [Built-in recorder KB](https://www.salestrail.io/knowledge-base/call-recording-via-the-built-in-recorder), [Recorder APK KB](https://www.salestrail.io/knowledge-base/how-to-record-your-calls-using-the-salestrail-recorder-apk), [One-sided audio KB](https://www.salestrail.io/knowledge-base/salestrail-call-recording-audio-one-sided-causes-and-fixes), [Samsung One UI 8 KB](https://www.salestrail.io/knowledge-base/sim/gsm-call-recording-on-samsung-devices-running-one-ui-8-android-16), [Common setup mistakes KB](https://www.salestrail.io/knowledge-base/common-setup-mistakes), [No call data KB](https://www.salestrail.io/knowledge-base/no-call-data-on-your-salestrail-dashboard-reasons-and-solutions).

---

## Our backend — verified by code inspection (2026-08-11)

**No code or env change is needed for a 2nd user.**

- `POST /api/calls/webhook` authenticates with the org-wide Basic-auth pair (`SALESTRAIL_WEBHOOK_USERNAME/PASSWORD`) — the same one already configured in the org's Push API settings. A 2nd user does not change it.
- `SalestrailWebhookPayloadSchema` ([calls.validator.ts](../Server/src/domains/calls/calls.validator.ts)) accepts `userId`/`userName`/`userEmail`/`userPhone` for any user — **no allow-list, no filtering**. Those fields are validated but currently unused by the service.
- `handleSalestrailCall` ([calls.service.ts](../Server/src/domains/calls/calls.service.ts)) matches leads by `formattedNumber` (the OTHER party's number) only. Whichever user called, the matching Monday lead row gets: calls counter +1, last-call date, transcription summary note.
- Recording download ([salestrail.client.ts](../Server/src/domains/calls/salestrail.client.ts)) hits `standalone-api.salestrail.io/export/calls/{callId}/recording` with `SALESTRAIL_API_USERNAME/PASSWORD` — keyed by `callId` only, no user parameter.

### Consequences to be aware of (by design, not bugs)

1. **No caller attribution in Monday.** The summary note does not say WHICH phone (Ronit vs. the new number) made the call — `userName`/`userPhone` are dropped. If they want that visible, it's a small change: prefix the note with `payload.userName`. Decide when the 2nd user goes live.
2. **Shared lead pool.** If both users call the same lead, both calls land on the same Monday row (counter increments twice, two notes). Correct for one business, worth stating out loud.
3. **Monday API budget.** Every processed call costs Monday API calls (lookup + updates) against the Standard plan's 1,000/day cap. A 2nd active caller raises daily volume, and the calls domain has **no retry queue** — during a daily-cap outage those Monday updates are lost (Salestrail won't retry the webhook). Known gap, tracked in CLAUDE.md/memory. More call volume makes it slightly more likely to matter.
4. **Dedup is per `callId`** — safe with any number of users.

---

## UNVERIFIED — ask Salestrail support (support@liid.com) before assuming

1. **Can add-ons be bought per-seat?** The pricing page prices Recording/CRM add-ons per user/month, but the docs don't say whether the org can license (e.g.) CRM Integration for only one of two seats — or whether an org-wide Push API pushes calls of a seat WITHOUT the CRM add-on. If it pushes anyway, the 2nd seat might not need the $7 add-on. **Do not bank on this** — budget for all three per seat ($18/user/mo), and ask. (Also worth asking whether the Subscription → Purchase flow lets you pick add-ons per seat — that would answer it directly.)
2. **Whether the per-user Integrations → Login step applies to Push API** or only to OAuth CRMs (Salesforce/HubSpot/…). The setup-mistakes doc states it generally ("calls tracked but not pushed to the CRM" until each user logs in); treat it as required — it costs nothing.
3. **Proration** when adding a user mid-billing-cycle: not documented publicly (Purchase flow may show it; support can confirm).
4. **Trial for a new seat in an existing paid org** (the 5-day trial is described for new accounts): not documented.
5. ~~**Pull API credential scope**~~ — **VERIFIED 2026-08-25:** keys are strictly per-org. Org 2 recording `31783d18…`: org 2 key → 302→200, 170 KB m4a; org 1 key → 404 on the same callId. So the `משתמש N` label derived from "which key downloaded it" cannot misattribute.

## Org-2 phone setup — what actually went wrong (2026-08-25)

Device: Galaxy A57 5G, SM-A576B, Android 16 / One UI 8, ILO firmware. User "ortal", line +972509796862 (Ronit's phonebook: "אור הצדיק 2").
- Samsung side was fine all along: Record calls → Auto record calls ON, scope **All calls**.
- **Root cause: Salestrail Recording Directory had been manually set to a folder named "Sales trail"** (`content://…/tree/primary:Sales trail`) instead of where Samsung writes recordings. Tapping **Use Default** ("Directory not selected, using default Audio folder") fixed it immediately — next SIM call showed the "Recorded" label. **Tutorial must say: tap Use Default, never Select Directory.**
- WhatsApp calls from this phone show no recording — expected in built-in mode (APK only).
- Open question: several calls appeared in BOTH orgs' logs with identical timestamps/durations but different callIds and lines (e.g. Ronit's phone logged an outbound call to her own number the second ortal dialed her). Suspect Samsung "Call & text on other devices" call-log continuity between the two Galaxy phones. Not confirmed. Risk: a mirrored call has a different callId per phone → dedup can't catch it → one real call could count twice in Monday. Check the setting on both phones.

---

## Runbook — adding the 2nd number

1. **Buy the license first** (Owner, on Ronit's dashboard): Subscription → **Purchase** → add 1 license with **Essential + Call Recording + CRM Integration** (see UNVERIFIED #1 for the possible $7 saving — ask support). Inviting beyond the purchased count leaves the user without call-data access.
2. **Invite:** User Management → Add User → new person's email → role **User**. (Or send the org sign-up link.) **The person must join via this invite** — signing up on the generic salestrail.io page creates/joins the wrong org (if that happens: delete self via User Management, accept the proper invite).
3. New phone: install the Salestrail app (Play Store) → **log in with the invited email** → grant ALL permission prompts (missing ones show as a red dot in User Management → Permissions).
4. **Per-user integration login:** the new user opens the Call Analytics dashboard (the Push API notification email links there, or Integrations → Apps → Push API → **Login**) and completes the login step. Skipping it = calls tracked in Salestrail but never pushed to our webhook.
5. Phone recording setup (assuming Samsung, cellular-only, same as Ronit):
   1. Phone app → Settings → Record calls → **Auto record calls: ON** (all calls). If "Record calls" is missing, the device/firmware doesn't support built-in recording (check CSC via Settings → About phone → Software information → Service provider SW ver.) → fall back to the Recorder APK route. Google Dialer devices (Pixel) must use the APK regardless.
   2. Make a test call, confirm an audible file appears under Record calls → Recorded calls.
   3. Salestrail app → Settings → Recording Settings → enable recording → **Use built-in call recorder** → point it at the recordings folder if asked.
   4. Battery: Salestrail app → battery **Unrestricted** + add to Never-sleeping apps + disable "Remove permissions if app is unused".
6. **End-to-end test:** call a number that exists as a Monday CRM lead (or create a test lead with the tester's number). Then check:
   1. Salestrail dashboard shows the call WITH recording for the new user.
   2. Server logs: webhook received → 200 (not 401) → "Salestrail call processed" → later "Salestrail recording downloaded" → transcription.
   3. Monday lead row: calls counter +1, last-call date, summary note.
   4. If the call shows on the dashboard but never hits the webhook → step 4 (per-user Login) is the first suspect.
7. Optional (decide): add `userName` to the Monday note so Ronit can tell which phone made each call.

## Sources

- https://www.salestrail.io/pricing
- https://www.salestrail.io/knowledge-base/salestrails-pricing-structure
- https://www.salestrail.io/knowledge-base/modify-manage-or-cancel-your-subscription
- https://www.salestrail.io/knowledge-base/salestrail-free-trial
- https://www.salestrail.io/knowledge-base/push-api-integration
- https://www.salestrail.io/knowledge-base/common-setup-mistakes
- https://www.salestrail.io/knowledge-base/crm-integration-overview
- https://www.salestrail.io/knowledge-base/what-crm-integrations-does-salestrail-support-and-how-do-they-work
- https://www.salestrail.io/knowledge-base/help-issues-with-crm-integrations
- https://www.salestrail.io/knowledge-base/roles-in-an-organisation
- https://www.salestrail.io/knowledge-base/getting-started
- https://www.salestrail.io/knowledge-base/how-call-recording-works
- https://www.salestrail.io/knowledge-base/call-recording-via-the-built-in-recorder
- https://www.salestrail.io/knowledge-base/how-to-record-your-calls-using-the-salestrail-recorder-apk
- https://www.salestrail.io/knowledge-base/salestrail-call-recording-audio-one-sided-causes-and-fixes
- https://www.salestrail.io/knowledge-base/sim/gsm-call-recording-on-samsung-devices-running-one-ui-8-android-16
- https://www.salestrail.io/knowledge-base/no-call-data-on-your-salestrail-dashboard-reasons-and-solutions
- https://www.salestrail.io/api-webhooks
- Unreachable by tooling (404 / JS-only): https://www.salestrail.io/knowledge-base/docs, https://standalone-dev.salestrail.io/integration/apidocs
- Backend code: `Server/src/domains/calls/` (validator, service, client) — inspected 2026-08-11
