# Holiday and birthday greetings through Zernio

- **Date:** 2026-11-03
- **Readers:** Justin (owner of `Server/`), and whoever connects the WhatsApp number
- **Status:** built, switched off until Zernio is connected

## 1. Why

The holidays and birthdays sections should send through **Zernio** (zernio.com). Zernio is one API key in front of WhatsApp's own Cloud API: templates, sending, receipts. It takes the place of DualHook in the costs sheet for greetings.

WhatsApp's own API has one rule that shapes everything here. A business message sent outside the 24 hours after the customer last wrote must be a **template Meta approved**. Holiday and birthday greetings are always outside that window, so every greeting text becomes a template, and Meta reviews it before it can go out. Review usually takes minutes and at most 24 hours.

## 2. Holiday greetings

The four stages the dashboard already shows map onto the flow:

| Stage | Status | What happens |
|---|---|---|
| Write (כתיבה) | `draft` | "ברכה חדשה" opens the next holiday without a greeting. Ronit writes the text and picks the audience: everyone, or one trip. |
| Review (בדיקה) | `in-review` | "שליחה לבדיקת WhatsApp" sends the text to Meta through Zernio as a marketing template. |
| Approve (אישור ושליחה) | `awaiting-approval` | Meta approved it. A test goes to your own WhatsApp, then Ronit approves the send. |
| Track (מעקב) | `scheduled`, `sending`, `completed` | It goes out at its send time, 50 every 10 minutes. Receipts fill in delivered and read. |

The rules:

- **Send time:** noon on the eve. When the eve is Shabbat, it's Friday noon, so nothing goes out on Shabbat. For example, Hanukkah 5787's eve is Friday 4 December 2026, and 17:00 that day is already Shabbat.
- **A changed text** goes back to writing. Meta reviews the new text, and the old template is deleted.
- **A changed audience** after Ronit's approval goes back to her approval.
- **Refusals:** a text Meta refuses comes back to writing with Meta's reason.
- **Checked before review**, for what Meta refuses:
  - an empty text, or one over 1,024 characters;
  - a placeholder at the very start or end;
  - the trip's name in a greeting to everyone (it can't be filled for people without a trip).

## 3. Birthdays

- **Review on save:** saving a new birthday text sends it for review. The text that was already approved keeps going out until the new one is approved.
- **Going back:** returning to the approved text drops the one in review.
- **Approval needed:** birthdays go out on Zernio only once a template is approved.

## 4. Templates

`whatsapp_templates` (migration 005) records every template made from a greeting: its name, the text as written, the body Meta reviews, which value fills each `{{n}}`, and Meta's verdict.

- **Placeholders:** each `{שם פרטי}`, `{שם הקבוצה}` or `{גיל}` becomes the next `{{1}}`, `{{2}}`, and so on. A name used twice is two values.
- **Values:** each outbox message stores its values in the template's order. A recipient missing a value (no first name) is skipped, never sent a gap.
- **Names:** `hanukkah_5787_<6 hex>` and `birthday_<6 hex>`. Meta never reuses a deleted name for 30 days, so every version gets a new one.
- **Category:** `MARKETING`, language `he`, with sample values for the reviewers.

## 5. Zernio calls

| What | Call |
|---|---|
| Send a text for review | `POST /v1/whatsapp/templates` |
| Read a verdict | `GET /v1/whatsapp/templates/{name}?accountId&language` |
| Delete an unused template | `DELETE /v1/whatsapp/templates/{name}?accountId&language` |
| Send one greeting | `POST /v1/inbox/conversations` with `participantId` (972…), `templateName`, `templateLanguage` and `templateParams` |

The send answers with the WhatsApp message id (`wamid…`), which is stored as `provider_message_id`.

**The webhook** is `POST /api/zernio/webhook`. It's signed: `X-Zernio-Signature` is the hex HMAC-SHA256 of the raw body, keyed with `ZERNIO_WEBHOOK_SECRET`. It handles these events:

- **`whatsapp.template.status_updated`:** Meta's verdict, and its reason on a refusal.
- **`message.delivered`, `message.read`, `message.failed`:** they only move a message forward. Two failure codes mean something to the screens:
  - `131026` becomes "invalid number";
  - `131050` (they stopped marketing messages) becomes "blocked" and opts the customer out of greetings.

**Read-back:** templates still in review are also checked every 5 minutes whenever Zernio is set up, in case a webhook is missed.

## 6. Switched off

Nothing changes until it's set up:

| Setting | Needed for |
|---|---|
| `ZERNIO_API_KEY`, `ZERNIO_WHATSAPP_ACCOUNT_ID` | review and test sends. Without them the screens say WhatsApp isn't connected yet; greetings can still be written and saved. |
| `ZERNIO_WEBHOOK_SECRET` | the webhook (503 without it) |
| `GREETINGS_ENABLED=true` and `GREETINGS_CHANNEL=zernio` | sending to customers |
| `RONIT_WA_ALLOWED_NUMBERS` | every real send, test sends included, as before |

**Test sends** go to the WhatsApp number in each person's own details, added in the avatar panel.

## 7. To connect

1. Create a Zernio account and an API key. Connect Ronit's WhatsApp Business number with Embedded Signup. "Coexistence" keeps the number working in the WhatsApp Business app.
2. Meta needs a payment method on the WhatsApp Business Account. Templates are billed per delivered message at the marketing rate for Israel.
3. Register the webhook (`POST /v1/webhooks/settings`):
   - url: `https://api.ronitbarash.site/api/zernio/webhook`;
   - events: the four above;
   - a secret.
4. Set the settings in `Server/.env` and restart `crm`.
5. Send one greeting for review and test it to your own number. Then switch sending on.

A new number starts at Meta's lowest tier: 250 people a day. That covers Ronit's customer list today.
