# Technical Plan: US-037 — Subscribe & Early Renewal

## Architecture Overview

`subscription_periods` hold paid 30×24h intervals `[starts_at, ends_at)` in UTC. **State is derived from timestamps and server time**, never from a cached status:
- active = `canceled_at IS NULL AND starts_at <= now < ends_at`
- scheduled = `canceled_at IS NULL AND starts_at > now`

The only mutable column is `canceled_at` (US-038). Activation is just time passing, so there is no job and no activation race.

`POST /creators/:slug/subscribe` (in the `subscriptions` module), one transaction:
1. claim the Idempotency-Key (scope `subscribe`, hash `{ slug, expectedPriceCoins }`)
2. lock the creator profile row, then `lockWalletInTx` (serialises every spend of this user, so reading periods is race-free)
3. compute `now` (JS `new Date()` after the locks)
4. read this user's non-cancelled periods for the creator with `ends_at > now`
5. decide: none → start now; one active and none scheduled → start at the active `ends_at`; a scheduled one exists → `RENEWAL_ALREADY_SCHEDULED`
6. `debitInTx`, insert the period, `postSaleInTx` (`accruesAt = startsAt`), complete the key

DB backstop: partial `UNIQUE (user_id, creator_profile_id, starts_at) WHERE canceled_at IS NULL`. Two racing renewals would compute the same `starts_at`, so even without the wallet lock one fails.

Access: `PaidAccessService` adds two sources (archive grant computed at read time, as agreed):
- **subscription:** PUBLISHED PREMIUM posts whose creator has an active period for the viewer
- **archive grant** (spec §4.1): an ARCHIVED PREMIUM post whose **open** archive episode (`restored_at IS NULL`) has `archived_at` inside a non-cancelled period of the viewer for that creator (`starts_at <= archived_at < ends_at`) with `now < ends_at`. Scheduled and later periods never match because their `starts_at > archived_at`.

## Dependencies

- TASK-162/163 (plans), TASK-164 (spend core), TASK-166 (`PaidAccessService`).

## Risks

- **Period boundaries:** `ends_at = starts_at + interval '30 days'` is enforced by a CHECK. Computing it in JS with `+ 30 * 86_400_000` matches this, because timestamptz intervals of days on UTC timestamps add 24h × 30. The CHECK uses `interval '720 hours'` to avoid DST semantics.
- **The archive-grant query is the subtle one.** Keep it in one SQL statement with a dedicated integration test per spec §15 case.
- **Plan price vs expected:** if `expectedPriceCoins` differs from the current active plan → `OFFER_CHANGED { priceCoins }`.

## Tasks

### TASK-167: Subscription periods schema and subscribe endpoint

**Schema** (migration `--name subscription_periods`):
```prisma
enum CoinEntryType     { … SUBSCRIPTION_DEBIT }
enum CoinSourceType    { … SUBSCRIPTION_PERIOD }
enum RevenueSourceType { … SUBSCRIPTION_PERIOD }

/// purchases US-037: one paid 30-day period. State comes from timestamps + server time; only canceled_at changes (US-038).
model SubscriptionPeriod {
  id               String                  @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId           String                  @map("user_id") @db.Uuid
  creatorProfileId String                  @map("creator_profile_id") @db.Uuid
  planId           String                  @map("plan_id") @db.Uuid          // the exact plan version bought
  priceCoins       BigInt                  @map("price_coins")
  feeBps           Int                     @map("fee_bps")
  durationDays     Int                     @map("duration_days")
  startsAt         DateTime                @map("starts_at") @db.Timestamptz(3)
  endsAt           DateTime                @map("ends_at") @db.Timestamptz(3)
  canceledAt       DateTime?               @map("canceled_at") @db.Timestamptz(3)
  createdAt        DateTime                @default(now()) @map("created_at") @db.Timestamptz(3)
  user / creatorProfile / plan relations (RESTRICT)
  @@index([userId, creatorProfileId, endsAt])
  @@index([creatorProfileId, startsAt])
  @@map("subscription_periods")
}
```
SQL:
- `CHECK (price_coins BETWEEN 10 AND 5000)`, `CHECK (fee_bps = 1500)`, `CHECK (duration_days = 30)`, `CHECK (ends_at = starts_at + interval '720 hours')`
- `CREATE UNIQUE INDEX subscription_periods_one_per_start ON subscription_periods (user_id, creator_profile_id, starts_at) WHERE canceled_at IS NULL`
- a trigger that rejects DELETE, and rejects any UPDATE except `canceled_at` going from NULL to a value (compare `OLD` and `NEW` on every other column)

Shared `walletEntryTypeSchema` adds `SUBSCRIPTION_DEBIT`.

**`apps/api/src/modules/subscriptions/subscription-periods.service.ts`** `SubscriptionPeriodsService.subscribe(userId, slug, expectedPriceCoins, key)`, following the overview steps:
- creator lookup by lowercase slug + `PUBLIC_CREATOR`, else `NOT_FOUND`; own → `CANNOT_PURCHASE_OWN`
- `plans.currentActivePlanInTx` null → `PLAN_NOT_AVAILABLE`; price mismatch → `OFFER_CHANGED`
- `startsAt` / `endsAt = startsAt + 30 × 86 400 000 ms`; source id from `SELECT uuidv7()`
- `debitInTx({ entryType: SUBSCRIPTION_DEBIT, sourceType: SUBSCRIPTION_PERIOD, sourceId })`, insert the period with snapshots (`planId`, price, `feeBps: FEE_BPS.SUBSCRIPTION`, `durationDays: 30`)
- `postSaleInTx({ sourceType: SUBSCRIPTION_PERIOD, coins, feeBps: 1500, accruesAt: startsAt })`
- returns `SubscribeResponse { periodId, startsAt, endsAt, priceCoins, scheduled: startsAt > now, balanceCoins }`
- replay → rebuild the response from the stored period id plus the current balance
- a `P2002` on the partial unique index → `RENEWAL_ALREADY_SCHEDULED`

