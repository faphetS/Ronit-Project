# Call Recording Research — Full Market Comparison

> Last updated: 2026-04-24

## Master Comparison Matrix

| App | Records Cellular | Method | API/Webhooks | Phone # in Data | Hebrew STT | Israel OK | iOS | Android | Monthly Cost |
|---|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|---:|
| **Timeless.day** | YES | Merge-call | YES (REST) | No (gap) | YES (60+ langs) | YES (Israeli co.) | YES | YES | $29-39 |
| **Salestrail** | YES (Android) | Native recorder | YES (webhooks) | YES | No (external needed) | YES | Track only | Full | ~$13 |
| **PLAUD Note** | YES | Hardware vibration mic | YES (early access) | Unclear | YES (112 langs) | YES | YES | YES | $159 hw + $18/mo |
| **Mobile2CRM** | YES | Virtual business number | YES | YES | Unconfirmed | YES (Israeli co.) | YES | YES | $30 |
| **JustCall** | No (VoIP) | Softphone | YES (REST) | YES | Unconfirmed | YES (+972) | YES | YES | $29 (2-user min) |
| **Zoom Phone** | No (VoIP) | Softphone | YES | YES | YES (Sumit-AI) | YES (+972) | YES | YES | $10-22 |
| **Aircall** | No (VoIP) | Softphone | YES | YES | No | YES (+972) | YES | YES | $30 (3-user min) |
| **Quo (OpenPhone)** | No (VoIP) | Softphone | BEST | YES | Unconfirmed | No +972 nums | YES | YES | $15-23 |
| **Fireflies.ai** | No | Speakerphone workaround | YES (GraphQL) | No (only via VoIP) | YES (100+ langs) | N/A | YES | YES | $19-39 |
| **TapeACall** | YES | Merge-call | NONE | No | Unconfirmed | YES | YES | YES | $11/year |
| **Cube ACR** | YES (Android) | Native recorder | NONE | No | No | YES | Merge only | Full | $10/year |
| **Samsung native** | YES | OS-level | NONE | No | No | YES | No | Samsung | Free |
| **Google Phone** | YES | OS-level | NONE | No | No | Unconfirmed | No | Pixel 6+ | Free |
| **Recordator** | YES | Dial-in bridge | NONE | Yes (server-side) | No | No local # | Any | Any | $0.10-0.15/min |
| **Dubber** | YES | Carrier-level | Partial | YES | Unconfirmed | Needs carrier deal | N/A | N/A | $15-50 |

---

## Tier 1 — Best fits for Ronit's use case

---

### Timeless.day (formerly timeOS)

**What it is:** Agentic meeting platform — records meetings (Zoom, Meet, Teams, Slack), transcribes, generates summaries, triggers AI agents. Israeli company (Tel Aviv), founded by Tommy Barav and Eilon Mor. $3.3M seed from Resolute Ventures (Feb 2021).

**Phone recorder feature — confirmed:**
- **Terms of Service** explicitly reference a "phone recorder feature" that incurs telephony charges: _"Such charges may result from calls made using our phone recorder feature, additional Slack membership, and other such integrations."_
- The API lists `"phone"` as an official meeting source type: `google_meet`, `zoom`, `teams`, `slack`, `whatsapp`, `phone`, `upload`, `desktop`
- Official Hebrew tutorial playlist on YouTube: https://www.youtube.com/playlist?list=PL0NllPHJhix06mOGNIGnzuaD1Q-3dGbHF

**How the merge-call pattern works (industry standard, confirmed by YouTube tutorial):**
1. You're on a live cellular call with the other person
2. Tap "Add Call" on your phone (iOS) or equivalent on Android
3. Dial the Timeless recording number (bridge number issued to your account)
4. Timeless answers and starts recording
5. Tap "Merge Calls" — 3-way conference: you + other person + Timeless recording line
6. Timeless records the merged audio stream with full call quality
7. Call ends → Timeless processes → transcription, summary, action items
8. Webhook fires (`meeting.transcript_ready`) with the meeting ID

**Key differentiators:**
- Bot-free meeting recording (no bot joins Zoom/Meet calls)
- AI agents triggered by verbal cues
- Rooms — organize by client/project
- Israeli-made — Hebrew is first-class

