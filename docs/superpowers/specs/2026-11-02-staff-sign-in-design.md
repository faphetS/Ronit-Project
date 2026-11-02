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
| First step | "Continue with Google": OpenID Connect, authorization code with PKCE, run from the server | No passwords to forget, reset, guess or leak. Chosen in chat |
| Second step | A 6-digit code by email, on a device that isn't remembered | Chosen in chat. Its limits are in section 11 |
| Sending email | SMTP through Resend, from `no-reply@` on Ronit's domain | Resend's free plan covers 3,000 emails a month, 100 a day. Any SMTP account works the same |
| How the browser stays signed in | An `HttpOnly` cookie set by `api.ronitbarash.site`, with server-side sessions | Page scripts can't read it, and a session can be ended from the server |
| The dashboard's address | `app.ronitbarash.site` (a CNAME to Vercel) | The cookie is first-party only when the dashboard and the API share a site. On `*.vercel.app`, Safari drops it, and every iPhone runs Safari's engine |

## 3. How it works

```
office registers name + email + role ──► invite email: "sign in at app.ronitbarash.site with Google"

"Continue with Google"
  GET /api/auth/google?remember=1&returnTo=/customers ─► Google (pick the account)
  GET /api/auth/google/callback
     ├─ not registered ──────► /login?error=not-registered
     ├─ device remembered ───► the page (signed in)
     └─ otherwise ───────────► code emailed ─► /login?step=code
                                  GET  /api/auth/code         where it went (r***@gmail.com)
                                  POST /api/auth/code/resend  a new code, a minute later
                                  POST /api/auth/verify       the code ─► signed in

GET  /api/auth/session   the signed-in user, or 401
POST /api/auth/sign-out
```

**Google**
- The server sends the browser to Google with a random state, nonce and PKCE challenge. They're sealed into a 10-minute cookie that has to come back with Google's answer, so an answer meant for another browser doesn't fit.
- The ID token comes straight from Google's token endpoint over TLS. Its issuer, audience, expiry, nonce and verified email are checked.
- The first sign-in links the Google account (its `sub`) to the registered email. After that only that Google account gets in, even if the person's Google email changes, or someone else later opens a Google account under the same address.
- "Remember me" and the page to land on travel inside the sealed cookie. The landing page must be a path inside the dashboard.

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

All are `HttpOnly; Secure; Path=/`, and the `__Host-` prefix pins them to `api.ronitbarash.site`.

| Cookie | Holds | SameSite | Lifetime |
|---|---|---|---|
| `__Host-oh_google` | the sealed Google step | Lax, so it comes back on Google's redirect | 10 minutes |
| `__Host-oh_challenge` | the step waiting for the code | Strict | 30 minutes |
| `__Host-oh_session` | the session | Strict | browser session, or 30 days with "remember me" |
| `__Host-oh_device` | the device ID | Strict | 1 year |

**What the server stores**
- Session, device and step tokens are 32 random bytes. The database keeps only their SHA-256.
- Codes are kept as HMACs, as above.

**Limits**
- 5 wrong codes in a row lock the account for 15 minutes.
- 30 code requests (checks and resends) per IP per 15 minutes, on top of the server's general `/api` limit.

**Requests from other sites**
- State-changing requests to `/api/auth` must carry `Origin: <DASHBOARD_URL>`. Anything else gets 403 `ORIGIN_NOT_ALLOWED`.
- This matters because n8n and anything else on `*.ronitbarash.site` counts as the same site for `SameSite`.
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

- **The sign-in card:** "Continue with Google", in Google's button style, and "remember me". The code step shows where the code went, the code field, "send again" and "back". `?error=` from the callback is put in words.
- **`SessionService`:**
  - `startGoogle` returns where to send the browser;
  - `pendingCode`, `resendCode` and `verifyCode` handle the code;
  - `verifyCode` answers with the page to land on.
- **The demo data's version:** Google is skipped, and any 6 digits pass.
- **The HTTP adapter:** `data/http/` holds a small `fetch` client (`credentials: "include"`) and the session adapter.
- **Which services are live:**
  - `VITE_HTTP_SERVICES` lists the services that use the API (`session` now, `all` later). The rest stay on demo data.
  - `VITE_API_URL` is the API's origin. When it's empty in development, Vite proxies `/api` to `VITE_API_PROXY` (default `http://localhost:3000`).

**Until step 2:** the other screens stay on demo data, and only the session check reaches the server. So the automatic sign-out notices inactivity only when the page reloads or a session check runs.

## 8. Settings

| Variable | Where | Meaning |
|---|---|---|
| `AUTH_SECRET` | Server | 64 hex characters (`openssl rand -hex 32`). Seals the Google step's cookie and keys the codes |
| `DASHBOARD_URL` | Server | `https://app.ronitbarash.site`: where sign-in lands, the origin check, and CORS (added to `ALLOWED_ORIGINS` automatically) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Server | The OAuth client. Redirect URI: `<BACKEND_URL>/api/auth/google/callback` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Server | For Resend: `smtp.resend.com`, `465`, `resend`, the API key, and `אור הצדיק <no-reply@ronitbarash.site>` |
| `VITE_API_URL` | Dashboard | `https://api.ronitbarash.site` |
| `VITE_HTTP_SERVICES` | Dashboard | `session` |

Sign-in answers 503 `SIGN_IN_UNAVAILABLE` until the server has `DATABASE_URL` and all of the server settings above. Nothing else in the server changes.

## 9. Going live

1. **DNS** (Ronit's Hostinger panel):
   - a CNAME `app` pointing to `cname.vercel-dns.com`;
   - the records Resend gives for the sending domain (SPF, DKIM, and an MX for bounces).
2. **Google Cloud,** under a Google account the business keeps:
   - set up the OAuth consent screen, External, app name "אור הצדיק", scopes `openid email profile`, then publish it;
   - create an OAuth client ID of type Web application, with the redirect URI `https://api.ronitbarash.site/api/auth/google/callback`.
3. **Resend:** create an account, add and verify the domain, create an API key.
4. **Vercel:**
   - add `app.ronitbarash.site` to the project;
   - redirect `or-hatzadik-dashboard.vercel.app` to it;
   - set `VITE_API_URL` and `VITE_HTTP_SERVICES` for production.
5. **VPS:**
   - back up `Server/.env`;
   - add the server settings from section 8;
   - `git pull`, then `docker compose up -d --build crm`. Migration 002 applies at startup.
6. **Ronit's account:** `staff-user.js invite … --role admin --passport-access`. She gets the email and signs in with Google.

## 10. Testing

- **Unit tests:**
  - the PKCE example from RFC 7636;
  - the ID-token checks (issuer, audience, expiry, nonce, verified email);
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
- **"Remember me" on iPhones:** Safari caps cookies from an API whose IP differs from the dashboard's host at 7 days, so there it lasts up to 7 days, not 30.
- **Each person needs a Google account under the registered email.** Any email address can be made into one.
- **No passkeys yet.** Adding them later needs the stable `app.ronitbarash.site` address this step sets up.
