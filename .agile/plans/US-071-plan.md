# Technical Plan: US-071 — Notifications Inbox API

## Architecture Overview

One migration adds all three notification tables, so the rest of the feature builds on a stable schema:

- `notifications`: the inbox. It also acts as the **outbox**: producers insert the row inside the business transaction (US-072).
- `notification_preferences`: per-user opt-outs + Telegram link (US-073/US-074).
- `notification_jobs`: Telegram delivery queue, one row per notification (US-074; handoff §10 `notification_jobs`).

A new `notifications` module serves the inbox. Display text and link are built server-side at read time by one pure function, `renderNotification`, which US-074 reuses for Telegram messages. Text never contains comment bodies or premium media, so a notification can't leak locked content even if the recipient's access lapses.

## Dependencies

- TASK-221 (shared contract). Keyset cursor codec: reuse `ledgerCursorSchema` / `encodeLedgerCursor` / `ledgerCursorWhere` from `modules/wallets` (`<ms>_<uuid>` on `(created_at, id)`), as US-061 does. If creator-studio has already moved it to `common/keyset-cursor.ts`, import from there.
- `imageUrl` for actor avatars. The actor of a notification is always a user; use the actor's approved creator profile avatar if they have one, else `null` (initials).

## Risks

- **Prisma enum arrays.** `optOutTypes NotificationType[]` maps to a Postgres `notification_type[]` column. The schema-conventions spec must accept it; check, and extend the spec's allowed types if it rejects arrays.
- **Actor display names change.** Text is rendered at read time from the current name. That is intended (no stale names).
- **Retention.** Rows older than `NOTIFICATION_RETENTION_DAYS` are only filtered out, not deleted. `// shortcut:` add a cleanup sweep if the table grows.

## Tasks

### TASK-227: Notification tables + migration

`apps/api/prisma/schema.prisma` (+ migration `…_notifications`):

```prisma
enum NotificationType { NEW_POST COMMENT_REPLY COMMENT_LIKE TOPUP_CREDITED SUBSCRIPTION_ENDING NEW_SUBSCRIBER POST_UNLOCKED TIP_RECEIVED PAYOUT_STATUS  @@map("notification_type") }

/// Inbox row; also the outbox: producers insert it in the same transaction as the business change (US-072).
model Notification {
  id               String           @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId           String           @map("user_id") @db.Uuid            // recipient
  type             NotificationType
  actorUserId      String?          @map("actor_user_id") @db.Uuid
  creatorProfileId String?          @map("creator_profile_id") @db.Uuid
  postId           String?          @map("post_id") @db.Uuid
  commentId        String?          @map("comment_id") @db.Uuid
  sourceId         String?          @map("source_id") @db.Uuid          // topup order / purchase / period / tip / payout id (no FK)
  coins            BigInt?                                               // amount snapshot for text (top-up, unlock, tip, subscription)
  dedupeKey        String           @map("dedupe_key")
  readAt           DateTime?        @map("read_at") @db.Timestamptz(3)
  createdAt        DateTime         @default(now()) @map("created_at") @db.Timestamptz(3)
  // relations: user, actor (User, "NotificationActor"), creatorProfile, post, comment — all onDelete: Restrict
  @@unique([userId, dedupeKey])
  @@index([userId, createdAt(sort: Desc), id(sort: Desc)])
  @@map("notifications")
}

model NotificationPreference {
  id               String             @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId           String             @unique @map("user_id") @db.Uuid
  optOutTypes      NotificationType[] @default([COMMENT_LIKE]) @map("opt_out_types")
  telegramAllowed  Boolean            @default(false) @map("telegram_allowed")
  telegramChatId   BigInt?            @unique @map("telegram_chat_id")
  telegramLinkedAt DateTime?          @map("telegram_linked_at") @db.Timestamptz(3)
  linkTokenHash    String?            @unique @map("link_token_hash")      // US-074 /start token (sha256hex)
  linkTokenExpiresAt DateTime?        @map("link_token_expires_at") @db.Timestamptz(3)
  createdAt / updatedAt
  @@map("notification_preferences")
}

enum NotificationJobStatus { PENDING SENT SKIPPED FAILED  @@map("notification_job_status") }

/// Telegram delivery of one notification (US-074). Unique per notification = idempotency key.
model NotificationJob {
  id             String                @id @default(dbgenerated("uuidv7()")) @db.Uuid
  notificationId String                @unique @map("notification_id") @db.Uuid
  status         NotificationJobStatus @default(PENDING)
  attempts       Int                   @default(0)
  nextAttemptAt  DateTime              @default(now()) @map("next_attempt_at") @db.Timestamptz(3)
  lastError      String?               @map("last_error")   // error code/description only, never the token
  sentAt         DateTime?             @map("sent_at") @db.Timestamptz(3)
  createdAt / updatedAt
  @@index([status, nextAttemptAt])
  @@map("notification_jobs")
}
```

