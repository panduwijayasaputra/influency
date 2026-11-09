# QA Report: TASK-227 — Notification tables + migration

**Story:** US-071
**Result:** PASS
**Tester:** qa-agent

## Code Review

- [x] Migration `20261109084224_notifications`, generated with `--create-only` and inspected before applying: it contains only the new enums, tables, indexes and FKs (no drift from other schema work), plus two CHECKs (`notifications_coins_positive`, `notification_jobs_attempts_non_negative`)
- [x] `notifications`: UNIQUE `(user_id, dedupe_key)` (the idempotency key for producers), index `(user_id, created_at DESC, id DESC)` for the inbox keyset
- [x] `notification_preferences`: UNIQUE `user_id`, `opt_out_types notification_type[]` default `{COMMENT_LIKE}`, UNIQUE `telegram_chat`, UNIQUE `link_token_hash`
- [x] `notification_jobs`: UNIQUE `notification_id` (delivery idempotency), index `(status, next_attempt_at)`
- [x] Conventions: uuidv7 ids, `timestamptz(3)`, snake_case; integer coins (BIGINT). **Plan deviation:** the Telegram chat column is `telegram_chat`, not `telegram_chat_id`, because the conventions spec requires every `*_id` column to be a uuid.
- [x] **Design decision:** every notification FK is `ON DELETE CASCADE`. Notifications are derived, disposable data, not financial records. Existing spec cleanups that delete users, posts or comments keep working, and a deleted target simply drops its notifications.
- [x] `NOTIFICATION_RETENTION_DAYS` (EXAMPLE, default 90, 1–3650) in `env.ts`, `env.spec.ts` defaults and `.env.example`

## Testing

- `notifications-schema.integration.spec.ts` (3): duplicate dedupe key rejected; `coins = 0` and `attempts = -1` rejected by name; one job per notification; preferences default to `{COMMENT_LIKE}`, telegram off, one row per user.
- `schema-conventions.integration.spec.ts` passes with the new tables.
- Full API suite: 111 files / 1,369 tests pass.

## Notes

- `opt_out_types` is nullable at the DB level (Prisma scalar lists map to nullable arrays); every reader uses `COALESCE`/defaults.
