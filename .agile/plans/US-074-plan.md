# Technical Plan: US-074 — Telegram Bot Notification Delivery

## Architecture Overview

Per ADR-0001 (TASK-229):

- **Consent through a `/start` deep link.** "Hubungkan" in Pengaturan calls `POST /me/telegram/link`. The API creates a one-time token (32 random bytes, base64url, 43 chars; stored as `sha256hex`, valid 15 min) and returns `https://t.me/{TELEGRAM_BOT_USERNAME}?start={token}`. The user taps Start in Telegram. Telegram posts the update to `POST /webhooks/telegram`. The API verifies the secret header, matches the token hash (unexpired), stores `telegram_chat_id` + `telegram_linked_at`, sets `telegram_allowed = true`, clears the token and replies "Notifikasi Influency aktif. Ketik /stop untuk berhenti."
- **`/stop`** in Telegram sets `telegram_allowed = false` for that chat and replies "Notifikasi dimatikan.". The Pengaturan toggle does the same through US-073.
- **Delivery.** `NotificationDeliveryWorker` is an in-process timer like `TopupReconciler`. Each tick claims due `notification_jobs` with `FOR UPDATE SKIP LOCKED`, renders the message with `renderNotification` (US-071) and sends it through `TelegramBotClient.sendMessage` (plain `fetch`). Outcomes: success → `SENT`; 403 → `FAILED` + `telegram_allowed = false`; 429 → retry after `retry_after`; other errors → backoff `30s × 2^attempts` up to `NOTIFICATION_MAX_ATTEMPTS` (5), then `FAILED`. A user who opted out or unlinked meanwhile → `SKIPPED`.
- **The bot is optional config.** Without `TELEGRAM_BOT_TOKEN`, the link endpoint returns 409 `TELEGRAM_UNAVAILABLE`, the webhook returns 404, the worker doesn't start, and Pengaturan shows "Segera hadir" (`status: 'unavailable'`). Dev and CI run without a bot. This follows the existing Stream webhook pattern.

