# Telegram bot (notifications)

Influency has **one** official Telegram bot. It only sends short notification summaries with a link back to the website. It is not a login method (that is Telegram OIDC), not a checkout, and there are no per-creator bots. Design: [ADR 0001](ADR/0001-notifications-without-redis.md); stories US-071 to US-074.

## Configuration

| Variable                                 | Meaning                                                                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TELEGRAM_BOT_TOKEN`                     | BotFather token. Unset, empty or `SET_LOCALLY` = Telegram off: "Hubungkan" shows "Segera hadir", `POST /me/telegram/link` → 409 `TELEGRAM_UNAVAILABLE`, `POST /webhooks/telegram` → 404, no delivery worker. |
| `TELEGRAM_BOT_USERNAME`                  | The bot's username without `@` (used for `https://t.me/<username>?start=…`). Required with a token.                                                                                                          |
| `TELEGRAM_BOT_WEBHOOK_SECRET`            | The `secret_token` given to `setWebhook`: 1–256 of `A-Z a-z 0-9 _ -`. Required with a token.                                                                                                                 |
| `NOTIFICATION_DELIVERY_INTERVAL_SECONDS` | Seconds between delivery runs (default 10, 0 = off).                                                                                                                                                         |
| `NOTIFICATION_MAX_ATTEMPTS`              | Sends per message before it is marked FAILED (default 5).                                                                                                                                                    |

Never commit real values. The token, the webhook secret and full bot API URLs are never logged.

## Setup

1. Create the bot with @BotFather and set the three variables above.
2. Register the webhook (operator step, not run by the app). Telegram needs a public HTTPS URL, so use staging or a tunnel locally:

   ```sh
   curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d url="https://YOUR_PUBLIC_HOST/api/v1/webhooks/telegram" \
     -d secret_token="$TELEGRAM_BOT_WEBHOOK_SECRET" \
     -d allowed_updates='["message"]'
   ```

   Telegram then sends every update with the header `X-Telegram-Bot-Api-Secret-Token`. Any other value gets 403.

## How a user connects

1. Pengaturan → Pesan Telegram → **Hubungkan** calls `POST /me/telegram/link`. The API stores the SHA-256 of a random 43-character token, valid for 15 minutes and usable once, and returns `https://t.me/<bot>?start=<token>`.
2. The user taps **Buka Telegram** and presses Start. Telegram sends `/start <token>` to the webhook. The API links that private chat to the user, turns delivery on and replies "Notifikasi Influency aktif. Ketik /stop untuk berhenti."
3. A chat belongs to one user: linking it again from another account moves it.
4. `/stop` in Telegram, or the Pesan Telegram switch, turns delivery off.

## What gets sent

Each in-app notification of a connected, opted-in user queues one `notification_jobs` row (UNIQUE per notification). The worker sends the same text as the inbox plus an absolute website link, as plain text (no `parse_mode`), e.g.

```
Nadia Kirana memposting konten baru.
https://influency.com/nadia/posts/0190…
```

Messages never contain premium media, captions, comment text or payout/bank details.

Delivery outcomes:

- 403 / 400 (blocked bot, unknown chat): FAILED, and Telegram delivery is switched off for that user.
- 429: retried after Telegram's `retry_after`.
- Other errors: retried with backoff (30 s, 60 s, 120 s …) up to `NOTIFICATION_MAX_ATTEMPTS`.

A failed delivery never changes the inbox row or any financial record.

## Not verified against the docs

The `/start <payload>` message format and the 403 code for a blocked bot are standard Bot API behaviour, but the documentation sections read on 2026-11-09 did not state them explicitly. Check them with a real bot before going live (BLOCKER FOR LIVE: needs a real BotFather token and a public HTTPS URL).
