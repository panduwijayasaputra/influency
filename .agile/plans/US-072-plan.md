# Technical Plan: US-072 — Notification Events

## Architecture Overview

**The notification row is the outbox.** Producers insert it with raw SQL in the same transaction as the business change. The SQL is one statement that:

1. inserts into `notifications` `ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
2. skips recipients who opted out (`opt_out_types`, default `{COMMENT_LIKE}` when there is no preferences row) and inactive recipients,
3. inserts a `notification_jobs` row for each inserted notification whose recipient has Telegram connected and allowed (US-074 delivers them).

So a committed payment always has its notification and a rolled-back one never does, without a separate outbox table or Redis (ADR-0001).

**A notification failure must never undo money.** Inside a financial transaction the producer runs under a `SAVEPOINT notify`. On any error it does `ROLLBACK TO SAVEPOINT notify`, logs a warning (no PII) and returns. The business transaction carries on.

**Dedupe keys make every trigger idempotent** (retries, duplicate webhooks, concurrent workers):
| Event | Recipient | dedupe_key | Where |
|---|---|---|---|
| TOPUP_CREDITED | buyer | `topup:{orderId}` | `TopupCreditService.applyProviderStatus`, CREDITED branch (in tx) |
| POST_UNLOCKED | post's creator user | `unlock:{purchaseId}` | `PostPurchasesService.purchase` (in tx) |
| NEW_SUBSCRIBER | creator user | `subscription:{periodId}` | `SubscriptionPeriodsService.subscribeInTx` (in tx) |
| TIP_RECEIVED | creator user | `tip:{tipId}` | `TipsService` tip tx (in tx) |
| COMMENT_REPLY | parent comment author | `reply:{commentId}` | `PostCommentsService.create` when `parentId` set (after commit) |
| COMMENT_LIKE | comment author | `comment-like:{commentId}:{likerUserId}` | `CommentLikesService.like` when `count === 1` (in its tx) |
| NEW_POST | every ACTIVE follower | `new-post:{creatorProfileId}:{windowIndex}` | `PostsService.publish` when the new status is PUBLISHED (in tx) |
| SUBSCRIPTION_ENDING | subscriber | `subscription-ending:{periodId}` | sweep (TASK-231) |
| PAYOUT_STATUS | creator user | `payout:{payoutId}:{status}` | **not wired here**, see Risks |

The **new-post throttle** comes free from the key: `windowIndex = floor(epochMs / (NEW_POST_NOTIFY_WINDOW_MINUTES*60000))`. A follower gets at most one new-post notification per creator per window (the first post in the window).

**Self and leak rules:** the producer drops rows where `recipient = actor`. Texts never include comment bodies (US-071). Reply/like notifications are only produced when the recipient can access the post (`PostAccessService.check` for the recipient ≠ hidden/locked). Recipients who commented on a locked post through the `PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS` flag therefore get nothing.

## Dependencies

- TASK-227 (tables). TASK-228's module (`NotificationsService` lives in `modules/notifications`).
- Env: `NEW_POST_NOTIFY_WINDOW_MINUTES` (default 60, EXAMPLE), `SUBSCRIPTION_REMINDER_LEAD_HOURS` (default 72, EXAMPLE), `SUBSCRIPTION_REMINDER_INTERVAL_SECONDS` (default 3600, 0 = off; tests use 0).

## Risks

- **Module cycles.** `NotificationsModule` depends only on `CommonModule` (Prisma, env) and `EntitlementsModule` (for the reply/like access check). Topups, purchases, subscriptions, posts and engagement import `NotificationsModule`, never the reverse.
- **SAVEPOINT inside Prisma interactive transactions.** Use `tx.$executeRawUnsafe('SAVEPOINT notify')` / `RELEASE SAVEPOINT notify` / `ROLLBACK TO SAVEPOINT notify` around the insert. These are constant strings, never interpolated. Verify that Prisma 7 with `adapter-pg` keeps the tx usable after `ROLLBACK TO SAVEPOINT` (a test below forces the failure).
- **Fan-out size.** NEW_POST inserts one row per follower in a single `INSERT … SELECT` inside the publish transaction. Fine at MVP scale. `// shortcut:` move fan-out out of the publish tx (poll recently published posts) when a creator has tens of thousands of followers.
- **First publish under `POST_MODERATION_REQUIRED`.** Today no code approves a first-publish review (moderation `unhide` only undoes a hide and must not notify). When admin approval is added, it must call `notifyNewPost`. Note this in the code comment.
- **PAYOUT_STATUS has no producer yet.** Payout status changes are admin actions (later admin/finance feature). A creator's own request/cancel needs no notification. The type, text and `notify` API are ready. The admin feature calls `notify(tx, { type: 'PAYOUT_STATUS', … })`. This is a deliberate gap against the story's event list; flag it in the summary.

