# Staff sign-in: design

- **Date:** 2026-11-02
- **Status:** approved in chat; built on `feat/staff-sign-in`
- **For:** Ronit Barash, אור הצדיק (built by Clix Solution)
- **Readers:** Justin (owner of `Server/`), and whoever builds the dashboard API next

## 1. Goal

Ronit's team signs in to the dashboard with a real account. This comes before the dashboard reads any real data, because the API will serve passports and phone numbers, and the PRD says that access is limited to authorized users.

This is step 1 of 2:

1. **Sign-in (this step):** registered accounts, "Continue with Google", a code by email on a new device, and sessions. The dashboard's sign-in runs against the server. Every other screen stays on demo data.
2. **The data (next):** the dashboard API one area at a time, with the roles enforced: customers and passports, groups, greetings, birthdays, then users. Leads come last, with the Monday import.

## 2. Decisions

| Question | Choice | Why |
|---|---|---|
| Who can get in | Only emails the office registered. No sign-up page | A small team, and passport data |
| First step | Google's own button (Google Identity Services): "Continue as …" with the account's name, and Google's account picker in a pop-up. Its ID token is checked against Google's signing keys. The server-run redirect flow (authorization code with PKCE) is the fallback when the button can't load | No passwords to forget, reset, guess or leak. Google only, and Google's own button, both chosen in chat |
| Second step | A 6-digit code by email, on a device that isn't remembered | Chosen in chat. Its limits are in section 11 |
| Sending email | SMTP: Gmail with an app password for now. Resend, from `no-reply@` on Ronit's domain, once its DNS records can be added | Resend can't send to other people until its DNS records are on the domain. Switching providers is only a change of settings |
| How the browser stays signed in | An `HttpOnly` cookie on the dashboard's own host, with server-side sessions. Vercel passes `/api/auth` on to the server (`dashboard/vercel.json`; the dashboard API joins it in step 2), so the browser only ever talks to the dashboard | Page scripts can't read it, and a session can be ended from the server. It works on any dashboard address |
| The dashboard's address | `or-hatzadik-dashboard.vercel.app` for now; `app.ronitbarash.site` once the DNS can be changed | Decided in chat: no domain for now. With the Vercel routing, the cookie is first-party on either address |

## 3. How it works

```
office registers name + email + role ──► invite email: "sign in at app.ronitbarash.site with Google"

Google's button: "Continue as …"
  GET  /api/auth/google/nonce        a nonce for the button, sealed into a cookie
  (Google's pop-up: pick the account) ─► an ID token
  POST /api/auth/google/credential   the ID token
     ├─ not registered ──────► 403 NOT_REGISTERED
     ├─ device remembered ───► signed in
     └─ otherwise ───────────► code emailed, the code step

Fallback, when the button can't load: "Continue with Google" by redirect
  GET /api/auth/google?remember=1&returnTo=/customers ─► Google (pick the account)
  GET /api/auth/google/callback
     ├─ not registered ──────► /login?error=not-registered
     ├─ device remembered ───► the page (signed in)
     └─ otherwise ───────────► code emailed ─► /login?step=code

The code
  GET  /api/auth/code         where it went (r***@gmail.com)
  POST /api/auth/code/resend  a new code, a minute later
  POST /api/auth/verify       the code ─► signed in

GET  /api/auth/session   the signed-in user, or 401
POST /api/auth/sign-out
```

**Google**
- **Google's button.**
  - Before the button shows, the server hands out a random nonce, sealed into a 30-minute cookie. Google puts the nonce inside the ID token, so a token meant for another browser, or a replayed one, doesn't fit.
  - The ID token reaches the server through the browser. So its RS256 signature is checked against Google's published keys, which are cached as long as Google allows. Then its issuer, audience, expiry, nonce and verified email are checked.
  - The button needs the dashboard's address under "Authorized JavaScript origins" on the OAuth client.
- **The fallback, by redirect.**
  - The server sends the browser to Google with a random state, nonce and PKCE challenge. They're sealed into a 10-minute cookie that has to come back with Google's answer.
  - That ID token comes straight from Google's token endpoint over TLS, so its claims are checked the same way.
- The first sign-in links the Google account (its `sub`) to the registered email. After that only that Google account gets in, even if the person's Google email changes, or someone else later opens a Google account under the same address.
- "Remember me" and the page to land on travel inside the sealed cookie (redirect), or with the ID token (button). The landing page must be a path inside the dashboard.

**The code**
- 6 random digits, emailed to the registered address, with the code in the subject, so the phone's notification shows it.
- It works for 10 minutes and allows 5 tries. "Send again" works a minute after the last send, 3 codes in all, and each new code replaces the old one.
- It's stored only as an HMAC keyed with `AUTH_SECRET`, so a database dump can't be turned back into codes.
- When the email can't be sent, the step is deleted and the screen says so.
- **Remember me on this device:** the device skips the code for 30 days, and the sign-in survives closing the browser. After an automatic sign-out, it's Google again, without the code.
- With the "two-step required" switch off, Google alone signs in.

