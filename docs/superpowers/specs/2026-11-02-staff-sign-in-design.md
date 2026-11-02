# Staff sign-in: design

- **Date:** 2026-11-02
- **Status:** approved in chat; built on `feat/staff-sign-in`
- **For:** Ronit Barash, אור הצדיק (built by Clix Solution)
- **Readers:** Justin (owner of `Server/`), and whoever builds the dashboard API next

## 1. Goal

Ronit's team signs in to the dashboard with a real account. This comes before the dashboard reads any real data, because the API will serve passports and phone numbers, and the PRD says that access is limited to authorized users.

This is step 1 of 2:

1. **Sign-in (this step):** accounts, password, a code from an authenticator app, and sessions. The dashboard's sign-in runs against the server. Every other screen stays on demo data.
2. **The data (next):** the dashboard API one area at a time, with the roles enforced: customers and passports, groups, greetings, birthdays, then users. Leads come last, with the Monday import.

## 2. Decisions

| Question | Choice | Why |
|---|---|---|
| Where accounts live | `staff_users` in the CRM Postgres, with new columns | The table is already there from migration 001 |
| Second step | A 6-digit code from an authenticator app (TOTP, RFC 6238) | Free, needs no outside service, and works when WhatsApp is down. Google Authenticator and the iPhone's Passwords app both read it. Chosen in chat |
| How the browser stays signed in | An `HttpOnly` cookie set by `api.ronitbarash.site`, with server-side sessions | Page scripts can't read it, and a session can be ended from the server |
| The dashboard's address | `app.ronitbarash.site` (a CNAME to Vercel) | The cookie is first-party only when the dashboard and the API share a site. On `*.vercel.app`, Safari drops it, and every iPhone runs Safari's engine |
| Sign-up | None. Accounts come by invitation only | A small team, and passport data |
| Forgotten password | A reset link, issued from the server for now | No email service yet. The users screen will issue links in step 2 |

## 3. How it works

```
POST /api/auth/sign-in   email + password + remember
   ├─ wrong ───────────► 401 INVALID_CREDENTIALS   (5 in a row lock the account for 15 min)
   ├─ device remembered ► signed in
   ├─ codes set up ─────► code-required ──► POST /api/auth/verify  code ──► signed in
   └─ not set up yet ───► setup-required (key + QR) ──► POST /api/auth/verify  code ──► signed in

GET  /api/auth/setup-links/:token     who the link is for
POST /api/auth/setup-links/:token     new password + remember, then the same steps as sign-in
GET  /api/auth/session                the signed-in user, or 401
POST /api/auth/sign-out
```

**The steps**
- **Password.** A wrong password and an unknown email give the same answer. An unknown email still costs one password hash, so response times don't reveal which emails exist.
- **Code.** The step after the password is held server-side for 10 minutes and allows 5 tries. Codes from the previous, current and next 30 seconds are accepted. Each code works once.
- **Setup.** The first sign-in shows the key, as a QR code on desktop and as an "add to app" link on the phone. The codes switch on only after the first code from the app checks out. When the "two-step required" switch is off and someone hasn't set codes up, the password alone signs them in.
- **Remember me on this device.** When it's ticked, the device skips the code for 30 days, and the sign-in survives closing the browser. The password is still asked after an automatic sign-out.

**Sessions**
- 12 hours, or 30 days with "remember me".
- When the "auto sign-out" switch is on (the default), a session ends after 30 minutes with no requests. Any signed-in request counts as activity.
- Sign-out ends the session on the server. A password set from a link ends all of that person's sessions.

**Devices**
- Each browser gets a random device ID on its first sign-in.
- That's how "sign-in from a new device" is detected for the access log.
- It's also what "remember me" trusts. Several people can be remembered on one shared office computer.

## 4. Protection

**Cookies**

All three are `HttpOnly; Secure; SameSite=Strict; Path=/`. The `__Host-` prefix pins them to `api.ronitbarash.site`.

| Cookie | Holds | Lifetime |
|---|---|---|
| `__Host-oh_session` | the session | browser session, or 30 days with "remember me" |
| `__Host-oh_challenge` | the step after the password | 10 minutes |
| `__Host-oh_device` | the device ID | 1 year |

**What the server stores**