**API details:**
- **Base URL:** `https://api.timeless.day/v1`
- **Auth:** Bearer token (64-char hex)
- **Rate limits:** 60 req/min standard, 20/min webhooks, 10/min uploads
- **Endpoints:**
  - `GET /meetings` — list (filter by status, dates, participants, company, room, semantic search)
  - `GET /meetings/{id}/transcript` — speaker-diarized (speaker IDs, names, timestamps, language)
  - `GET /meetings/{id}/recording` — temporary signed download URL
  - `GET /documents/{id}` — AI artifacts (summary, action items, notes) in HTML/markdown/raw/docx/JSON
  - `POST /upload` — upload audio/video (mp3, mp4, wav, webm, ogg, aac, flac, quicktime)
- **Webhook events:**
  - `meeting.transcript_ready`
  - `meeting.initial_summary_ready`
  - HMAC-SHA256 signed (`X-Webhook-Signature`, `sha256=<hex>`)
  - 10s timeout, 3 retries (1s, 10s, 60s delays)
- **Participant schema (limitation):**
  - `name` (string | null), `email` (string), `title` (string | null), `company` (string | null)
  - **No `phoneNumber` field**

**Pricing:**
| Plan | Monthly | Annual | Notable |
|---|---|---|---|
| Free | $0 | $0 | 5 AI meetings (90 min each) |
| Pro | $29/mo | $19/mo | Unlimited meetings, storage |
| Max | $39/mo | $29/mo | Unlimited API, webhooks, MCP server |
| Business | $35/mo | $25/mo | Team workspace, admin API, SOC 2 |

**Gaps to resolve (contact support):**
1. Does phone recorder work with +972 Israeli numbers?
2. Does API expose the other party's phone number for `phone`-source meetings?
3. Which plan tier includes the phone recorder?
4. Can you pass metadata (like lead phone number) when initiating a recording?

---

### Salestrail (salestrail.io) — DISCOVERED IN RESEARCH

**What it is:** Mobile call tracking + recording platform designed for sales teams. Records actual SIM/cellular calls on Android.

**Recording method (Android):**
- Integrates with the phone's **built-in native call recorder**
- Also provides a dedicated **Salestrail Recorder App** for devices without native recording (e.g., Google Dialer devices)
- Also records **WhatsApp and WhatsApp Business calls**
- No merge-call needed — direct capture

**iOS limitation:** Call TRACKING only (logs metadata: who called, when, duration). **No call recording on iOS.**

**API/webhook details:**
- **Push API (webhooks):** Pushes call events, answer status, and recording URLs to your endpoints in real-time
- **Pull API:** Access call metadata, durations, and audio file URLs
- **Phone number in data:** YES — call metadata includes caller/called numbers
- **CRM integrations:** Salesforce, HubSpot, Microsoft Dynamics, LeadSquared

**Transcription:** Has speech-to-text "call notes" feature. **Hebrew support NOT confirmed** — would need external STT (Deepgram, Whisper, Google STT all support Hebrew).

**Israel compatibility:** Works with any SIM card in any country. No carrier dependency.

**Pricing:**
- Essential: $5.60/user/mo (annual) or $8/mo — call tracking + analytics
- Call Recording add-on: +$2.10/mo (annual) or +$3/mo — Android only
- CRM Integration add-on: +$4.90/mo (annual) or +$7/mo — API/webhooks, CRM sync
- **Total for full stack: ~$12.60/user/month (annual)**

**Why it's a top contender:** Cheapest option with real cellular recording + API + phone numbers. Perfect fit if Ronit uses Android. Hebrew gap solvable by piping audio through Deepgram (`language: "he"`).

---

### PLAUD Note (plaud.ai) — HARDWARE DEVICE

**What it is:** Credit-card-thin device that magnetically attaches to the back of your phone. Uses THREE microphones:
- 2 air-conduction sensors for ambient sound
- 1 **vibration-conduction sensor** that captures the phone's earpiece vibrations when held to ear

**Recording method:** Flip physical switch to "Phone Call" mode. Records BOTH sides — your voice via air-conduction mic, other party via vibration sensor picking up earpiece output. **No merge-call. No VoIP. Works with native dialer on any phone.**

**API/webhook details:**
- Developer Platform launched — REST APIs and SDKs
- Webhook events for recording completion, transcription ready
- Output: transcripts, summaries, metadata in JSON
- Speaker diarization (identifies speakers)
- SOC 2, HIPAA, GDPR compliant
- **Currently in waitlist/early access** — "API pricing coming soon"
- Zapier integration also available

