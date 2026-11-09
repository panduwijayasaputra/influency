# QA Report: TASK-234 — Delivery worker

**Story:** US-074
**Result:** PASS
**Tester:** qa-agent

## Code Review

- [x] `NotificationDeliveryService.deliverDue()` claims due PENDING jobs with one `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`. It sets a 60 s lease and `attempts + 1`, so concurrent workers or instances never share a job. The due check uses `writtenInstant('next_attempt_at') <= now()`, and all job timestamps are bound from JS (the session time-zone convention in `common/db-time.ts`).
- [x] Message = inbox rendering (`NotificationsService.render`, same text and fallback as the inbox) + absolute `WEB_ORIGIN` link. Summary only; no captions, comment text, media or payout data.
- [x] Outcomes:
  - SENT (`sentAt`).
  - Permanent (403/400) → FAILED, and `telegram_allowed = false` for the user. New notifications then queue no job, and queued ones are SKIPPED.
  - Transient → back to PENDING with `retry_after` or exponential backoff (30 s × 2^(n−1)) and `lastError`.
  - FAILED at `NOTIFICATION_MAX_ATTEMPTS`.
  - Opted out or unlinked meanwhile → SKIPPED without sending.
- [x] Delivery never writes `notifications` or any financial table
- [x] `NotificationDeliveryWorker`: `TopupReconciler` pattern, `NOTIFICATION_DELIVERY_INTERVAL_SECONDS` (default 10, 0 in tests), never starts without a bot, overlap guard, `// shortcut:` → BullMQ per ADR 0001

## Testing

- `notification-delivery.integration.spec.ts` (5, fake bot): sends "Nadia Delivery memposting konten baru." + absolute post link, never the caption, job SENT with `sentAt`, inbox row still unread; 403 → FAILED + Telegram off and no further jobs; opted out meanwhile → SKIPPED without sending; 500 → PENDING with ≥ 20 s backoff, not resent before due, 429 `retry_after: 7` → ~7 s, cap → FAILED at 3 attempts; 5 jobs and 3 concurrent workers → each sent exactly once.
- `pnpm check`: shared 312, API 1,437, web 964 tests; format, lint and typecheck clean.

## Notes

- A crash between sending and marking SENT can resend one message after the lease (documented in ADR 0001, acceptable for notifications).
- No dedicated unit spec for the worker timer: it is the same code as the `SubscriptionReminder`, which has one. The "no bot → no timer" branch is a single guard.