Message format (plain text, no `parse_mode`, so user names can't inject markup): `"{actorName} {text}\n{WEB_ORIGIN}{href}"`, or `"{text}\n{WEB_ORIGIN}{href}"` when there is no actor. Never media, comment text or payout account data (guaranteed by `renderNotification`).

## Dependencies

- TASK-227 (`notification_jobs`, preference columns), TASK-228 (`renderNotification`), TASK-229 (jobs inserted by the producer), TASK-232 (preferences service).
- Env (all optional; `.env.example` placeholders `SET_LOCALLY`): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_BOT_WEBHOOK_SECRET` (required when the token is set; 1–256 chars `[A-Za-z0-9_-]`, as Telegram requires), `NOTIFICATION_DELIVERY_INTERVAL_SECONDS` (default 10, 0 = off; tests 0), `NOTIFICATION_MAX_ATTEMPTS` (default 5).

## Risks

- **Official docs.** Confirm against current Bot API docs: `setWebhook` `secret_token` → header `X-Telegram-Bot-Api-Secret-Token`; deep-link `start` parameter max 64 chars `[A-Za-z0-9_-]`; the 403 "bot was blocked by the user" response; 429 `parameters.retry_after`. Note any difference in the QA report.
- **Leaked link token.** Whoever uses the link gets that user's notifications. Mitigated by the 15-minute TTL, single use, and hash-only storage. The link page is only shown to the logged-in user.
- **One chat per user, one user per chat.** `telegram_chat_id` is UNIQUE. Linking a chat that already belongs to another user moves it: clear it from the old row in the same transaction. Last link wins, so one chat never gets two users' notifications.
- **Webhook registration.** Calling `setWebhook` is an operator step (documented in `docs/telegram-bot.md`), not code run on boot. Live use needs a real BotFather token + public HTTPS (BLOCKER FOR LIVE).
- **Multiple API instances.** `SKIP LOCKED` + a lease (`next_attempt_at = now() + 60s` when claimed) prevents double sends. A crash after sending but before marking SENT can resend once; acceptable for notifications.

## Tasks

### TASK-233: Bot client, link flow and Telegram webhook

- `apps/api/src/common/telegram-bot.ts`:
  ```ts
  export const TELEGRAM_BOT = Symbol('TELEGRAM_BOT');
  export interface TelegramBot { sendMessage(chatId: bigint, text: string): Promise<SendResult> }
  export type SendResult = { ok: true } | { ok: false; permanent: boolean; retryAfterSeconds?: number; code: string };
  export class FetchTelegramBot implements TelegramBot   // POST https://api.telegram.org/bot<token>/sendMessage {chat_id, text, link_preview_options:{is_disabled:true}}
  ```
  Map 403 → `permanent: true`; 400 "chat not found" → permanent; 429 → `retryAfterSeconds`; network/5xx → transient. Never log the URL (it contains the token). Provide `null` when the token is unset; consumers check for that. Add `apps/api/test/fake-telegram-bot.ts` (records messages; scripted results) for tests.
- Env in `common/env.ts` (+ spec, `.env.example`): the variables above, with a refine that `TELEGRAM_BOT_WEBHOOK_SECRET` and `TELEGRAM_BOT_USERNAME` are required when `TELEGRAM_BOT_TOKEN` is set.
- `notifications/telegram-link.service.ts`:
  - `createLink(userId)` → `{ url, expiresAt }`. Upsert the preferences row with `linkTokenHash`, `linkTokenExpiresAt`. Rate limited (`@RateLimit({ max: 5, timeWindow: '1 minute' })`).
  - `handleUpdate(update)`: Zod-parse only `message.chat.id`, `message.chat.type === 'private'` and `message.text`; ignore everything else (200).
    - `/start <token>`: in one tx, find the row by `sha256hex(token)` with an unexpired token. Clear `telegram_chat_id` from any other row holding this chat. Set `telegramChatId`, `telegramLinkedAt = now`, `telegramAllowed = true`, and null the token fields. Reply via the bot. Unknown/expired token → reply "Tautan tidak valid atau kedaluwarsa. Buka Pengaturan di Influency untuk mencoba lagi."
    - `/stop`: `updateMany({ where: { telegramChatId }, data: { telegramAllowed: false } })` + reply.
- Controllers:
  - `POST /me/telegram/link` (`SessionGuard`, rate limit) → 200 `{ url, expiresAt }` (shared `telegramLinkResponseSchema`); 409 `TELEGRAM_UNAVAILABLE` without a bot (add the code to `ERRORS` in shared: "Notifikasi Telegram belum tersedia.").
  - `POST /webhooks/telegram`: 404 without a bot. Compare the `x-telegram-bot-api-secret-token` header in constant time (`timingSafeEqual` on equal-length buffers) → 403 on mismatch. Rate limited per IP (`{ max: 120, timeWindow: '1 minute' }`). Always 200 after a valid secret (even for ignored updates) so Telegram doesn't retry.
- Web, `components/settings/settings-view.tsx`: "Hubungkan" calls `POST /me/telegram/link` and opens the URL (`window.open(url, '_blank', 'noopener')`); show the hint "Tekan Start di Telegram, lalu kembali ke sini." and refetch preferences when the page regains focus (`visibilitychange`). Add `connectTelegram()` to `lib/api/notification-preferences.ts`.
- `docs/telegram-bot.md`: BotFather setup, env vars, the `setWebhook` call with `secret_token`, local testing via tunnel, and what messages contain.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/common/telegram-bot.ts` (+ `.spec.ts`) | Fetch client + result mapping |
| MODIFY | `apps/api/src/common/common.module.ts` | Provide `TELEGRAM_BOT` (or null) |
| CREATE | `apps/api/test/fake-telegram-bot.ts` | Test double |
| MODIFY | `apps/api/src/common/env.ts` (+ spec), `.env.example` | Bot env |
| CREATE | `apps/api/src/modules/notifications/telegram-link.service.ts` | Link + updates |
| CREATE | `apps/api/src/modules/notifications/telegram.controller.ts` | `/me/telegram/link`, `/webhooks/telegram` |
| MODIFY | `apps/api/src/modules/notifications/notifications.module.ts` | Register |
| MODIFY | `packages/shared/src/notifications.ts`, `errors.ts` | Link schema, `TELEGRAM_UNAVAILABLE` |
| CREATE | `apps/api/src/modules/notifications/telegram-link.integration.spec.ts` | Tests |
| MODIFY | `apps/web/src/components/settings/settings-view.tsx` (+ test), `lib/api/notification-preferences.ts` | Connect button |
| CREATE | `docs/telegram-bot.md` | Operator setup |

**Testing:**
- Unit: `FetchTelegramBot` maps 200/403/429/500/network errors (mock `fetch`); the token never appears in thrown errors.
- Integration (fake bot): link → `/start token` webhook → row linked, allowed, token cleared, reply sent; reused token → rejected reply, no change; expired token → rejected; wrong/missing secret header → 403, no change; no bot configured → link 409, webhook 404; `/stop` → `telegram_allowed=false`; linking a chat already owned by user A to user B → A's chat id cleared; group-chat updates are ignored.
- Web: "Hubungkan" calls the link API and opens the URL; 409 shows the toast.

---

### TASK-234: Delivery worker

- `notifications/notification-delivery.service.ts`, `deliverDue(limit = 20)`:
  1. Claim (one statement):
     ```sql
     UPDATE notification_jobs j SET next_attempt_at = now() + interval '60 seconds', attempts = j.attempts + 1, updated_at = now()
     WHERE j.id IN (SELECT id FROM notification_jobs WHERE status = 'PENDING' AND next_attempt_at <= now()
                    ORDER BY next_attempt_at LIMIT ${limit} FOR UPDATE SKIP LOCKED)
     RETURNING j.id, j.notification_id, j.attempts
     ```
  2. Per job: load the notification (+ joins as in TASK-228) and the recipient's preferences. If `!telegramAllowed || !telegramChatId` → `SKIPPED`. Otherwise render and `bot.sendMessage`.
  3. Result: ok → `SENT`, `sentAt = now()`. Permanent → `FAILED`, `lastError = code`; for 403 also `notification_preferences.telegram_allowed = false` (pending jobs then become SKIPPED). Transient → `attempts >= NOTIFICATION_MAX_ATTEMPTS` ? `FAILED` : `PENDING` with `next_attempt_at = now() + (retryAfterSeconds ?? 30 * 2^attempts) seconds`.
  - Delivery never touches `notifications` (the inbox row stays as is) nor any financial table.
- `notifications/notification-delivery-worker.ts`: a timer copied from `TopupReconciler` (`NOTIFICATION_DELIVERY_INTERVAL_SECONDS`, 0 = off, no start without a bot, overlap guard, `// shortcut:` → BullMQ with the worker).
- Update `codebase-map.md` (background jobs table, env, endpoints) and mark Redis/BullMQ as still deferred per ADR-0001.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/notifications/notification-delivery.service.ts` | Claim + send + outcome |
| CREATE | `apps/api/src/modules/notifications/notification-delivery-worker.ts` (+ `.spec.ts`) | Timer |
| MODIFY | `apps/api/src/modules/notifications/notifications.module.ts` | Register |
| CREATE | `apps/api/src/modules/notifications/notification-delivery.integration.spec.ts` | Tests |

**Testing (integration, fake bot):**
- A due job → message sent with actor + text + absolute link; status SENT; the message contains no comment text or caption (seed a comment with a marker string and assert it is absent).
- 403 → FAILED and `telegram_allowed=false`; the next job for that user → SKIPPED without a send.
- 500 → PENDING with a later `next_attempt_at`; after `NOTIFICATION_MAX_ATTEMPTS` → FAILED; 429 with `retry_after: 7` → next attempt ≈ now+7s.
- User turned Telegram off before the tick → SKIPPED, nothing sent.
- Two concurrent `deliverDue()` calls on 5 jobs → each job sent exactly once.
- A failing send leaves the inbox notification and wallet/ledger rows untouched.
- Worker: 0 interval or no bot → no timer; overlapping ticks skipped.