- Tokens are 32 random bytes. The database keeps only their SHA-256, so a database dump holds no live session.
- Passwords use scrypt (N=2¹⁵, r=8, p=3; OWASP's minimum equivalent), from `node:crypto`, so no new dependency. Before hashing, a password is NFC-normalized.
- Authenticator keys are encrypted with AES-256-GCM under `AUTH_SECRET`. That key lives in `Server/.env`, not in the database or its backups.

**Limits**
- 5 wrong passwords lock the account for 15 minutes.
- 30 sign-in requests per IP per 15 minutes, on top of the server's general `/api` limit.
- 5 code tries per step.

**Requests from other sites**
- State-changing requests to `/api/auth` must carry `Origin: <DASHBOARD_URL>`. Anything else gets 403 `ORIGIN_NOT_ALLOWED`.
- This matters because n8n and anything else on `*.ronitbarash.site` counts as the same site for `SameSite`.

**Passwords**
- 8 to 128 characters.
- Not the person's email.
- Not one of the most common passwords.

**Access log** (`audit_log`)
- `new-device-sign-in`
- `sign-in-locked`
- `two-step-set-up`
- `password-set`
- From the server console: `staff-invited`, `password-reset-link`, `two-step-reset` and `staff-disabled`.

## 5. Database

Migration `002_staff_sign_in`:

| Table | Holds |
|---|---|
| `staff_users` (new columns) | password hash, encrypted authenticator key, when codes were set up, the last accepted code step, failed tries, the lock, last sign-in, disabled. Emails are stored lowercase |
| `staff_setup_links` | invite and reset links: token hash, purpose, expiry, used |
| `staff_sessions` | token hash, remember, created, last seen, expiry, ended, IP, browser |
| `staff_devices` | device token hash per person: first and last seen, trusted until |
| `staff_sign_in_challenges` | the step after the password: code or setup, the key being set up, tries, expiry |
| `security_settings` | one row, the users screen's switches: two-step required, mask passport numbers, auto sign-out and its minutes, passport access log. All on, 30 minutes |

## 6. Accounts from the server console

Until the users screen is connected, accounts are managed with a script in the container:

```
docker exec root-crm-1 node dist/scripts/staff-user.js invite --email <email> --name "<name>" --role admin|office|sales [--passport-access] [--phone <whatsapp>]
docker exec root-crm-1 node dist/scripts/staff-user.js reset-password --email <email>
docker exec root-crm-1 node dist/scripts/staff-user.js reset-two-step --email <email>
docker exec root-crm-1 node dist/scripts/staff-user.js disable --email <email>
```

- `invite` and `reset-password` print a one-time link, `<DASHBOARD_URL>/setup/<token>`, which is sent to the person by hand.
- An invite lasts 72 hours and a reset 24. A new link cancels the person's older ones.
- A reset link sets a new password only, never the codes, so a leaked link is still not the account.
- `reset-two-step` is for a lost phone: the codes are set up again at the next sign-in.

## 7. The dashboard

- **`SessionService` grows:**
  - `signIn` returns the next step;
  - `verifyCode`, `setupLink` and `completeSetupLink` are new.
- **The demo data's version:** any 6 digits pass, and the link token `demo` works.
- **The HTTP adapter:** `data/http/` holds a small `fetch` client (`credentials: "include"`) and the session adapter.
- **Which services are live:**
  - `VITE_HTTP_SERVICES` lists the services that use the API (`session` now, `all` later). The rest stay on demo data.
  - `VITE_API_URL` is the API's origin. When it's empty in development, Vite proxies `/api` to `VITE_API_PROXY` (default `http://localhost:3000`).
- **The screens:**
  - The sign-in card shows the code step and the setup step (QR code via `uqr`, the key with a copy button, an "add to app" link on phones), in the same frosted card.
  - `/setup/:token` sets the password, then continues into the same steps.
- **"שכחתי"** now says to ask the office for a new link.

**Until step 2:** the other screens stay on demo data, and only the session check reaches the server. So the automatic sign-out notices inactivity only when the page reloads or a session check runs.

## 8. Settings

| Variable | Where | Meaning |
|---|---|---|
| `AUTH_SECRET` | Server | 64 hex characters (`openssl rand -hex 32`); encrypts authenticator keys |
| `DASHBOARD_URL` | Server | `https://app.ronitbarash.site`; links, the origin check, and CORS (added to `ALLOWED_ORIGINS` automatically) |
| `VITE_API_URL` | Dashboard | `https://api.ronitbarash.site` |
| `VITE_HTTP_SERVICES` | Dashboard | `session` |

Sign-in answers 503 `SIGN_IN_UNAVAILABLE` until the server has `DATABASE_URL`, `AUTH_SECRET` and `DASHBOARD_URL`, and nothing else in the server changes.

## 9. Going live

1. **DNS** (Ronit's Hostinger panel): add a CNAME record `app` pointing to `cname.vercel-dns.com`.
2. **Vercel:**
   - add `app.ronitbarash.site` to the project;
   - redirect `or-hatzadik-dashboard.vercel.app` to it;
   - set `VITE_API_URL` and `VITE_HTTP_SERVICES` for production.
3. **VPS:**
   - back up `Server/.env`;
   - add `AUTH_SECRET` and `DASHBOARD_URL`;
   - `git pull`, then `docker compose up -d --build crm`. Migration 002 applies at startup.
4. **Ronit's account:** `staff-user.js invite … --role admin --passport-access`, then send her the link.

## 10. Testing

- **Unit tests:**
  - TOTP against the RFC 6238 test vectors;
  - base32;
  - scrypt hashing;
  - the AES-GCM box, including tampering.
- **The flows**, on PGlite:
  - lockout;
  - code tries and replay;
  - remembered devices;
  - idle and absolute expiry;
  - invite and reset links.
- **Routes**, with supertest: the cookie attributes, the origin check, and the answers' shapes.
- **Dashboard:** the HTTP client and session adapter against a fake `fetch`, and the mock's new steps. The screens are checked by eye.

## 11. Known limits

- On iPhones, Safari caps cookies from an API whose IP differs from the dashboard's host at 7 days. So there, "remember me" lasts up to 7 days, not 30.
- No email service: links are sent by hand, and there's no self-service password reset.
- No passkeys yet. Adding them later needs the stable `app.ronitbarash.site` address this step sets up.
