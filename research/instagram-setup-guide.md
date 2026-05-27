# Instagram DM Webhook Setup Guide

All info from current Meta docs (2025-2026, API v25.0).

## What we're doing

Receiving Instagram DMs via webhook → LLM classifies if lead is interested → creates row in Monday.com CRM.

## 4 values to collect

| # | Value | Where |
|---|---|---|
| 1 | App ID | Top of app dashboard |
| 2 | App Secret | Settings → Basic → Show |
| 3 | Access Token | Instagram → API setup → Generate Token |
| 4 | IG Professional Account ID | API call after getting token |

---

## Step 1: Create the app

1. Go to **developers.facebook.com** → log in with Ronit's Facebook account
2. Click **My Apps** (top right) → **Create App**
3. Select use case: **"Manage messaging & content on Instagram"**
4. Business Portfolio step → **Skip** (not required for Instagram Login path)
5. Fill in:
   - **App name**: "Ronit CRM" or "Ronit Leads"
   - **Contact email**: Ronit's email or yours
6. Click **Create App**

---

## Step 2: Collect App ID

7. You're now in the app dashboard
8. The **App ID** is displayed at the top (a number like `123456789012345`)
9. Copy it somewhere safe

---

## Step 3: Collect App Secret

10. Go to **Settings → Basic** (left sidebar)
11. Next to **App Secret**, click **"Show"** (may ask for Facebook password)
12. Copy the secret string somewhere safe

---

## Step 4: Generate Instagram Access Token

13. In the left sidebar, click **Instagram → API setup with Instagram business login**
14. You'll see an option to add/connect an Instagram account
15. Click **"Generate Token"** next to Ronit's account (@ronit_barash)
16. A popup asks Ronit to authorize — log in with her Instagram credentials and approve
17. A token string appears — **copy it immediately and save it** (won't be shown again)
18. This token is already long-lived (valid 60 days, refreshable)

---

## Step 5: Toggle "Allow Access to Messages" on Ronit's phone

19. Open **Instagram app** on Ronit's phone
20. Go to **Settings** (hamburger menu → Settings and privacy)
21. Go to **Privacy → Messages**
22. Under **Connected Tools**, toggle **"Allow Access to Messages"** ON

Without this, the app won't receive DM webhooks even if everything else is correct.

---

## Step 6: Get IG Professional Account ID (after session, alone)

23. Using the token from Step 4, make this API call (browser, Postman, or curl):
    ```
    GET https://graph.instagram.com/v25.0/me?fields=user_id,username&access_token=YOUR_TOKEN_HERE
    ```
24. Response:
    ```json
    {
      "user_id": "17841400123456789",
      "username": "ronit_barash"
    }
    ```
25. The `user_id` is your **IG_PROFESSIONAL_ACCOUNT_ID**

---

## Step 7: Add to .env (after session, alone)

```env
META_APP_ID=123456789012345
META_APP_SECRET=abc123def456...
IG_ACCESS_TOKEN=EAAG...long_string...
IG_PROFESSIONAL_ACCOUNT_ID=17841400123456789
META_VERIFY_TOKEN=any_random_string_you_choose
```

---

## Step 8: Deploy + configure webhook (after deploying to Hostinger)

26. Deploy server to Hostinger with HTTPS
27. In app dashboard: **Webhooks** (left sidebar) → select **Instagram** → **Subscribe to this object**
28. Enter:
    - **Callback URL**: `https://your-domain.com/api/meta/webhook`
    - **Verify Token**: same string as `META_VERIFY_TOKEN` env var
29. Subscribe to the **`messages`** field
30. Call the API to activate the subscription:
    ```
    POST https://graph.instagram.com/v25.0/{IG_ACCOUNT_ID}/subscribed_apps
      ?subscribed_fields=messages
      &access_token=YOUR_TOKEN
    ```

---

## Step 9: Test in Dev mode

31. Add Ronit as **App Tester**: App Roles → Roles → Add People → her IG username
32. She accepts the invite in Instagram
33. Send a DM to test — webhook should fire

---

## Step 10: Go Live (production)

34. Submit for **App Review** — request `instagram_business_manage_messages` permission
35. Provide a screencast showing: DM received → classified → Monday.com row created
36. Wait 2-5 business days for approval
37. Flip the switch: **App Mode → Live**
38. Now ALL users' DMs trigger the webhook, not just testers

---

## Token refresh (set up in code later)

The 60-day token must be refreshed before expiry:

```
GET https://graph.instagram.com/refresh_access_token
  ?grant_type=ig_refresh_token
  &access_token=CURRENT_TOKEN
```

- Token must be at least 24h old and not yet expired
- Refreshed token is valid for another 60 days
- Set up a cron job to refresh ~every 50 days

---

## Dev mode vs Live mode

| | Dev mode | Live mode |
|---|---|---|
| Who triggers webhooks | Only app testers/admins | All users |
| Requires App Review | No | Yes |
| Good for | Building & testing | Production |
