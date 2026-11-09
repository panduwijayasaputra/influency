# QA Report: TASK-231 — Subscription-ending reminder sweep

**Story:** US-072
**Result:** PASS
**Tester:** qa-agent

## Code Review

- [x] `SubscriptionReminder` timer copies `TopupReconciler`: `SUBSCRIPTION_REMINDER_INTERVAL_SECONDS` (0 = off; 0 in tests), `unref`, overlap guard, warn-and-continue on failure, `// shortcut:` note pointing at ADR 0001
- [x] `NotificationProducer.remindEndingSubscriptions()` is one statement through the shared builder. It selects non-cancelled periods ending within `SUBSCRIPTION_REMINDER_LEAD_HOURS` with no non-cancelled period of the same user + creator starting at or after their end. One per period via `subscription-ending:{periodId}`. It uses DB time, and `writtenInstant('sp.ends_at')` because `ends_at` is written from JS through Prisma (session time zone shift, `common/db-time.ts`).
- [x] Opt-outs respected (SUBSCRIPTION_ENDING is not transactional)

## Testing

- `subscription-reminder.spec.ts` (3): no timer at 0; ticks until shutdown; overlapping tick skipped and a failure doesn't stop the timer.
- `subscription-reminder.integration.spec.ts` (4): one reminder within the lead time even when run twice (creator, source, key, no actor); none for a period ending after the lead time or already ended; none with a scheduled renewal, and one once that renewal is cancelled; none when opted out.
- The first run failed: test periods weren't exactly 30 days (CHECK `subscription_periods_30_days`), and the time-zone comparison was wrong. Both are fixed; all pass. Full API suite: 115 files / 1,398 tests.
