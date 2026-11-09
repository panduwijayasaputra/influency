# Technical Plan: US-073 — Notification Preferences API

## Architecture Overview

`GET/PUT /api/v1/me/notification-preferences` lives in the `notifications` module. The stored model is a list of opted-out types (`notification_preferences.opt_out_types`, TASK-227). The API exposes the friendlier toggle shape from TASK-224 (`notificationPreferencesSchema`). One mapping table connects them:

| Toggle | Types |
|---|---|
| `newPost` | NEW_POST |
| `commentReply` | COMMENT_REPLY |
| `commentLike` | COMMENT_LIKE |
| `subscriptionReminder` | SUBSCRIPTION_ENDING |
| `earnings` (approved creators only) | NEW_SUBSCRIBER, POST_UNLOCKED, TIP_RECEIVED |

`TOPUP_CREDITED` and `PAYOUT_STATUS` have no toggle; the producer ignores opt-outs for them (TASK-229).

A user without a row gets the defaults (`opt_out_types` column default `{COMMENT_LIKE}`). The row is created on the first `PUT` via `upsert`.

## Dependencies

- TASK-224 (schemas + `NOTIFICATION_PREFERENCE_DEFAULTS`), TASK-227 (table), TASK-229 (`DEFAULT_OPT_OUT_TYPES`).

## Risks

- **`telegramAllowed` before linking.** Setting it true without a linked chat has no effect on delivery (jobs need `telegram_chat_id`). The response reports `telegram.status = 'not_connected'`, so the UI shows "Hubungkan". `status = 'unavailable'` when `TELEGRAM_BOT_TOKEN` is unset (US-074's env); until US-074 lands, it is always `unavailable`.
- **Pending jobs after opt-out.** US-074's sender re-checks `telegram_allowed` before sending, so turning Telegram off stops queued messages too.

## Tasks

### TASK-232: Preferences endpoints + web wiring

- `apps/api/src/modules/notifications/notification-preferences.ts` (pure):
  ```ts
  export const TOGGLE_TYPES = { newPost: ['NEW_POST'], commentReply: ['COMMENT_REPLY'], commentLike: ['COMMENT_LIKE'],
    subscriptionReminder: ['SUBSCRIPTION_ENDING'], earnings: ['NEW_SUBSCRIBER','POST_UNLOCKED','TIP_RECEIVED'] } as const;
  export function toToggles(optOut: NotificationType[], isCreator: boolean): Omit<NotificationPreferences,'telegram'>
  export function applyPatch(optOut: NotificationType[], patch: UpdateNotificationPreferencesInput): NotificationType[] // sorted, unique
  ```
- `notification-preferences.service.ts`:
  - `get(userId)`: row (or defaults) + `isCreator` (APPROVED `creator_profiles` row, the same check as `ApprovedCreatorGuard`) + `telegram: { status, allowed }` where `status = !env.TELEGRAM_BOT_TOKEN ? 'unavailable' : row?.telegramChatId ? 'connected' : 'not_connected'` and `allowed = !!row?.telegramAllowed && !!row?.telegramChatId`.
  - `update(userId, patch)`: if `patch.earnings !== undefined && !isCreator` → `DomainError('FORBIDDEN')` (403). Then `upsert({ where: { userId }, create: { userId, optOutTypes: applyPatch(DEFAULT_OPT_OUT_TYPES, patch), telegramAllowed: patch.telegramAllowed ?? false }, update: { optOutTypes: applyPatch(current, patch), …(patch.telegramAllowed !== undefined && { telegramAllowed }) } })` inside a transaction that reads `current` with `SELECT … FOR UPDATE` (two quick toggles must not lose each other's change). Return `get(userId)`.
- Controller (`SessionGuard`, `no-store`): `GET /me/notification-preferences`; `PUT /me/notification-preferences` with `ZodValidationPipe(updateNotificationPreferencesSchema)`. Unknown keys → 400 via `.strict()`.
- Web: replace the dummy bodies in `lib/api/notification-preferences.ts` with real calls (`PUT` with `credentials: 'include'`, JSON). Errors throw `ApiError` (`lib/api/errors.ts`) so the toggle's rollback toast works. Remove the in-memory dummy.
- Update `codebase-map.md`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/notifications/notification-preferences.ts` (+ `.spec.ts`) | Pure mapping |
| CREATE | `apps/api/src/modules/notifications/notification-preferences.service.ts` | get / update |
| CREATE | `apps/api/src/modules/notifications/notification-preferences.controller.ts` | Endpoints |
| MODIFY | `apps/api/src/modules/notifications/notifications.module.ts` | Register |
| CREATE | `apps/api/src/modules/notifications/notification-preferences.integration.spec.ts` | Tests |
| MODIFY | `apps/web/src/lib/api/notification-preferences.ts` (+ test) | Real calls |

**Testing:**
- Unit: `toToggles` defaults (commentLike false, others true; `earnings` null for non-creators); `applyPatch` adds/removes the right types, keeps others, is idempotent; earnings toggles all three types.
- Integration: 401 without a session; GET with no row → defaults; PUT `{ commentLike: true }` → GET shows it, row created; PUT `{ earnings: false }` as a plain user → 403, as a creator → ok; unknown key → 400; user A's PUT never changes user B; two concurrent PUTs (different toggles) → both applied.
- End to end with the producer: opt out of NEW_POST → publish creates no row for that follower; an opt-out of a transactional type is impossible (no toggle exists, and a raw row with `TOPUP_CREDITED` in `opt_out_types` is still ignored by the producer).