## Tasks

### TASK-229: Producer service (outbox insert, savepoint, fan-out) + ADR

- `docs/ADR/0001-notifications-without-redis.md`: Context (handoff [RECOMMENDED] BullMQ + Redis + grammY; no Redis in the repo; existing in-process timers), Decision (notification row as outbox; `notification_jobs` + in-process poller with `FOR UPDATE SKIP LOCKED`; plain `fetch` Bot API client instead of grammY; `/start` deep-link consent), Consequences (no new infra; every API instance polls, which is safe through SKIP LOCKED; revisit when Redis lands with the worker).
- `apps/api/src/modules/notifications/notification-producer.service.ts`:
  ```ts
  type Db = PrismaService | Prisma.TransactionClient;
  export interface NotifyInput { userId: string; type: NotificationType; dedupeKey: string; actorUserId?: string;
    creatorProfileId?: string; postId?: string; commentId?: string; sourceId?: string; coins?: bigint }
  @Injectable() export class NotificationProducer {
    /** In a business transaction: never throws; a failure rolls back to a savepoint and is logged. */
    notifyInTx(tx: Prisma.TransactionClient, input: NotifyInput): Promise<void>
    /** Outside a transaction (after commit): never throws. */
    notify(input: NotifyInput): Promise<void>
    /** New-post fan-out to ACTIVE followers (in the publish tx, savepoint-protected). */
    notifyNewPostInTx(tx, { creatorProfileId, creatorUserId, postId, now: Date }): Promise<void>
  }
  ```
  - Core SQL (one statement; build it with `Prisma.sql`, all values as parameters):
    ```sql
    WITH candidates AS (
      SELECT ${userId}::uuid AS user_id            -- fan-out: SELECT f.user_id FROM creator_follows f WHERE f.creator_profile_id = $1
    ), inserted AS (
      INSERT INTO notifications (user_id, type, actor_user_id, creator_profile_id, post_id, comment_id, source_id, coins, dedupe_key)
      SELECT c.user_id, ${type}::notification_type, …, ${dedupeKey}
      FROM candidates c
      JOIN users u ON u.id = c.user_id AND u.status = 'ACTIVE'
      LEFT JOIN notification_preferences p ON p.user_id = c.user_id
      WHERE c.user_id IS DISTINCT FROM ${actorUserId}::uuid
        AND NOT (${type}::notification_type = ANY (COALESCE(p.opt_out_types, ARRAY['COMMENT_LIKE']::notification_type[])))
      ON CONFLICT (user_id, dedupe_key) DO NOTHING
      RETURNING id, user_id
    )
    INSERT INTO notification_jobs (notification_id)
    SELECT i.id FROM inserted i JOIN notification_preferences p ON p.user_id = i.user_id
    WHERE p.telegram_allowed AND p.telegram_chat_id IS NOT NULL
    ```
    Export one builder `notificationInsertSql(candidatesSql, fields)` used by all three methods and by TASK-231.
  - The default opt-out (`COMMENT_LIKE`) must equal the column default and `NOTIFICATION_PREFERENCE_DEFAULTS`. Define `DEFAULT_OPT_OUT_TYPES` once in the api (`notification-types.ts`) and assert in a unit test that it matches the shared defaults.
  - **Transactional types** (`TOPUP_CREDITED`, `PAYOUT_STATUS`) skip the opt-out condition (`TRANSACTIONAL_TYPES` constant).