**Phone number in API:** UNCLEAR — records audio only, not call metadata. May get phone number from device call log if permissions allow. Needs verification.

**Transcription:** **112 languages including Hebrew.** Professional-grade with speaker labels. Custom vocabulary support. 300 min/month free with device.

**Israel compatibility:** Ships internationally. No carrier dependency. Works with any phone, any carrier.

**Pricing:**
- Hardware: $159 (PLAUD Note) or $179-189 (PLAUD Note Pro)
- Starter: Free (300 min/month, included with device)
- Pro: $17.99/month or $99.99/year
- Unlimited: $29.99/month or $239.99/year
- Developer API: Usage-based (contact sales)

**Why it's a top contender:** Only hardware solution. Works on iOS AND Android. Best Hebrew transcription (112 languages). No workflow change. Gap: API is early-access and phone number metadata is uncertain.

---

## Tier 2 — VoIP alternatives (change Ronit's dialer workflow)

---

### JustCall (justcall.io)

**What it is:** VoIP cloud phone system. Replaces native dialer.

**Israel support:** YES — offers **+972 numbers** with local area codes (02 Jerusalem, 03 Tel Aviv, 04 Haifa, 050/052/054/058 mobile). Requires Israeli ID (Teudat Zehut) or passport + utility bill for KYC. Numbers activated within 24-48 hours.

**API/webhook details:**
- Full REST API at `developer.justcall.io`
- Webhook payloads include: `contact_number`, `contact_name`, `justcall_number`, agent info, `call_date`, `call_time`, recording details, transcripts, AI summaries, sentiment analysis
- Auth: api_key:api_secret
- Rate limits: 200-800 req/hour depending on plan

**Transcription:** Unlimited transcription on Team plan+. AI features on Pro Plus. **Hebrew unconfirmed.**

**Pricing:**
- Team: $29/user/mo (annual, **2-user minimum = $58/mo**)
- Pro: $49/user/mo
- Pro Plus: $89/user/mo (AI notetaker, sentiment)

**Downside:** VoIP (not cellular), 2-user minimum, Hebrew unconfirmed.

---

### Zoom Phone

**Israel support:** YES — +972 numbers available.

**Hebrew transcription:** **YES — partnership with Israeli AI startup Sumit-AI** for advanced Hebrew speech recognition with dialect variations and contextual nuances. Best Hebrew support found in any VoIP option.

**API:** Strong — recording management, transcript download (`GET /v2/phone/recording_transcript/download/{recordingId}`), webhook events (`phone.recording_transcript_completed`).

**Pricing:** $10-22.49/user/mo. Additional charges for international calling.

**Downside:** VoIP, Zoom ecosystem lock-in, pricing complexity with add-ons.

---

### Aircall (aircall.io)

**Israel support:** YES — local geographic numbers available.

**API:** Strong REST API with webhooks for calls, recordings, transcription.

**Hebrew transcription:** **NO — only English, French, German, Spanish** for live transcription.

**Pricing:** $30/license/mo (**3-license minimum = $90/mo**). Too expensive for single user.

**Verdict:** Hebrew gap + high minimum cost = not suitable.

---

### Quo / OpenPhone (quo.com)

**Best API of all options** — full REST, webhooks for `call.completed`, `call.recording.completed`, `call.transcript.completed`, `call.summary.completed`. Payloads include both parties' phone numbers, recording URLs, full transcript text. HMAC-SHA256 signed.

**Israel support:** **NO — US and Canadian numbers only.** Dealbreaker.

**Pricing:** $15-23/user/mo.

**Verdict:** Best API but no +972 numbers. Not viable for Israel.

---

## Tier 3 — Consumer apps (no API, not automatable)

---

### TapeACall (tapeacall.com)

**Recording method:** Merge-call. Press record → app dials TapeACall recording line → tap merge → 3-way conference recorded.

**Israel:** Claims "#1 business app in Israel." Works internationally but dials US recording line — Israeli carriers may charge international rates per call.

**API:** **NONE.** Zero programmatic access. Recordings stay in-app.

**Export:** Dropbox, Google Drive, Evernote, email (MP3).

**Pricing:** ~$11/year. Unlimited recordings.

**Verdict:** Cheapest recorder but zero automation capability. Cannot match to CRM.

---

### Cube ACR (cubeacr.app)

