# US-074: Telegram Bot Notification Delivery

**Status:** ready_for_uat
**Priority:** medium
**Feature:** discover-notifications-settings

## Description

As a logged-in user who allowed Telegram messages, I want notifications from the official Influency bot, so that I see important activity even when the website is closed.

## Acceptance Criteria

- [ ] Turning on "Pesan Telegram" starts the consent flow current Telegram docs support (OIDC `telegram:bot_access` scope or the bot `/start` deep link); consent is recorded with a timestamp. Only the one official bot is used; no per-creator bots.
- [ ] Each notification for a consented user queues one delivery job (idempotency key UNIQUE per notification) that sends a short Bahasa Indonesia summary plus a website link (e.g. "Top-up berhasil: 60 Koin masuk. Buka Dompet: …"). Messages never contain premium media, locked comment text or payout account/bank details.
- [ ] Telegram 403 (bot blocked / no access) turns off `telegramAllowed` and stops retries; other failures retry with backoff up to a cap. Delivery status is stored; a failed delivery never affects the in-app notification or any financial record.
- [ ] `POST /webhooks/telegram` verifies the secret-token header, handles `/start` linking and `/stop` (opt-out), and is rate limited. Bot token and webhook secret come from env only (placeholders in `.env.example`).
- [ ] Tests use a fake bot client: consent, send, 403 disable, retry cap, duplicate-job dedupe and webhook secret rejection. Live delivery needs a real BotFather token (BLOCKER FOR LIVE).

## Tasks

### TASK-233: Bot client, link flow and Telegram webhook
**Status:** done

### TASK-234: Delivery worker
**Status:** done
