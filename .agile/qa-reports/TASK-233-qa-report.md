# QA Report: TASK-233 — Bot client, link flow and Telegram webhook

**Story:** US-074
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `common/telegram-bot.ts`: `TelegramBot` interface, `FetchTelegramBot` (plain `fetch`, ADR 0001), `TELEGRAM_BOT` provider in `CommonModule` (null without a token); `test/fake-telegram-bot.ts` test double
- [x] `TelegramLinkService` + `TelegramController`: `POST /me/telegram/link` (`SessionGuard`, rate limit 5/min) and `POST /webhooks/telegram` (rate limit 120/min per IP, 404 without a bot, constant-time secret check → 403, always 200 after a valid secret)
- [x] Shared: `telegramLinkResponseSchema` (https only), error `TELEGRAM_UNAVAILABLE` (409)
- [x] Web: "Hubungkan" calls the link API, then shows a **Buka Telegram** link (not `window.open` after an await, which popup and in-app-browser blockers stop), a "Tekan Start…" hint, and a refresh of the preferences when the page becomes visible again
- [x] `docs/telegram-bot.md`: env, setWebhook with `secret_token`, consent flow, message content, delivery outcomes

### Security
- [x] Link token: 32 random bytes as base64url (43 chars, within Telegram's 64-char start parameter); only `sha256hex` stored; valid 15 minutes; single use
- [x] One chat ↔ one user: linking a chat elsewhere clears it from the old user in the same transaction (UNIQUE `telegram_chat`)
- [x] Webhook accepts only private chats; only `message.chat` and `message.text` are read (Zod); everything else is ignored with 200
- [x] The bot token never appears in stored error codes (network errors keep only the error name); messages are plain text (no `parse_mode`)
- [x] The `.env.example` placeholders keep Telegram off (existing local `.env` files keep booting)

### Docs check (CLAUDE.md: follow official docs)
Fetched core.telegram.org on 2026-11-09:
- Confirmed: `secret_token` is 1–256 of `A-Z a-z 0-9 _ -`, sent as `X-Telegram-Bot-Api-Secret-Token`; deep-link start parameter is up to 64 base64url characters; `sendMessage` takes `link_preview_options`; errors carry `ok`, `description`, `error_code` and `parameters.retry_after`; chat ids have at most 52 significant bits (BIGINT is safe).
- **Not stated in the parts read:** the bot-side `/start <payload>` text format and 403 for a blocked bot. Both are standard Bot API behaviour and implemented that way. They are listed in `docs/telegram-bot.md` to check with a real bot before going live.

## Testing

- `common/telegram-bot.spec.ts` (6): body (plain text, string chat id, previews off); 403/400 permanent, 500 transient; 429 `retry_after`; no token in a network error.
- `telegram-link.integration.spec.ts` (8, fake bot): link via the endpoint (43-char token, hash stored) → `/start` links, enables, clears the token, replies; reuse rejected; expired rejected; chat moves to the last linker; `/stop` and bare `/start`; group chats and other updates ignored; wrong or missing secret → 403 with no change; without a bot: link 409 `TELEGRAM_UNAVAILABLE`, webhook 404.
- Web: `settings-view.test.tsx` (+3: link offered, failure toast, refresh after returning shows the connected switch); `notification-preferences.test.ts` (+2).
- `pnpm check` (format, lint, typecheck, all tests): passes.

## Notes

- First run: the link tests hit the endpoint's own 5/min rate limit. Tests after the first now seed the token in the DB; the limit stays as designed.
- Live delivery needs a real BotFather token and a public HTTPS URL (BLOCKER FOR LIVE).
