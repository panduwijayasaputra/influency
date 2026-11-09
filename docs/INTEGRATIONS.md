# Integrations

Everything Influency talks to outside its own code: what each service does, how to create and configure it, how to use it, and how to check that it works. Run commands from the repo root. Variable names are the ones in [.env.example](../.env.example); copy it to `.env` first and never commit real values.

Per-topic details live in [telegram-bot.md](telegram-bot.md), [payments.md](payments.md), [video-processing.md](video-processing.md) and [media-protection.md](media-protection.md). This page is the single entry point and the checklist.

## Overview

| Integration                      | Used for                                                | Needed to run locally?        | Switch / variables                    |
| -------------------------------- | ------------------------------------------------------- | ----------------------------- | ------------------------------------- |
| PostgreSQL 18                    | all authoritative data (balances, ledger, entitlements) | **Yes**                       | `DATABASE_URL`, `TEST_DATABASE_URL`   |
| Telegram Login (OIDC)            | the only way users log in                               | No, a dev login exists        | `TELEGRAM_OIDC_*`                     |
| Telegram bot                     | outbound notification summaries only                    | No (off by default)           | `TELEGRAM_BOT_*`                      |
| Midtrans Snap (**Sandbox only**) | Koin top-ups                                            | No, `fake` gateway by default | `PAYMENT_PROVIDER`, `MIDTRANS_*`      |
| Cloudflare R2                    | private image storage                                   | No, `local` files by default  | `STORAGE_DRIVER`, `R2_*`              |
| Cloudflare Stream                | private video storage, encoding and signed playback     | No, `stub` by default         | `VIDEO_DRIVER`, `CLOUDFLARE_STREAM_*` |
| Redis                            | reserved for future background jobs                     | **No**, nothing reads it yet  | `REDIS_URL`                           |

Boundaries that never change:

- PostgreSQL decides balances, ledger rows and access. Redis (when it arrives) is delivery only.
- Telegram is **identity and outbound notifications only**. There is no Telegram checkout, Stars, Mini App or per-creator bot.
- A Midtrans browser redirect never means "paid". Koin are credited only from a verified notification or a status check.
- R2 and Stream hold bytes. The API decides access and mints short-lived URLs.
- Sandbox only: `MIDTRANS_IS_PRODUCTION=true` makes the API refuse to start. Do not use live keys or real payouts without explicit approval.

## Local development without any account

The defaults need no external service except PostgreSQL:

```sh
cp .env.example .env     # set DATABASE_URL / TEST_DATABASE_URL, PAYOUT_ACCOUNT_ENC_KEY
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                 # web :3000, api :4000 (/api/v1)
```

| Default                 | What you get                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Dev login               | `/login` lists seeded demo users (`GET /api/v1/auth/dev/login?user=claudia\|creatorB\|subscriberA\|subscriberB\|admin`). 404 in production. |
| `PAYMENT_PROVIDER=fake` | In-process gateway. Checkout returns to the status page, which stays "Menunggu pembayaran" (nothing pays it).                               |
| `STORAGE_DRIVER=local`  | Files under `apps/api/.local-storage`. Refused when `NODE_ENV=production`.                                                                  |
| `VIDEO_DRIVER=stub`     | Videos kept in local storage, "processing" for about 5 s. Refused when `NODE_ENV=production`.                                               |
| Telegram bot off        | `TELEGRAM_BOT_TOKEN=SET_LOCALLY` disables it: "Hubungkan" shows "Segera hadir".                                                             |

Generate the payout encryption key once and keep a backup (losing it makes stored account numbers unreadable):

```sh
openssl rand -base64 32     # PAYOUT_ACCOUNT_ENC_KEY
```

### Public HTTPS tunnel

Telegram login, the Telegram webhook, Midtrans notifications and Cloudflare webhooks cannot reach `localhost`. For any of them, run a tunnel to the web app on port 3000 (Cloudflare Tunnel, ngrok, …) and use its HTTPS origin, written below as `https://TUNNEL`. Both `/api/v1/*` paths are served through the web app's rewrite, so one tunnel to `:3000` is enough.

