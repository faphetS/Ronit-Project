# Passport photos from WhatsApp: design

- **Date:** 2026-11-05
- **Status:** approved in chat; not built yet
- **For:** Ronit Barash, אור הצדיק (built by Clix Solution)
- **Readers:** Justin (owner of `Server/`), and whoever builds it or connects Zernio

## 1. Goal

A customer sends a photo of their passport to Ronit's WhatsApp number. The server checks that it is a passport and that it can be read, files it into the CRM database, and answers the customer. The answer is a thank-you, or a request for a clearer photo.

The reading, the check and the filing were built on 2026-11-02 and are switched off ([automation foundation](2026-11-02-automation-foundation-design.md), section 6). This step adds the WhatsApp side and the safeguards that real passports need:
- photos come in through Zernio;
- replies go out through Zernio.

## 2. Decisions

| Question | Choice | Why |
|---|---|---|
| The WhatsApp connection | Zernio, on Ronit's own number with coexistence | Greetings already use Zernio ([greetings design](2026-11-03-greetings-zernio-design.md)), and a number connects to one provider at a time. Justin's `ronit-send` gateway carries text only, and no incoming message reached the server on 2026-11-05 between 07:50 and 12:19 UTC. |
| Where photos are processed | In the server, behind the existing signed Zernio webhook | The reading, the MRZ check and the matching exist and are tested. An n8n flow would rebuild them without the check digits. |
| What the customer is told | Thanks when the passport is filed; a request for a clearer photo when it can't be read; nothing for other photos | The user's choice in chat |
| Scope | WhatsApp photos only | The user left the review screen, the real photo on the customer card and uploads for later (section 12) |

## 3. How it fits together

```
customer's photo ─► Zernio ─► POST /api/zernio/webhook  (signed, event "message.received")
                                 │  saves the photo's details in whatsapp_photos, answers 200 at once
                                 ▼
                    photo worker (started by the webhook; every minute for leftovers)
                      download from Zernio with the API key → encrypt → passport intake
                                 │  AI reads it → MRZ check digits → match by name → save
                                 ▼
                    reply in the same WhatsApp conversation: thanks, a clearer-photo request, or nothing
```

## 4. Receiving a photo

`zernio.webhook.ts` already checks the signature and applies each event id once (`zernio_webhook_events`). It gains `message.received`.

**An event is a photo to read only when all of these hold:**
- the WhatsApp intake is on (section 8). In `test`, the sender's number must be on `RONIT_WA_ALLOWED_NUMBERS`.
- it belongs to Ronit's account (`ZERNIO_WHATSAPP_ACCOUNT_ID`), it is on WhatsApp, and its direction is incoming;
- it has an attachment of type `image`, or of type `file` with an image type. People send photos as files to keep them sharp.
- the image is JPEG, PNG or WebP;
- it was sent within the last 24 hours, WhatsApp's own reply window.
  - Older history that Zernio copies when the number connects is never read or answered.
  - A redelivery after a long outage still is.
- fewer than 20 photos have come from the same conversation in the past hour. This caps the cost of a flood. It counts by conversation because some senders have no phone number.

Each image in a message is a photo of its own. Everything else is ignored: text, stickers, video, audio, PDFs, and the team's own messages from the phone (`message.sent`).

**The webhook answers at once.** Zernio waits 5 seconds for an answer, and makes up to 7 attempts over about two days. So the webhook only stores the photo's details, answers 200, and starts the worker. It never downloads or reads in the request.

**Table `whatsapp_photos`** (migration 006):

| Column | Holds |
|---|---|
| `id` | uuid |
| `message_key` | WhatsApp's message id and the attachment's index (`wamid…#0`), unique: the same photo is stored once |
| `conversation_id` | Zernio's conversation, for the reply |
| `sender_phone` | digits with the country code (`toMsisdn` of `sender.phoneNumber`), or null |
| `sender_name` | the sender's WhatsApp name |
| `media_path` | Zernio's media path, `/v1/whatsapp/media/<id>` |
| `mime_type` | as Zernio gives it |
| `sent_at` | when the customer sent it |
| `status` | `pending`, `done` or `failed` |
| `attempts`, `next_try_at`, `last_error` | download retries |
| `intake_id` | the passport intake it became |

## 5. Reading and filing