- Export `NotificationProducer` from `NotificationsModule`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `docs/ADR/0001-notifications-without-redis.md` | ADR |
| CREATE | `apps/api/src/modules/notifications/notification-producer.service.ts` | Producer |
| CREATE | `apps/api/src/modules/notifications/notification-types.ts` | Default opt-outs, transactional types |
| MODIFY | `apps/api/src/modules/notifications/notifications.module.ts` | Provide/export |
| MODIFY | `apps/api/src/common/env.ts` (+ spec), `.env.example` | 3 settings above |
| CREATE | `apps/api/src/modules/notifications/notification-producer.integration.spec.ts` | Tests |

**Testing (integration):**
- One insert; the same dedupe key twice → one row; 10 concurrent `notify` calls with the same key → one row.
- Opt-out skips; no preferences row → `COMMENT_LIKE` skipped, others created; transactional type ignores opt-out; actor = recipient → nothing; SUSPENDED recipient → nothing.
- Telegram job created only when `telegram_allowed` and `telegram_chat_id` are set.
- Savepoint: inside `prisma.$transaction`, `notifyInTx` with a nonexistent `postId` (FK violation) does not throw, the tx's other write commits, and no notification exists.
- Fan-out: 3 followers (1 suspended, 1 opted out) → 1 row; a second post in the same window → no new rows; a post in the next window → new rows.

---

### TASK-230: Wire event producers