Controller `subscription-periods.controller.ts`: `@Controller('creators')` `@Post(':slug/subscribe')`, `SessionGuard, RateLimitGuard`, `PURCHASE_RATE_LIMIT` (import from purchases or move the constant to `common/`), Idempotency-Key, body `subscribeRequestSchema`, 200, `no-store`.

`SubscriptionPlansService.stateFor` now fills `viewer.current` and `viewer.scheduled` from the user's non-cancelled periods with `ends_at > now` (`canTip` stays false until US-039).

**Files:**
| Action | File Path | Purpose |
|---|---|---|
| MODIFY | `apps/api/prisma/schema.prisma` (+ migration) | Periods, enums, index, trigger |
| CREATE | `apps/api/src/modules/subscriptions/subscription-periods.service.ts`, `subscription-periods.controller.ts` | Subscribe |
| CREATE | `apps/api/src/modules/subscriptions/subscribe.integration.spec.ts` | Tests |
| MODIFY | `apps/api/src/modules/subscriptions/subscriptions.module.ts`, `subscription-plans.service.ts` | Wiring, viewer state |
| MODIFY | `packages/shared/src/wallet.ts` | Entry type |

**Testing (real Postgres; control time with `vi.setSystemTime` for JS `now`, and insert past periods directly for DB-side cases):**
- first subscribe: period [now, now + 30d), balance −75, revenue 63,750 / 11,250 with `accrues_at = starts_at`
- early renewal: starts exactly at the previous `ends_at`, `scheduled: true`, `accrues_at` = that start
- a second renewal → 409 `RENEWAL_ALREADY_SCHEDULED` with no debit; 5 concurrent renewals with different keys → exactly one scheduled period and one debit
- after expiry → a new period starts now
- a plan price change after a purchase does not change the stored period; `expectedPriceCoins` stale → `OFFER_CHANGED`
- no plan, inactive plan, own creator, suspended creator, guest, insufficient balance → errors with no ledger row
- idempotent replay; the DB rejects an overlapping start insert and an UPDATE of `price_coins`

---

### TASK-168: Subscription access, archive grants and Langganan wiring

**`PaidAccessService.paidPostIds`** adds two queries, both only for PREMIUM posts of the page:
1. Active creators:
   ```sql
   SELECT DISTINCT creator_profile_id FROM subscription_periods
   WHERE user_id = $u AND creator_profile_id = ANY($creators) AND canceled_at IS NULL
     AND starts_at <= now() AND now() < ends_at
   ```
   PUBLISHED PREMIUM posts of those creators are paid.
2. Archive grants for the ARCHIVED ids on the page:
   ```sql
   SELECT e.post_id FROM post_archive_episodes e
   JOIN posts p ON p.id = e.post_id
   JOIN subscription_periods sp ON sp.creator_profile_id = p.creator_profile_id
   WHERE e.post_id = ANY($archivedIds) AND e.restored_at IS NULL
     AND sp.user_id = $u AND sp.canceled_at IS NULL
     AND sp.starts_at <= e.archived_at AND e.archived_at < sp.ends_at AND now() < sp.ends_at
   ```

Use DB `now()` in these reads so access always uses server time. Republishing closes the episode (`restored_at`), so the post is PUBLISHED again and query 1 applies.

**Post viewer flag for the Unlock disclosure:** `publicPostViewerSchema` adds `subscribed: z.boolean()` (the viewer has an active period for this post's creator). `PaidAccessService` exposes `activeCreatorIds(userId, creatorIds)` (query 1), reused by `toPublicPosts` and `get`. PostCard passes `post.viewer?.subscribed` to `PostUnlockSheet.subscribedToCreator`. Update fixtures.

**Web:** `subscribeCreator` becomes a real `postJson`. The profile page and manage sheet already read `getCreatorSubscription` (TASK-163); success → `router.refresh()`. Remove the subscription dummies from `lib/demo.ts`. Wallet activity label `SUBSCRIPTION_DEBIT: 'Langganan · {creator}'`. `listTransactions` resolves `SUBSCRIPTION_PERIOD` sources to the creator name and `href: /{slug}`.

Update `codebase-map.md`.

**Files:**
| Action | File Path | Purpose |
|---|---|---|
| MODIFY | `apps/api/src/modules/entitlements/paid-access.service.ts` (+ integration spec) | Subscription + archive grant |
| MODIFY | `apps/api/src/modules/posts/public-posts.service.ts`, `packages/shared/src/posts.ts` | `viewer.subscribed` |
| MODIFY | `apps/api/src/modules/wallets/wallets.service.ts`, `apps/web/src/components/wallet/wallet-activity.tsx` | Activity |
| MODIFY | `apps/web/src/lib/api/purchases.ts`, `lib/demo.ts`, `components/post-card/post-card.tsx` (+ tests) | Wiring |

**Testing (integration, each spec §15 archive case as its own test):**
- an active subscriber sees all PUBLISHED premium posts `full`, including one published after subscribing; an expired subscriber → `locked`
- a subscriber active at archive time → `full` until that period's `ends_at`, then hidden
- someone who subscribes after the archive → hidden
- a scheduled renewal bought before the archive does not extend access past the first period's end
- republish → normal subscriber access; re-archive → a fresh episode is re-evaluated
- a purchase plus an expired subscription → still `full`
- user B is unaffected by user A's period; creator X's period does not unlock creator Y
- `viewer.subscribed` is true only for an active period; media-access returns URLs for an active subscriber