**Download.** The worker downloads the photo from Zernio with `Authorization: Bearer ZERNIO_API_KEY`.
- It builds the address itself, from `ZERNIO_API_URL` and a path that must be `/v1/whatsapp/media/<id>`. Nothing else in the event is ever fetched.
- At most 10 MB, and the answer must be an image.
- A failed download is retried after 1, 5, 15 and 60 minutes. Meta keeps incoming media only for a while, so after that the photo is marked `failed`, with a warning in the log and no reply.

**Filing.** The photo goes to `receivePassportPhoto` with source `whatsapp`, the message key as its external id, and the sender's phone and name. The intake then runs as built: the AI reads the photo, `verifyReading` checks it, `decideMatch` finds the customer, and one transaction saves it all.

This step changes only what an outcome keeps:

| Outcome | Status | What's kept | The photo |
|---|---|---|---|
| Filed on the card with that name, or on a new card | `matched`, `new-card` | the passport, an audit entry | kept, encrypted: the passport document |
| Clear, but several customers have that name and none has the sender's number | `needs-review` (`several-name-matches`) | the reading, for the office | kept, encrypted |
| A passport that can't be read | `unreadable` (new; reasons `mrz-unverified`, `low-confidence`, `no-name`) | who sent it and when; nothing from the reading | deleted |
| Not a passport | `not-passport` | who sent it and when; nothing from the reading | deleted |

The `unreadable` status replaces `needs-review` for those three reasons, so `needs-review` means one thing only: the office has to say whose passport it is.

## 6. Replies

Replies go in the customer's own conversation, through `POST /v1/inbox/conversations/{conversationId}/messages` with `{ accountId, message }`. They fall inside WhatsApp's 24-hour window, because the customer has just written.

| Outcome | Reply |
|---|---|
| `matched`, `new-card`, `needs-review` | thanks, with the name on the passport |
| `unreadable` | the clearer-photo request, at most once per conversation per hour |
| `not-passport`, `failed` | none |

**The texts** are code defaults, which `Server/.env` can override, like the `IG_MSG_*` texts:
- `PASSPORT_MSG_RECEIVED`: "תודה רבה! הדרכון של {שם} התקבל ונשמר אצלנו 🙏". Here `{שם}` is the passport's Hebrew name, or its Latin name in title case.
- `PASSPORT_MSG_UNREADABLE`: "לא הצלחנו לקרוא את הדרכון מהתמונה. אפשר לשלוח שוב צילום של עמוד הפרטים? חשוב שכל העמוד ייכנס לתמונה, כולל שתי השורות שבתחתית, ושלא יהיה סנוור 🙏"

**Where replies are recorded.** On the intake's own row, in columns that migration 006 adds: `reply`, `reply_claimed_at`, `reply_sent_at`, `reply_message_id`, `reply_failure`.
- A reply is claimed before it is sent, so it is sent at most once.
- One cut off mid-send isn't resent: a missing thank-you is harmless, but a doubled one is noise.
- Replies are not kept in `messages`. The greetings outbox sends every queued row there, and the customer card reads that table as greeting history.

**Who gets replies.** Replies follow the intake's own switch, not `RONIT_WA_ALLOWED_NUMBERS`.
- In `test`, only the numbers on the list are read and answered.
- In `live`, everyone who sent a photo is.
- A reply only answers someone who has just written. The list keeps guarding outreach: the Uman flows and the greetings.

## 7. Safety

- **Photos are encrypted at rest**, with AES-256-GCM and a random IV per file.
  - The key is `PASSPORT_FILES_KEY` (32 bytes, base64), kept only in `Server/.env` and in the team's password manager. A lost key means lost photos.
  - Without the key, the intake refuses to save a photo, so nothing is ever written unencrypted.
  - Files stay `0600` in a `0700` folder. No photo has been saved yet (0 files on 2026-11-05), so there is nothing to convert.
- **Photos are decrypted only in memory**, for the AI to read.
- **Only signed events are read**, and media comes only from Zernio's API (section 5).
- **The logs never hold passport details**, image bytes or replies' text.
- **The reader is unchanged:** OpenRouter with `provider.data_collection: "deny"`. Before going live, check that `OPENROUTER_PASSPORT_MODEL` is still served.
- **On the dashboard**, passports stay limited to the roles with passport access, as now.