Inject `NotificationProducer` (import `NotificationsModule`) and call it at these points:
- `topups/topup-credit.service.ts`, in the `CREDITED` branch after the ledger credit and the order update, inside the tx: `notifyInTx(tx, { userId: order.userId, type: 'TOPUP_CREDITED', sourceId: order.id, coins: order.coins, dedupeKey: \`topup:${order.id}\` })`.
- `purchases/post-purchases.service.ts`, in `purchase`'s tx after the purchase row is created (only on a new purchase, not an idempotent replay): `POST_UNLOCKED` to the creator's `userId`, `actorUserId` buyer, `postId`, `creatorProfileId`, `sourceId` purchase id, `coins` price.
- `subscriptions/subscription-periods.service.ts`, in `subscribeInTx` after the period insert (new period only): `NEW_SUBSCRIBER` to the creator user, actor subscriber, `sourceId` period id, `coins` price.
- `purchases/tips.service.ts`, in the tip tx after the tip insert: `TIP_RECEIVED`, actor tipper, `postId` if set, `sourceId` tip id, `coins`.
- `engagement/post-comments.service.ts`, in `create`: after the comment is committed and when `parentId` is set: `notify({ userId: parent.authorId, type: 'COMMENT_REPLY', actorUserId: userId, postId, commentId: newComment.id, creatorProfileId, dedupeKey: \`reply:${newComment.id}\` })`, only if `PostAccessService.check(post, parentAuthor)` is `full`. Fire-and-forget is fine (`void`), but the producer itself never throws.
- `engagement/comment-likes.service.ts`, in `like`: when `count === 1`, call `notifyInTx(tx, { userId: comment.authorId, type: 'COMMENT_LIKE', actorUserId: userId, postId, commentId, dedupeKey: \`comment-like:${commentId}:${userId}\` })` with the same access check for the recipient. Unlike + re-like does not notify again.
- `posts/posts.service.ts`, in `publish` when the written status is `PUBLISHED`: `notifyNewPostInTx(tx, { creatorProfileId, creatorUserId, postId: id, now })`. Not on `PENDING_REVIEW`, not on unarchive or moderation unhide.
- Check the actual column/field names (`authorId` vs `userId` on `PostComment`, the creator's user id on each path) in the schema before writing.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/topups/topup-credit.service.ts`, `topups.module.ts` | TOPUP_CREDITED |
| MODIFY | `apps/api/src/modules/purchases/post-purchases.service.ts`, `tips.service.ts`, `purchases.module.ts` | POST_UNLOCKED, TIP_RECEIVED |
| MODIFY | `apps/api/src/modules/subscriptions/subscription-periods.service.ts`, `subscriptions.module.ts` | NEW_SUBSCRIBER |
| MODIFY | `apps/api/src/modules/engagement/post-comments.service.ts`, `comment-likes.service.ts`, `engagement.module.ts` | Reply/like |
| MODIFY | `apps/api/src/modules/posts/posts.service.ts`, `posts.module.ts` | NEW_POST |
| CREATE | `apps/api/src/modules/notifications/notification-events.integration.spec.ts` | Tests |

**Testing (integration, through the real endpoints/services):**
- Top-up: a credited webhook → one TOPUP_CREDITED; the same webhook 10× and capture→settlement → still one; a quarantined amount mismatch → none.
- Unlock / subscribe / tip → one creator notification each with `coins`; an idempotent replay (same `Idempotency-Key`) → no second row; `INSUFFICIENT_COINS` → none.
- Money is unaffected by a notification failure: make the producer's insert fail (e.g. spy that forces the SQL to throw) during a purchase → the purchase, ledger and revenue rows still commit.
- Reply → parent author notified; replying to your own comment → none; reply on a locked premium post where the parent author has no access → none.
- Comment like → author notified once across like/unlike/like; own comment → none; default prefs (COMMENT_LIKE opted out) → none until the user opts in.
- Publish (moderation off) → each follower notified; `POST_MODERATION_REQUIRED=true` → none at publish.

---

### TASK-231: Subscription-ending reminder sweep

- `notifications/subscription-reminder.ts`: an `@Injectable()` timer copied from `TopupReconciler` (interval `SUBSCRIPTION_REMINDER_INTERVAL_SECONDS`, 0 = off, `unref`, overlap guard, `// shortcut:` comment). Each tick calls `producer.remindEndingSubscriptions()`.
- `NotificationProducer.remindEndingSubscriptions()`: one statement using `notificationInsertSql` with candidates:
  ```sql
  SELECT sp.user_id, sp.id AS period_id, sp.creator_profile_id
  FROM subscription_periods sp
  WHERE sp.ends_at > now() AND sp.ends_at <= now() + make_interval(hours => ${leadHours})
    AND NOT EXISTS (SELECT 1 FROM subscription_periods nx
                    WHERE nx.user_id = sp.user_id AND nx.creator_profile_id = sp.creator_profile_id
                      AND nx.starts_at >= sp.ends_at AND nx.canceled_at IS NULL)
  ```
  Type `SUBSCRIPTION_ENDING`, `creator_profile_id`, `source_id` = period id, dedupe `subscription-ending:{periodId}`, no actor. DB time (`now()`), never the client's. Check the meaning of `canceledAt` (scheduled renewal canceled) in `subscription-periods.service.ts` and adjust the "has a renewal" condition to match.
- Register the timer in `NotificationsModule` providers.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/notifications/subscription-reminder.ts` (+ `.spec.ts` like `topup-reconciler.spec.ts`) | Timer |
| MODIFY | `apps/api/src/modules/notifications/notification-producer.service.ts` | `remindEndingSubscriptions` |
| CREATE | `apps/api/src/modules/notifications/subscription-reminder.integration.spec.ts` | Tests |

**Testing:**
- A period ending within the lead time → one reminder; running the sweep twice → still one.
- Ending later than the lead time, already ended, or with a scheduled (non-canceled) renewal → none.
- Opted out of SUBSCRIPTION_ENDING → none.
- Timer unit test: 0 disables it; overlapping ticks are skipped.