**Android:** Direct audio capture — records cellular + VoIP (WhatsApp, Viber, Telegram, etc.). Some devices need companion "Cube ACR Helper" app.
**iOS:** Merge-call method only.

**API:** NONE. Cloud backup to Google Drive/Dropbox/OneDrive.

**Pricing:** Free version available. Premium ~$10/year.

**Verdict:** Great personal recorder on Android. No API = no automation.

---

### Samsung Native Call Recorder

**Israel:** YES — Israel (CSC code ILO) is on Samsung's enabled list.

**API:** NONE. Recordings saved as local audio files.

**Workaround:** Third-party apps (ACR by NLL) can auto-upload recordings to Google Drive/FTP/webhooks, but no structured metadata (phone numbers).

**Verdict:** Works but no API. Would need fragile chain of folder-watching + upload.

---

### Google Phone Native Recording

**Israel:** NOT CONFIRMED as enabled. Multiple Israeli users report it's unavailable. Feature rollout depends on local law recognition.

**API:** NONE.

**Verdict:** Probably doesn't work in Israel. No API even if it did.

---

## Tier 4 — Enterprise / carrier-level (likely overkill)

---

### Mobile2CRM (mobile2crm.com) — Israeli company

**Recording method:** Virtual business number overlay. Assigns a new business mobile number via app. All calls to/from that number captured at network level (not VoIP). Actual cellular service.

**API:** YES — "comprehensive API" for organizations. Salesforce, Pipedrive, HubSpot, Creatio integrations.

**Phone number in data:** YES — inherently captures calling/called numbers.

**Israel:** **Headquartered in Israel.** Compatible with any operator.

**Pricing:** $30/user/month. Free trial available.

