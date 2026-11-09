# QA Report: TASK-229 — Producer service (outbox insert, savepoint, fan-out) + ADR

**Story:** US-072
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `docs/ADR/0001-notifications-without-redis.md` records the deviations from [RECOMMENDED] (no Redis/BullMQ/grammY; the notification row as outbox; `/start` consent)
- [x] `NotificationProducer` in the `notifications` module (exported); `notification-types.ts` holds `DEFAULT_OPT_OUT_TYPES` (= the column default) and `TRANSACTIONAL_TYPES`
- [x] One SQL builder `notificationInsertSql(candidates)` for all producers: inserts notifications `ON CONFLICT (user_id, dedupe_key) DO NOTHING`, skips inactive recipients, self-notifications and opted-out types (transactional types exempt), and inserts a `notification_jobs` row for recipients with Telegram connected and allowed. All values are bound parameters; the savepoint statements are constant strings.
- [x] Env (EXAMPLE values): `NEW_POST_NOTIFY_WINDOW_MINUTES` 60, `SUBSCRIPTION_REMINDER_LEAD_HOURS` 72, `SUBSCRIPTION_REMINDER_INTERVAL_SECONDS` 3600 (0 in `vitest.config.ts`); `env.spec` + `.env.example` updated

### Financial integrity
- [x] `notifyInTx` runs under `SAVEPOINT notify`; on any error it does `ROLLBACK TO SAVEPOINT notify` and logs (type + message only). Verified with Prisma 7 + adapter-pg: an FK violation inside a real transaction leaves the transaction usable and its other writes commit.
- [x] A rolled-back business transaction rolls the notification back too (tested)
- [x] No producer method throws

### Found and fixed during QA
- **Session time zone shift.** Timestamps written through Prisma are stored shifted by the session offset (`common/db-time.ts`). Rows inserted with the `created_at` DB default would read back 7 h off (local Asia/Bangkok) and sort wrongly against Prisma-written rows. The builder now binds `created_at` (and the job's `next_attempt_at`/`created_at`/`updated_at`) from a JS `Date`, like Prisma does. A regression test checks a produced row reads back as "now".

### Code Quality
- [x] New-post throttle via the dedupe key `new-post:{creatorProfileId}:{window index}`; `// shortcut:` for fan-out inside the publish transaction

## Testing

- `notification-producer.integration.spec.ts` (11): defaults match the shared defaults; one row per dedupe key incl. 10 concurrent calls; createdAt reads back as now; opt-out / self / suspended skipped; default COMMENT_LIKE opt-out and opt-in; transactional ignores opt-out; Telegram job only for connected + allowed; savepoint keeps the outer transaction; rollback with the business transaction; fan-out to active opted-in followers once per window, again in the next window, never to the creator.
- Full API suite: 115 files / 1,398 tests pass. ESLint + `tsc` clean.