Then set in `.env`:

```env
WEB_ORIGIN=https://TUNNEL
TELEGRAM_OIDC_REDIRECT_URI=https://TUNNEL/api/v1/auth/telegram/callback
MIDTRANS_WEBHOOK_URL=https://TUNNEL/api/v1/webhooks/payments/midtrans
```

Restart `pnpm dev` after every `.env` change. If the tunnel URL changes, update `WEB_ORIGIN`, the redirect URI, the BotFather Allowed URLs and every webhook registration below.

---

## 1. Telegram

Influency uses **one** Telegram bot for two separate jobs. They share the bot but use different features of it:

| Job                | Feature                                | Variables                                                                              |
| ------------------ | -------------------------------------- | -------------------------------------------------------------------------------------- |
| Log in             | Telegram Login via OIDC (Login Widget) | `TELEGRAM_OIDC_CLIENT_ID`, `TELEGRAM_OIDC_CLIENT_SECRET`, `TELEGRAM_OIDC_REDIRECT_URI` |
| Send notifications | Bot API `sendMessage` + webhook        | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_BOT_WEBHOOK_SECRET`           |

### 1.1 Create the bot

1. In Telegram, open [@BotFather](https://t.me/BotFather) and send `/newbot`.
2. Give it a display name (for example `Influency`), then a username. The username must end in `bot` (for example `influency_app_bot`).
3. BotFather replies with the **bot token** (`123456789:AA…`). This is `TELEGRAM_BOT_TOKEN`. Treat it like a password. If it leaks, send `/revoke` to BotFather to issue a new one.
4. The username without `@` is `TELEGRAM_BOT_USERNAME`.
5. Optional polish in BotFather: `/setdescription`, `/setabouttext`, `/setuserpic`.

Check the token works:

```sh
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
```

The reply should be `"ok": true` with your bot's username.

### 1.2 Login with Telegram (OIDC)

The flow is Authorization Code + PKCE (S256). The API validates `state` and `nonce`, verifies the ID token against Telegram's JWKS (issuer `https://oauth.telegram.org`, your client ID as audience, expiry), and identifies users by Telegram's `sub`, never by username. Scopes requested: `openid profile`. The session is an HttpOnly `influency_session` cookie; Telegram tokens never reach the browser.

Setup:

**Step 1. Find the login settings in BotFather.** Telegram moves these menus around, and the entry is not named the same everywhere. Try in this order and stop at the first that shows a Client ID and Client Secret:

