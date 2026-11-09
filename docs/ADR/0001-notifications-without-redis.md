# ADR 0001: Notifications without Redis, BullMQ or grammY

- **Status:** Accepted (2026-11-09)
- **Feature:** discover-notifications-settings (US-071 to US-074)

## Context

The handoff recommends ([RECOMMENDED], §4, §13) BullMQ + Redis for background jobs, a transactional `outbox_events` table, and grammY for the one official Telegram bot. The repository has no Redis yet. Its existing background work (the media sweep and top-up reconciliation) runs as in-process `setInterval` timers on every API instance, made safe by idempotent writes.

Notifications need three things:

1. A notification for a financial event (top-up, unlock, subscription, tip) must exist if and only if that event committed.
2. A notification failure must never undo or block money.
3. Telegram delivery must be retried and must stop on a permanent failure.

## Decision

- **The `notifications` row is the outbox.** Producers insert it with one SQL statement inside the business transaction, under a `SAVEPOINT`. A failed insert rolls back to the savepoint and is logged, and the business transaction carries on. A UNIQUE `(user_id, dedupe_key)` makes every trigger idempotent (duplicate webhooks, retries, concurrent workers). The same statement inserts a `notification_jobs` row when the recipient has Telegram connected and allowed.
- **Delivery runs as an in-process poller** over `notification_jobs` (`FOR UPDATE SKIP LOCKED`, a lease on `next_attempt_at`, backoff, a retry cap, and a permanent stop on Telegram 403). The subscription-ending reminder is an in-process sweep. Both follow the `TopupReconciler` pattern (interval env var, 0 = off).
- **The Telegram Bot API client is plain `fetch`** behind an injectable interface, not grammY. We only need `sendMessage` and a webhook for `/start` and `/stop`, and Zod validates the update.
- **Consent goes through a `/start` deep link** with a one-time token, not the OIDC `telegram:bot_access` scope. It needs no re-login, gives us the chat id directly, and works with the current Bot API.

## Consequences

- No new infrastructure: no Redis in local dev, CI or the health check.
- Every API instance polls; `SKIP LOCKED` plus the lease prevent double sends. A crash between sending and marking SENT can resend a message once, which is acceptable for notifications.
- Fan-out of NEW_POST happens inside the publish transaction (`INSERT … SELECT` over followers). That is fine at MVP scale and is marked as a `shortcut:` to move out past ~10k followers.
- Revisit when Redis and `apps/worker` arrive. The poller and sweep can then become BullMQ repeatable jobs without changing the tables.