**Sessions**
- 12 hours, or 30 days with "remember me".
- When the "auto sign-out" switch is on (the default), a session ends after 30 minutes with no requests. Any signed-in request counts as activity.
- Sign-out ends the session on the server.

**Devices**
- Each browser gets a random device ID on its first sign-in.
- That's how "sign-in from a new device" is detected for the access log.
- It's also what "remember me" trusts. Several people can be remembered on one shared office computer.

## 4. Protection

**Cookies**

All are `HttpOnly; Secure; Path=/`, and the `__Host-` prefix pins them to the dashboard's host. That's the only host the browser talks to.

| Cookie | Holds | SameSite | Lifetime |
|---|---|---|---|
| `__Host-oh_gnonce` | the sealed nonce behind Google's button | Strict | 30 minutes |
| `__Host-oh_google` | the sealed Google step (redirect fallback) | Lax, so it comes back on Google's redirect | 10 minutes |
| `__Host-oh_challenge` | the step waiting for the code | Strict | 30 minutes |
| `__Host-oh_session` | the session | Strict | browser session, or 30 days with "remember me" |
| `__Host-oh_device` | the device ID | Strict | 1 year |

**What the server stores**
- Session, device and step tokens are 32 random bytes. The database keeps only their SHA-256.
- Codes are kept as HMACs, as above.

**Limits**
- 5 wrong codes in a row lock the account for 15 minutes.
- 30 code requests (checks and resends) per IP per 15 minutes, on top of the server's general `/api` limit. Requests arrive through Vercel, so this counts everyone together. The per-account lockout is what stops guessing.

**Requests from other sites**
- State-changing requests to `/api/auth` must carry `Origin: <DASHBOARD_URL>`. Anything else gets 403 `ORIGIN_NOT_ALLOWED`.
- It's on top of `SameSite`, and stays right whatever address the dashboard has.
- The callback always answers with a redirect to the dashboard, never with JSON. Failures arrive as `?error=` codes: `not-registered`, `google-failed`, `too-many-attempts`, `email-failed`, and `cancelled`, which shows nothing.

**Access log** (`audit_log`)
- `new-device-sign-in`
- `sign-in-refused`, with the email that tried
- `sign-in-locked`
- From the server console: `staff-invited`, `sign-in-reset` and `staff-disabled`.

## 5. Database

Migration `002_staff_sign_in`:

| Table | Holds |
|---|---|
| `staff_users` (new columns) | the linked Google account (`google_sub`), failed tries, the lock, last sign-in, disabled. Emails are stored lowercase |
| `staff_sessions` | token hash, remember, created, last seen, expiry, ended, IP, browser |
| `staff_devices` | device token hash per person: first and last seen, trusted until |
| `staff_sign_in_challenges` | the code step: token hash, code HMAC, remember, the page to land on, tries, sends, expiry |
| `security_settings` | one row, the users screen's switches: two-step required, mask passport numbers, auto sign-out and its minutes, passport access log. All on, 30 minutes |

## 6. Accounts from the server console

Until the users screen is connected:

```
docker exec root-crm-1 node dist/scripts/staff-user.js invite --email <google email> --name "<name>" --role admin|office|sales [--passport-access] [--phone <whatsapp>]
docker exec root-crm-1 node dist/scripts/staff-user.js reset-sign-in --email <email>
docker exec root-crm-1 node dist/scripts/staff-user.js disable --email <email>
```

- `invite` registers the person and emails them where to sign in. Without SMTP it prints the line to pass on by hand.
- `reset-sign-in` is for a replaced Google account or a lost phone. It unlinks the Google account, forgets remembered devices and ends every session.
- `disable` closes the account and signs the person out everywhere.

## 7. The dashboard

- **The sign-in card:** Google's own button and "remember me". The button needs `VITE_GOOGLE_CLIENT_ID`. Without it (the demo, tests), or when Google's script can't load, our own button in Google's style is used instead, and it goes by redirect. The code step shows where the code went, the code field, "send again" and "back". `?error=` from the callback is put in words.
- **`SessionService`:**
  - `startGoogle` returns where to send the browser;
  - `pendingCode`, `resendCode` and `verifyCode` handle the code;
  - `verifyCode` answers with the page to land on.