1. Open [@BotFather](https://t.me/BotFather), tap **Open** (the mini app button) → pick your bot → **Bot Settings** → look for **Login Widget** or **Web Login**.
2. If that list only shows items like Inline Mode, Payments, Domain, Menu Button, Configure Mini App (no login entry), open **Domain**. In current BotFather versions the login settings may live there.
3. In the chat instead of the mini app: send `/mybots` → pick the bot → **Bot Settings** and look again.

If you can only set a plain domain and never see a Client Secret, that is the old HMAC widget, not OIDC, and it will not work with this app. Update the Telegram app and retry. Reference: [Log In With Telegram](https://core.telegram.org/bots/telegram-login).

Some accounts need to enable **OpenID Connect** with a switch in this screen first. Read what the screen says before confirming, since that switch may be permanent.

**Step 2. Copy the credentials.**

- **Client ID** is the numeric ID shown on that screen (it matches the number before the `:` in your bot token).
- **Client Secret** is shown once; store it safely. It is not the bot token.

**Step 3. Add the Allowed URLs.** Add both, exactly, with no trailing slash:

- your web origin, `https://TUNNEL`
- the callback, `https://TUNNEL/api/v1/auth/telegram/callback`

Telegram only redirects to URLs registered here. If the tunnel URL changes, update this again.

**Step 4. Set `.env`:**

```env
WEB_ORIGIN=https://TUNNEL
TELEGRAM_OIDC_CLIENT_ID=<numeric client id>
TELEGRAM_OIDC_CLIENT_SECRET=<client secret>
TELEGRAM_OIDC_REDIRECT_URI=https://TUNNEL/api/v1/auth/telegram/callback
SESSION_TTL_DAYS=30
```

**Step 5. Test.** Restart `pnpm dev`, open `https://TUNNEL/login` and choose **Masuk dengan Telegram**. Success lands on `/` (or the page you came from) with the session cookie. A failed or cancelled login lands on `/login?error=…`.

Troubleshooting: an error page on `oauth.telegram.org` usually means a URL in step 3 doesn't match exactly; `/login?error=…` after approving usually means a wrong Client ID or Secret.

Endpoints:

| Method + path                        | Purpose                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `GET /api/v1/auth/telegram/start`    | Starts login, accepts `?returnTo=` (same-origin relative path only; anything else becomes `/`) |
| `GET /api/v1/auth/telegram/callback` | Telegram redirects here with `code` and `state`                                                |
| `GET /api/v1/auth/me`                | Current user and roles, read from the database                                                 |
| `POST /api/v1/auth/logout`           | Ends the session                                                                               |

Check without logging in: `curl -i http://localhost:3000/api/v1/auth/telegram/start` returns `302` to `oauth.telegram.org/auth` and sets an `influency_oidc` cookie.

Roles (`USER`, `CREATOR`, `ADMIN`) are internal. Telegram cannot grant them; a creator needs an admin-approved profile and admin is never self-assigned.

### 1.3 Notification bot

The bot only sends short notification summaries with a link back to the website. Examples: new post from someone you follow, subscription ending soon. It never sends premium media, captions, comment text or payout details.

1. Set all three variables. When the token is set, username and webhook secret are required too, or the API will not start:

   ```env
   TELEGRAM_BOT_TOKEN=123456789:AA...
   TELEGRAM_BOT_USERNAME=influency_app_bot
   TELEGRAM_BOT_WEBHOOK_SECRET=<random, 1-256 chars of A-Z a-z 0-9 _ ->
   ```

   A good secret: `openssl rand -hex 32`.

2. Restart `pnpm dev`, then register the webhook. This is an operator step; the app does not do it for you:

   ```sh
   curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d url="https://TUNNEL/api/v1/webhooks/telegram" \
     -d secret_token="$TELEGRAM_BOT_WEBHOOK_SECRET" \
     -d allowed_updates='["message"]'
   ```

   Telegram then sends `X-Telegram-Bot-Api-Secret-Token` with every update. The API answers 403 to any other value.

3. Verify the registration:

   ```sh
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
   ```

   Look at `url`, `pending_update_count` and `last_error_message`.

To remove it (for example when the tunnel URL changes): `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"`, then register the new one.

#### How a user connects

1. **Pengaturan → Pesan Telegram → Hubungkan.** The API creates a one-time token (valid 15 minutes, stored only as a SHA-256 hash) and returns `https://t.me/<bot>?start=<token>`.
2. The user taps **Buka Telegram** and presses **Start**. Telegram sends `/start <token>` to the webhook. The API links that private chat to the user, turns delivery on and replies "Notifikasi Influency aktif. Ketik /stop untuk berhenti."
3. One chat belongs to one user; linking it from another account moves it.
4. `/stop` in the chat, or the **Pesan Telegram** switch in Pengaturan, turns delivery off.

#### How it behaves

- Each in-app notification of a connected, opted-in user queues one `notification_jobs` row (unique per notification). An in-process worker sends it, polling every `NOTIFICATION_DELIVERY_INTERVAL_SECONDS` (default 10, 0 = off).
- Blocked bot or unknown chat (403 / 400): the message is FAILED and Telegram delivery is switched off for that user.
- 429: retried after Telegram's `retry_after`. Other errors: backoff of 30 s, 60 s, 120 s … up to `NOTIFICATION_MAX_ATTEMPTS` (default 5).
- A failed delivery never changes the in-app inbox or any financial record.
- The token, the webhook secret and full bot API URLs are never logged.

Related variables: `NOTIFICATION_RETENTION_DAYS`, `NEW_POST_NOTIFY_WINDOW_MINUTES`, `SUBSCRIPTION_REMINDER_LEAD_HOURS`, `SUBSCRIPTION_REMINDER_INTERVAL_SECONDS`. Several are TBD placeholders; see `.env.example`.

#### Test it end to end

1. Log in with Telegram (or the dev login), open **Pengaturan**, tap **Hubungkan**, then **Buka Telegram**, then **Start**. The bot should reply with the confirmation.
2. Trigger a notification (for example publish a post as a creator that your test user follows) and wait about one delivery interval.
3. Send `/stop` and trigger again; nothing should arrive.

#### Troubleshooting

| Symptom                                             | Check                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| "Segera hadir" on Hubungkan                         | `TELEGRAM_BOT_TOKEN` is unset, empty or `SET_LOCALLY`.                                                |
| API exits at startup about the bot                  | Token is set but username or webhook secret is missing.                                               |
| Pressing Start does nothing                         | `getWebhookInfo`: wrong URL, tunnel down, or `last_error_message`. Webhook secret must match exactly. |
| `POST /webhooks/telegram` returns 404               | Bot is off (placeholder token).                                                                       |
| `POST /webhooks/telegram` returns 403               | `secret_token` given to `setWebhook` differs from `TELEGRAM_BOT_WEBHOOK_SECRET`.                      |
| Link says expired                                   | The token lives 15 minutes and works once; tap **Hubungkan** again.                                   |
| Login: "redirect_uri" or origin error from Telegram | The callback URL and web origin must both be in **Allowed URLs**, exactly (scheme, host, path).       |
| Login works locally but not on the tunnel           | `WEB_ORIGIN` / `TELEGRAM_OIDC_REDIRECT_URI` still point to the old URL.                               |

**Not verified against a real bot:** the exact `/start <payload>` message format and the 403 code for a blocked bot follow standard Bot API behaviour but were not stated in the documentation sections read. Check them with a real bot before going live.

---

## 2. Midtrans Snap (Koin top-up, Sandbox)

Users buy prepaid Koin (1 Koin = Rp1.000; packages of 10, 25, 50, 100 and 250). Influency is the central merchant. Prices always come from the database, never from the browser.

### 2.1 Create the Sandbox account

1. Register at the [Midtrans dashboard](https://dashboard.midtrans.com) and switch the environment to **Sandbox**.
2. Open **Settings → Access Keys** and copy the **Server Key**, **Client Key** and the **Merchant ID**.
3. Set in `.env`:

   ```env
   PAYMENT_PROVIDER=midtrans
   MIDTRANS_IS_PRODUCTION=false
   MIDTRANS_SERVER_KEY=<sandbox server key>
   MIDTRANS_CLIENT_KEY=<sandbox client key>
   MIDTRANS_MERCHANT_ID=<sandbox merchant id>
   MIDTRANS_WEBHOOK_URL=https://TUNNEL/api/v1/webhooks/payments/midtrans
   TOPUP_RECONCILE_INTERVAL_SECONDS=60
   ```

4. Restart `pnpm dev`.

### 2.2 Payment notification URL

In the Sandbox dashboard go to **Settings → Payment → Notification URL** and set **Payment Notification URL** to `https://TUNNEL/api/v1/webhooks/payments/midtrans`. Midtrans cannot reach `localhost`.

Every notification is stored, then verified before Koin move:

- `signature_key` must equal `SHA512(order_id + status_code + gross_amount + ServerKey)`;
- the order, amount, currency and merchant must match what Influency created;
- status and `fraud_status` must allow a credit.

A mismatch quarantines the notification and credits nothing. Duplicate, out-of-order (`capture` then `settlement`) and concurrent notifications credit exactly once.

### 2.3 Use it

1. Open `/wallet`, pick a package, **Beli**, then **Lanjut ke pembayaran**. You land on the Snap page.
2. Pay with the [Midtrans Sandbox payment simulator](https://simulator.sandbox.midtrans.com) or the test cards in the Midtrans docs.
3. Snap returns you to `/wallet/topups/{orderId}`. The page shows the status; the redirect alone credits nothing.
4. Koin are credited by the verified notification, or, with no tunnel, by the status check the API runs while the status page is open and by the background reconciler (`TOPUP_RECONCILE_INTERVAL_SECONDS`, 0 = off).

API: `POST /api/v1/wallet/topups` (needs an `Idempotency-Key` header; same key and payload returns the same result, a different payload is rejected), `GET /api/v1/wallet/topups`, `GET /api/v1/wallet/topups/:id`.

### 2.4 Rules

- Koin are credited only from a verified notification or status check, exactly once. Unique database constraints protect this even without the idempotency header.
- A top-up is not creator revenue. Revenue is allocated only when Koin are spent. Creator earnings are an internal ledger with manual, simulated payouts.
- Automated tests always use the `fake` gateway, whatever your `.env` says.

Troubleshooting: if the status page stays "Menunggu pembayaran" with `fake`, that is expected. With `midtrans`, check the notification log in the Midtrans dashboard (HTTP status of each delivery), that `MIDTRANS_SERVER_KEY` is the Sandbox key, and that the tunnel is up.

---

## 3. Cloudflare R2 (images)

Avatars, banners and post images live in a **private** bucket. Images upload straight from the browser through a presigned `PUT` (valid `UPLOAD_URL_TTL_SECONDS`, 60–3600 s). Viewing goes through the API, which mints presigned `GET` URLs after the access check.

1. In Cloudflare **R2**, create a bucket and keep public access **off**.
2. Create an **R2 API token** with **Object Read & Write**, scoped to that bucket. Note the access key ID and secret, and your account ID.
3. Add a CORS rule to the bucket so browsers can upload:

   ```json
   [
     {
       "AllowedOrigins": ["https://TUNNEL"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Use your `WEB_ORIGIN` as the origin.

4. Set in `.env`:

   ```env
   STORAGE_DRIVER=r2
   R2_ACCOUNT_ID=<account id>
   R2_ACCESS_KEY_ID=<access key id>
   R2_SECRET_ACCESS_KEY=<secret>
   R2_BUCKET=<bucket name>
   ```

5. Restart `pnpm dev`. Check: log in as a creator, open `/studio/profile`, upload a banner (≤ 5 MB) and an avatar (≤ 2 MB). The image URL loads when logged out via `/api/v1/creators/<slug>/images/…`.

Locally `STORAGE_DRIVER=local` writes under `LOCAL_STORAGE_DIR` and serves uploads through the dev-only `PUT /api/v1/dev-storage/…` route. It is refused when `NODE_ENV=production`.

---

## 4. Cloudflare Stream (video)

Post videos upload directly to Stream, are always created with `requireSignedURLs: true`, and play as HLS with short-lived playback tokens (`downloadable: false`). Lifetime: `MEDIA_ACCESS_TTL_SECONDS`.

1. In Cloudflare, enable **Stream** for your account and note the **Account ID**.
2. Create an **API token** with the **Stream: Edit/Write** permission.
3. Set in `.env`:

   ```env
   VIDEO_DRIVER=stream
   CLOUDFLARE_STREAM_ACCOUNT_ID=<account id>
   CLOUDFLARE_STREAM_TOKEN=<token>
   ```

4. Restart `pnpm dev`. Upload a video in the studio; its status moves `PENDING_UPLOAD → PROCESSING → READY` (or `REJECTED` with a reason). The studio page polls every 5 s, and a sweep (`MEDIA_SWEEP_INTERVAL_SECONDS`, default 300) rejects expired uploads.
5. If you add a Content-Security-Policy later, `connect-src` must allow `upload.videodelivery.net`.

### Optional: processing webhook

Polling and the sweep work without it. To get instant status:

1. Register the URL (one webhook per Cloudflare account; needs a public URL):

   ```sh
   curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_STREAM_ACCOUNT_ID/stream/webhook" \
     -H "Authorization: Bearer $CLOUDFLARE_STREAM_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"notificationUrl":"https://TUNNEL/api/v1/webhooks/video/cloudflare-stream"}'
   ```

2. Put `result.secret` from the response in `CLOUDFLARE_STREAM_WEBHOOK_SECRET`. Leave the variable unset to keep the endpoint off (404); never put a placeholder there.

The handler checks `Webhook-Signature` (HMAC-SHA256 of `<time>.<raw body>`, constant-time compare, rejects requests older than 300 s) and re-reads the video's state from the Stream API, so replays and out-of-order events are harmless. See [video-processing.md](video-processing.md) for the rejection reasons and cleanup rules.

Locally `VIDEO_DRIVER=stub` keeps files in local storage and fakes about 5 s of processing. Use small files (`apps/api/test/fixtures/sample.mp4` works). It is refused when `NODE_ENV=production`.

---

## 5. Redis

`REDIS_URL` and the BullMQ worker are planned for a later phase and **nothing reads them today**. Background work (media sweep, top-up reconciliation, notification delivery, subscription reminders) runs as idempotent in-process timers on each API instance, safe by design. See [ADR 0001](ADR/0001-notifications-without-redis.md). You do not need to run Redis.

---

## Environment checklist

| Goal                   | Set                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Run the app            | `DATABASE_URL`, `PAYOUT_ACCOUNT_ENC_KEY`, `WEB_ORIGIN`, `API_ORIGIN` (web app's own env)                             |
| Run tests              | `TEST_DATABASE_URL` (name ends `_test`; it is wiped each run)                                                        |
| Real Telegram login    | `TELEGRAM_OIDC_CLIENT_ID`, `TELEGRAM_OIDC_CLIENT_SECRET`, `TELEGRAM_OIDC_REDIRECT_URI`, HTTPS `WEB_ORIGIN`           |
| Telegram notifications | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_BOT_WEBHOOK_SECRET` + `setWebhook`                          |
| Midtrans Sandbox       | `PAYMENT_PROVIDER=midtrans`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_MERCHANT_ID` + notification URL |
| R2 images              | `STORAGE_DRIVER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` + bucket CORS          |
| Stream video           | `VIDEO_DRIVER=stream`, `CLOUDFLARE_STREAM_ACCOUNT_ID`, `CLOUDFLARE_STREAM_TOKEN` (+ optional webhook secret)         |

The API validates its environment at startup and exits listing every missing or invalid variable. The web app does not read the root `.env`; set `API_ORIGIN` in its own environment (default `http://localhost:4000`).

Set `TRUST_PROXY` only where your edge overwrites `X-Forwarded-For`; otherwise clients can choose their own rate-limit key. See [media-protection.md](media-protection.md).

## Before going live

These are blockers; the code is built for Sandbox and stand-in drivers:

- Midtrans **production** keys and `MIDTRANS_IS_PRODUCTION=true` are intentionally unsupported until explicitly approved.
- Real payouts are manual, with an operator transfer reference; no payout provider is integrated.
- `fake` payments, `local` storage and `stub` video are refused when `NODE_ENV=production`; switch to `midtrans`, `r2` and `stream`.
- Confirm the Telegram `/start` payload and blocked-bot behaviour with a real bot (see section 1.3).
- Rotate every key used during development, and keep `PAYOUT_ACCOUNT_ENC_KEY` backed up.
- Placeholder (TBD) values in `.env.example` (fees, limits, moderation flags) are business decisions, not final.