- Add the back-relations on `User`, `CreatorProfile`, `Post`, `PostComment`.
- Migration SQL CHECKs: `notifications_coins_positive CHECK (coins IS NULL OR coins > 0)`, `notification_jobs_attempts CHECK (attempts >= 0)`.
- Add `NOTIFICATION_RETENTION_DAYS` (default 90, int 1–3650) to `common/env.ts` (+ `env.spec.ts`, `.env.example` with an `# EXAMPLE` comment).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | 3 models, 2 enums, back-relations |
| CREATE | `apps/api/prisma/migrations/<ts>_notifications/migration.sql` | Tables + CHECKs |
| MODIFY | `apps/api/src/common/env.ts` (+ spec), `.env.example` | Retention setting |
| MODIFY | `apps/api/src/common/schema-conventions.integration.spec.ts` | Only if the enum array needs allowing |

**Testing:** the schema-conventions spec passes; one integration test that a duplicate `(user_id, dedupe_key)` insert fails and that `coins = 0` is rejected.

---

### TASK-228: Inbox endpoints + web wiring

- `apps/api/src/modules/notifications/notification-text.ts`: pure function
  ```ts
  export function renderNotification(n: { type; coins: bigint | null; actorName: string | null; creatorName: string | null;
    creatorSlug: string | null; postId: string | null; commentId: string | null }): { text: string; href: string }
  ```
  Bahasa Indonesia, no comment text, no captions:
  | type | text (after the bold actor) | href |
  |---|---|---|
  | NEW_POST | `memposting konten baru.` | `/{creatorSlug}/posts/{postId}` |
  | COMMENT_REPLY | `membalas komentarmu.` | `/{creatorSlug}/posts/{postId}?comment={commentId}` |
  | COMMENT_LIKE | `menyukai komentarmu.` | same as reply |
  | TOPUP_CREDITED (no actor) | `Top-up berhasil: {coins} Koin masuk ke Dompet.` | `/wallet` |
  | SUBSCRIPTION_ENDING (actor null, creatorName) | `Langgananmu ke {creatorName} akan berakhir.` | `/{creatorSlug}` |
  | NEW_SUBSCRIBER | `berlangganan ke kamu.` | `/studio/earnings` |
  | POST_UNLOCKED | `membuka postinganmu ({coins} Koin).` | `/studio/earnings` |
  | TIP_RECEIVED | `mengirim tip {coins} Koin.` | `/studio/earnings` |
  | PAYOUT_STATUS (no actor) | `Status pencairan dana kamu berubah.` | `/studio/earnings` |
  If the post/creator a link needs is missing or no longer visible (post not PUBLISHED/ARCHIVED, creator not public), fall back to text `Notifikasi ini tidak lagi tersedia.` and href `/notifications`. Check whether the post page reads `?comment=`. If it doesn't, link to the post without it.
- `notifications.service.ts`:
  - `list(userId, cursor)`: `findMany({ where: { userId, createdAt: { gte: now - retention }, ...cursorWhere }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: NOTIFICATIONS_PAGE_SIZE + 1, include: actor (displayName + creatorProfile slug/avatarKey/status), creatorProfile (slug, displayName, status, user.status), post (status) })` → map with `renderNotification`; `read = readAt !== null`.
  - `unreadCount(userId)`: count `readAt: null` within retention.
  - `markRead(userId, upToId)`: find the row `{ id: upToId, userId }` (missing → 404 `NOT_FOUND`), then `updateMany({ where: { userId, readAt: null, createdAt: { lte: row.createdAt } }, data: { readAt: now } })`. Return 204.
- `notifications.controller.ts` under `SessionGuard`, `@Header('cache-control','no-store')`:
  - `GET /me/notifications?cursor=` → `NotificationsPage`
  - `GET /me/notifications/unread-count` → `{ count }`
  - `POST /me/notifications/read` body `markNotificationsReadSchema` → 204 (CSRF covered by the global guard)
- `notifications.module.ts` exports `NotificationsService` (US-072 adds the producer there); register it in `app.module.ts`.
- Web: replace the dummy bodies in `lib/api/notifications.ts` and `notifications.server.ts` with real calls (`notifications.server.ts` forwards the cookie like `creator-follow.server.ts`; error → 0). Remove the dummy data.
- Update `codebase-map.md`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/notifications/notification-text.ts` (+ `.spec.ts`) | Pure text/link builder |
| CREATE | `apps/api/src/modules/notifications/notifications.service.ts` | list / count / markRead |
| CREATE | `apps/api/src/modules/notifications/notifications.controller.ts` | 3 endpoints |
| CREATE | `apps/api/src/modules/notifications/notifications.module.ts` | Module |
| MODIFY | `apps/api/src/app.module.ts` | Register |
| CREATE | `apps/api/src/modules/notifications/notifications-inbox.integration.spec.ts` | Tests |
| MODIFY | `apps/web/src/lib/api/notifications.ts`, `notifications.server.ts` (+ tests) | Real calls |

**Testing:**
- Unit: every type renders the expected text/href; fallback when the post is missing; output never contains a passed-in caption/comment field (the function doesn't accept them).
- Integration (rows inserted directly with Prisma): 401 without a session; newest first with stable two-page pagination; `read` flag; unread count; `markRead` marks only rows at or before `upToId` and only the caller's; another user's `upToId` → 404 with no change; rows older than the retention are excluded from list and count; a notification whose post was REMOVED renders the fallback.