## 8. Settings

| Variable | Default | Meaning |
|---|---|---|
| `PASSPORTS_WHATSAPP` | `off` | `off`: WhatsApp photos aren't read. `test`: only numbers on `RONIT_WA_ALLOWED_NUMBERS` are read and answered. `live`: everyone. It needs `PASSPORTS_ENABLED=true`, `PASSPORT_FILES_KEY` and the Zernio settings. |
| `PASSPORT_FILES_KEY` | unset | The photos' encryption key |
| `PASSPORT_MSG_RECEIVED`, `PASSPORT_MSG_UNREADABLE` | the texts in section 6 | The replies |

Already in place: `PASSPORTS_ENABLED`, `PASSPORT_FILES_DIR`, `OPENROUTER_PASSPORT_MODEL`, `PASSPORT_MIN_CONFIDENCE`, `ZERNIO_API_KEY`, `ZERNIO_WHATSAPP_ACCOUNT_ID`, `ZERNIO_WEBHOOK_SECRET`, `ZERNIO_API_URL`.

## 9. Dashboard

- The WhatsApp passports inbox lists passports only. Other photos, failed ones and photos still being read stay out.
- The inbox gets a new result, `unreadable`: "ביקשנו צילום ברור יותר" / "Asked for a clearer photo".
- The overview's passports card counts the same way.
- The reasons show in Hebrew or English. Today both the inbox and the overview card print the raw code, such as `no-match` or `phone-of-other-customer`.
- `needs-review` keeps its disabled Review button until the review screen is built.

## 10. Turning it on

1. **Zernio**, done once and shared with the greetings ([greetings design](2026-11-03-greetings-zernio-design.md), section 7):
   - an account and an API key with inbox access;
   - Ronit connects her number with coexistence. The number must be on the WhatsApp Business app, not regular WhatsApp.
   - the webhook registered with `message.received` among its events.
2. **Justin's gateway:** check with Justin that it still sends from the number once it is connected. It sends the Uman welcome.
3. **The VPS:**
   - back up `Server/.env`;
   - set the Zernio settings, `PASSPORTS_ENABLED=true`, `PASSPORTS_WHATSAPP=test`, and `PASSPORT_FILES_KEY`, generated on the server and saved in the password manager;
   - `git pull`, then rebuild `crm`, which applies migration 006.
4. **Test from a number on the list:**
   - a passport photo: filed, with a thank-you;
   - a blurry one: a request for a clearer photo;
   - an ordinary photo: no reply;
   - the same photo twice: filed once;
   - a photo sent as a file.

   Also check the parts Zernio's docs leave open: that a coexistence number delivers customers' messages as `message.received`, and how a photo sent as a file arrives.
5. **Then switch** `PASSPORTS_WHATSAPP=live`.

## 11. Testing

- Vitest, and PGlite for the SQL, in the server's style.
- **The webhook:** signed `message.received` events go in, and a `whatsapp_photos` row comes out, or none. Events to cover:
  - an image, an image sent as a file, a PDF, text;
  - two images in one message;
  - an old message, another account's event, the team's own message;
  - an unsigned or replayed event;
  - each switch mode.
- **The worker:** a fake Zernio (download and reply) and a fake reader. It covers:
  - download retries and the give-up;
  - one intake per photo;
  - the reply for each outcome;
  - the request at most once an hour;
  - the cap of 20 photos per conversation per hour;
  - a reply claimed once, and one cut off mid-send.
- **Encryption:** a round trip, a file that can't be read without the key, and the intake refusing to save without one.
- **The inbox:** only passports are listed, and the `unreadable` result is new.
- **Fixtures** use the ICAO 9303 specimen passport (Utopia, ERIKSSON ANNA MARIA), never a real one.

## 12. Not in this step

- **The review screen:** `needs-review` intakes wait in the inbox, and its Review button stays disabled.
- **The real passport photo** on the customer card.
- **Uploading a passport from the dashboard**, including passports already in old chats, which the connection doesn't see.
- **PDF scans:** only photos are read.
- **Updating Monday's passport column.**
- **Copying the database and the photos off the server.** Backups stay on the VPS.

Every passport filed brings a date of birth, which the birthday greetings (built, switched off) can use later.