- **The demo data's version:** Google is skipped, and any 6 digits pass.
- **The HTTP adapter:** `data/http/` holds a small `fetch` client (`credentials: "include"`) and the session adapter.
- **Which services are live:**
  - `VITE_HTTP_SERVICES` lists the services that use the API (`session` now, `all` later). The rest stay on demo data.
  - `VITE_API_URL` stays empty, so the dashboard calls `/api` on its own address. Vercel passes `/api/auth` on to the server; Vite in development passes all of `/api`, to `VITE_API_PROXY` (default `http://localhost:3000`).

**Until step 2:** the other screens stay on demo data, and only the session check reaches the server. So the automatic sign-out notices inactivity only when the page reloads or a session check runs.

## 8. Settings

| Variable | Where | Meaning |
|---|---|---|
| `AUTH_SECRET` | Server | 64 hex characters (`openssl rand -hex 32`). Seals the Google step's cookie and keys the codes |
| `DASHBOARD_URL` | Server | `https://or-hatzadik-dashboard.vercel.app` for now: where sign-in lands, and the origin check |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Server | The OAuth client. Redirect URI: `<DASHBOARD_URL>/api/auth/google/callback` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Server | Gmail for now: `smtp.gmail.com`, `465`, the address, its app password, and `אור הצדיק <the address>`. Resend later: `smtp.resend.com`, `465`, `resend`, the API key |
| `VITE_API_URL` | Dashboard | empty (calls `/api` on the dashboard's own address) |
| `VITE_HTTP_SERVICES` | Dashboard | `session` |
| `VITE_GOOGLE_CLIENT_ID` | Dashboard | the OAuth client's ID (public), for Google's own button |

Sign-in answers 503 `SIGN_IN_UNAVAILABLE` until the server has `DATABASE_URL` and all of the server settings above. Nothing else in the server changes.

## 9. Going live

**Now, without the domain**

1. **Google Cloud,** under a Google account the business keeps:
   - set up the Google Auth Platform: app name "Or HaTzadik", audience External, then **Publish app**;
   - create a client of type Web application;
   - give it the authorized JavaScript origins `https://or-hatzadik-dashboard.vercel.app`, `https://app.ronitbarash.site` and `http://localhost:5180`;
   - give it the redirect URIs `https://or-hatzadik-dashboard.vercel.app/api/auth/google/callback` and `https://app.ronitbarash.site/api/auth/google/callback`.
2. **Gmail for the codes:** in the same account, turn on 2-Step Verification and create an app password.
3. **VPS:**
   - back up `Server/.env`;
   - add the server settings from section 8;
   - `git pull`, then `docker compose up -d --build crm`. Migration 002 applies at startup.
4. **Vercel:** set `VITE_HTTP_SERVICES=session` and `VITE_GOOGLE_CLIENT_ID` for production, then deploy. `dashboard/vercel.json` already passes `/api/auth` to the server.
5. **Ronit's account:** `staff-user.js invite … --role admin --passport-access`. She gets the email and signs in with Google.

**Later, with the domain**

1. **DNS** (Ronit's Hostinger panel): the CNAME `app` pointing to Vercel's target, plus Resend's records.
2. Point `DASHBOARD_URL` at `https://app.ronitbarash.site`, and switch the `SMTP_*` settings to Resend.

## 10. Testing

- **Unit tests:**
  - the PKCE example from RFC 7636;
  - the ID-token checks (issuer, audience, expiry, nonce, verified email);
  - the button's signature check, with a test key pair standing in for Google's: tampering, `alg: none` and unknown keys are refused, and keys are cached;
  - the code exchange against a fake `fetch`;
  - the emails (code in the subject, escaping);
  - the AES-GCM box, including tampering.
- **The flows**, on PGlite with a fake Google and mailer:
  - an unregistered account is refused;
  - linking the Google account, and refusing a second one under the same email;
  - a forged, missing or stale Google step;
  - the code: works once, expiry, lockout, resend rules, a failed email;
  - remembered devices;
  - idle and absolute expiry;
  - reset and disable.
- **Routes**, with supertest:
  - the redirects to Google and back;
  - the cookie attributes, Lax for the Google step and Strict for the rest;
  - `?error=` redirects;
  - the origin check and the rate limit.
- **Dashboard:** the HTTP client and session adapter against a fake `fetch`, the mock's steps, and the sign-in screen's flow. The look is checked by eye.

## 11. Known limits

- **The emailed code adds little protection.** For someone who signs in with a Gmail account, the code goes to that same Google account, so whoever has the Google account also gets the code. It still blocks a sign-in from a device where the person isn't signed in to their mailbox. The authenticator-app alternative was offered and declined.
- **The server sees Vercel, not each visitor,** because requests come through Vercel's routing. Per-IP limits count everyone together, and the server's logs show Vercel's addresses.
- **Each person needs a Google account under the registered email.** Any email address can be made into one.
- **No passkeys yet.** Adding them later needs the stable `app.ronitbarash.site` address this step sets up.