**Catch:** Requires using a NEW business number (not Ronit's existing number). Enterprise-oriented.

---

### Dubber (dubber.net)

**Recording method:** Carrier-level recording — connects to telecom infrastructure, records at network level. Highest quality.

**Israel:** 150+ carrier partnerships globally. **No confirmed Israeli carrier partnership.**

**Pricing:** $15-50/user/mo.

**Verdict:** Would be ideal but likely no Israeli carrier support. Not viable without it.

---

## Fireflies.ai — Full Details

### What it is
AI meeting assistant — bot joins Zoom/Meet/Teams/Webex calls, records, transcribes, generates summaries. US company (San Francisco).

### Cellular call recording — NOT supported
Fireflies **cannot record cellular phone calls.** Confirmed in their own documentation and blog.

### The workaround they recommend (impractical)
1. Open Fireflies mobile app on **Device A** and start recording
2. Make the cellular call on **Device B** on speakerphone at max volume
3. Hold both devices close together so Device A's mic captures speaker audio
4. Stop recording when call ends

**Problems:** Requires two devices, poor audio quality, no caller metadata, Fireflies doesn't know who's on the call.

### Mobile app capabilities
- Record in-person conversations via phone microphone (voice memo style)
- Add Fireflies bot to live online meetings from mobile
- Upload audio/video files (MP3, MP4, M4A, WAV)
- View transcripts, summaries, action items
- iOS and Android

### API details
- **Type:** GraphQL
- **Upload mutation:** `uploadAudio` — accepts `url`, `title`, `webhook`, `custom_language`, `attendees` array (`displayName`, `email`, `phoneNumber`)
- **Transcript query:** `transcript(id)` — returns `meeting_attendees`, `speakers`, `sentences` (speaker attributed), `summary`, `audio_url`
- **Webhook:** POST on transcription complete, `x-hub-signature` (SHA-256 HMAC)
- **MeetingAttendee schema:** `displayName`, `email`, `phoneNumber`, `name`, `location` (deprecated)
  - `phoneNumber` only populated via VoIP dialer integrations (Aircall, RingCentral, Quo, JustCall, Zoom Phone) or manually via `uploadAudio` attendees array

### VoIP dialer integrations (only way to get phone numbers)
Aircall, RingCentral, Quo (OpenPhone), JustCall, Zoom Phone, Outreach, Salesloft

### Pricing
| Plan | Monthly | Annual | Notable |
|---|---|---|---|
| Free | $0 | $0 | 2-hr max/recording, 800 min storage |
| Pro | $18/mo | $10/mo | 8,000 min storage |
| Business | $29/mo | $19/mo | Unlimited storage, API access |
| Enterprise | $39/mo | $39/mo | Custom retention, team webhooks |

### Hebrew transcription
- Supported (language code `he`, 100+ languages)
- Pass `custom_language: "he"` in `uploadAudio`
- No Hebrew-specific accuracy benchmarks
- Multi-language mode in beta

### Fireflies verdict
Good transcription API. Useful as a **transcription backend** if recordings are uploaded from another source. But cannot record cellular calls itself.

---

## Other defunct/irrelevant options

- **Rev Call Recorder** — SHUT DOWN in late 2025. No longer functional.
- **RecMyCalls** — Website returning 404. Possibly defunct. No API.
- **Recordator** — No Israel dial-in number (US/UK/CA/AU only). No API. Pay-per-minute.
- **Otter.ai** — Cannot record cellular calls. Transcription-only.
- **Notta** — Cannot record cellular calls. Has a hardware device (Notta Memo) but it's a meeting mic, not a call recorder.

---

## CRM matching problem (phone number gap)

Most cellular recording solutions do NOT return the other party's phone number in their API. Workarounds:

1. **Salestrail** — DOES include phone numbers in webhook payloads. Best automatic matching.
2. **Timing correlation** — Match recording timestamp to last lead Ronit was working on in Monday.com
3. **Pre-call tagging** — Before calling, Ronit taps a button that logs "about to call lead X" → backend matches next recording to that lead
4. **Manual association** — Ronit selects the lead after the call
5. **Upload with metadata** — Upload recording to Fireflies/Timeless with phone number in payload (Fireflies `attendees` array supports this)

---

## Legal note — Israel

Israel uses **one-party consent** for call recording. Ronit can legally record her own sales calls without notifying the other party. A 2016 proposal for two-party consent was shelved.

---

## Recommended architecture

### Option A: Salestrail + Deepgram (if Ronit uses Android)
**Cost: ~$13/mo + Deepgram usage (~$0.0043/min Hebrew)**

1. Salestrail auto-records SIM calls on Android
2. Webhook fires to `POST /api/calls/webhook` with recording URL + phone numbers
3. Backend downloads recording, sends to Deepgram API (`language: "he"`)
4. Transcript + phone number used to match Monday.com CRM lead
5. Call summary generated via OpenRouter (already in stack)

**Pros:** Cheapest, real cellular, automatic phone numbers, no workflow change.
**Cons:** Android-only recording. Hebrew STT is external (extra integration).

### Option B: Timeless phone recorder (iOS + Android)
**Cost: $29-39/mo (Max plan for API)**

1. Ronit initiates merge-call during cellular call → Timeless records
2. Webhook fires `meeting.transcript_ready`
3. Backend fetches transcript + recording via API
4. Hebrew transcription built-in
5. **Phone number matching:** Needs workaround (pre-call tagging or timing correlation)

**Pros:** Works on both platforms, Hebrew built-in, Israeli company.
**Cons:** Merge-call adds friction. Phone number gap in API. More expensive.

### Option C: JustCall VoIP (changes workflow)
**Cost: $58/mo minimum (2-user min)**

1. Ronit calls through JustCall app using +972 number
2. Auto-records, transcribes
3. Webhook fires with full metadata including phone numbers
4. Backend matches to Monday.com lead

**Pros:** Cleanest API, automatic phone numbers, no external STT needed.
**Cons:** VoIP (not cellular), changes workflow, $58/mo, Hebrew STT unconfirmed.

### Option D: PLAUD Note hardware (any phone, once API is GA)
**Cost: $159 one-time + $18/mo**

1. PLAUD attached to phone records via vibration sensor
2. Webhook fires when transcription complete
3. Hebrew transcription built-in (112 languages)
4. **Phone number matching:** Needs workaround

**Pros:** Works on any phone, best Hebrew STT, no merge-call friction.
**Cons:** Hardware purchase, API in early access/waitlist, phone number gap.

---

## Questions to resolve before choosing

1. **Does Ronit use iPhone or Android?** → Android opens Salestrail path
2. **Is Ronit willing to do the merge-call step?** → Opens Timeless path
3. **Is Ronit willing to switch to a VoIP dialer app?** → Opens JustCall/Zoom Phone path
4. **Contact Timeless support:** +972 availability, phone number in API, which plan includes phone recorder
5. **Contact Salestrail:** Hebrew STT status, Israel-specific support
6. **Contact PLAUD:** Developer API timeline for GA, phone number metadata availability
