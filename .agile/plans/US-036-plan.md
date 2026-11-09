# Technical Plan: US-036 — Unlock Premium Post (Atomic Purchase & Revenue Ledger)

## Architecture Overview

This story builds the **spend foundation** that US-037 to US-039 reuse, then the first spend (post unlock).

1. **`WalletsService.debitInTx(tx, input)`** — the only code that removes Koin. It locks the wallet `FOR UPDATE`, rejects an insufficient balance with `INSUFFICIENT_COINS`, appends a negative ledger entry, consumes Koin lots **FIFO** (`created_at, id`) and records `coin_spend_allocations`, then moves the cached balance. All of this runs in the caller's transaction.
2. **`financial-ledger` module** — append-only `revenue_ledger_entries`: signed IDR rows per account (`CREATOR`, `PLATFORM`) with a source key, gross and a `fee_bps` snapshot. `RevenueLedgerService.postSaleInTx` uses the pure `splitRevenue(coins, feeBps)` (half-up, integers only). Zero-amount rows are not written (tips: no PLATFORM row).
3. **`purchases` module** — `POST /posts/:id/purchase`. One transaction: claim the Idempotency-Key → lock the post → existing purchase? return it (no debit) → validate → `debitInTx` → insert `post_purchases` (the purchase row **is** the permanent entitlement: no expiry, no separate table) → `postSaleInTx` → complete the key.
4. **Paid access** — `decidePostAccess` stays pure and gains a `paid` fact. A new `PaidAccessService` (entitlements module) computes `paid` for one post or a whole page in one query per source. In this story the only source is purchases; US-037 adds subscriptions and archive grants.

Transaction and lock order (all spends, documented on `debitInTx`): **idempotency key row → business row (post / creator profile / period) → wallet → lots**. The same order everywhere prevents deadlocks.

## Dependencies

- TASK-158 (contract, codes). One migration per task (TASK-164, TASK-165).

## Risks

- **Overspend under concurrency:** the wallet `FOR UPDATE` serialises all spends of one user; the `balance_coins >= 0` CHECK and `unspent_coins >= 0` CHECK are the backstop.
- **Double purchase with different keys:** `UNIQUE (user_id, post_id)` on `post_purchases`. The post row lock (`SELECT … FROM posts WHERE id FOR UPDATE`) makes the second request wait and then see the first purchase, so it answers `alreadyOwned` instead of hitting the constraint. On a `P2002` race fallback, retry the read once and return the existing purchase.
- **Lots vs balance drift:** `debitInTx` asserts `sum(unspent of selected lots) >= coins`. A mismatch throws a plain `Error` (500, logged) and rolls back. It is never silently fixed.
- **Archive access** leaks if `paid` is applied to REMOVED posts or non-public creators. `decidePostAccess` checks those before `paid` (see the truth table in TASK-166).

## Tasks

### TASK-164: Spend core — debit with FIFO lot allocation and revenue ledger

**Schema** (`apps/api/prisma/schema.prisma`, migration `--name koin_spend_core`):
```prisma
enum CoinEntryType  { TOPUP_CREDIT  POST_PURCHASE_DEBIT  @@map("coin_entry_type") }   // US-037/038/039 add more
enum CoinSourceType { TOPUP_ORDER   POST_PURCHASE        @@map("coin_source_type") }

/// Which lots a debit consumed (FIFO). Append-only. A refund (US-038) restores exactly these amounts.
model CoinSpendAllocation {
  id            String          @id @default(dbgenerated("uuidv7()")) @db.Uuid
  ledgerEntryId String          @map("ledger_entry_id") @db.Uuid   // the debit entry
  lotId         String          @map("lot_id") @db.Uuid
  coins         BigInt
  createdAt     DateTime        @default(now()) @map("created_at") @db.Timestamptz(3)
  ledgerEntry   CoinLedgerEntry @relation(fields: [ledgerEntryId], references: [id], onDelete: Restrict)
  lot           CoinLot         @relation(fields: [lotId], references: [id], onDelete: Restrict)
  @@unique([ledgerEntryId, lotId])
  @@index([lotId])
  @@map("coin_spend_allocations")
}

enum RevenueAccount    { CREATOR PLATFORM                          @@map("revenue_account") }
enum RevenueSourceType { POST_PURCHASE                              @@map("revenue_source_type") }  // + SUBSCRIPTION_PERIOD, TIP later
enum RevenueEntryKind  { SALE REVERSAL                              @@map("revenue_entry_kind") }

/// Creator/platform split of every Koin spend, in IDR. Append-only. Earnings maturity and payouts come in creator-studio.
model RevenueLedgerEntry {
  id               String            @id @default(dbgenerated("uuidv7()")) @db.Uuid
  creatorProfileId String            @map("creator_profile_id") @db.Uuid   // set on PLATFORM rows too, for tracing
  account          RevenueAccount
  kind             RevenueEntryKind
  amountIdr        BigInt            @map("amount_idr")      // signed: SALE > 0, REVERSAL < 0
  grossIdr         BigInt            @map("gross_idr")       // snapshot of the whole transaction
  feeBps           Int               @map("fee_bps")
  sourceType       RevenueSourceType @map("source_type")
  sourceId         String            @map("source_id") @db.Uuid
  /// When the earning starts to accrue: the spend time, or a scheduled period's starts_at (US-037). For the 14-day clock in creator-studio.
  accruesAt        DateTime          @map("accrues_at") @db.Timestamptz(3)
  createdAt        DateTime          @default(now()) @map("created_at") @db.Timestamptz(3)
  creatorProfile   CreatorProfile    @relation(fields: [creatorProfileId], references: [id], onDelete: Restrict)
  @@unique([sourceType, sourceId, account, kind])
  @@index([creatorProfileId, accruesAt])
  @@map("revenue_ledger_entries")
}
```
Add the back-relations (`CoinLedgerEntry.allocations`, `CoinLot.allocations`, `CreatorProfile.revenueEntries`). Appended SQL:
- `coin_spend_allocations_coins_positive CHECK (coins > 0)`
- `revenue_ledger_entries_amount_sign CHECK ((kind = 'SALE' AND amount_idr > 0) OR (kind = 'REVERSAL' AND amount_idr < 0))`
- `revenue_ledger_entries_fee_bps_range CHECK (fee_bps BETWEEN 0 AND 10000)`, `gross_idr > 0`
- append-only triggers on `coin_spend_allocations` and `revenue_ledger_entries` (copy `coin_ledger_entries_append_only()`)

**Pure functions** (unit-tested):
- `apps/api/src/modules/wallets/allocate-fifo.ts`: `allocateFifo(lots: { id: string; unspentCoins: bigint }[], coins: bigint): { lotId: string; coins: bigint }[]`. Lots are in FIFO order. It throws when the total is short or `coins <= 0`.
- `apps/api/src/modules/financial-ledger/split-revenue.ts`: `splitRevenue(coins: bigint, feeBps: number): { grossIdr; platformIdr; creatorIdr }` where `grossIdr = coins * 1000n`, `platformIdr = (grossIdr * BigInt(feeBps) + 5000n) / 10000n` (half-up), `creatorIdr = grossIdr - platformIdr`. `KOIN_TO_IDR` comes from shared. Fee constants live in `split-revenue.ts`: `FEE_BPS = { POST_PURCHASE: 2000, SUBSCRIPTION: 1500, TIP: 0 } as const` (LOCKED).

**`WalletsService.debitInTx`** (`wallets.service.ts`):
```ts
export interface DebitInput { userId: string; coins: bigint; entryType: CoinEntryType; sourceType: CoinSourceType; sourceId: string }
async debitInTx(tx, input): Promise<{ balanceCoins: bigint; entryId: string; allocations: { lotId: string; coins: bigint }[] }>
```
Steps:
1. `coins <= 0` → throw.
2. `SELECT id, balance_coins FROM coin_wallets WHERE user_id = $1 FOR UPDATE`. A missing wallet or `balance < coins` → `DomainError('INSUFFICIENT_COINS', { required: Number(coins), available: Number(balance ?? 0) })` (use `toSafeInt`).
3. Lots: `SELECT id, unspent_coins FROM coin_lots WHERE wallet_id = $1 AND unspent_coins > 0 ORDER BY created_at, id FOR UPDATE`, then `allocateFifo`.
4. Insert the ledger entry `amountCoins: -coins`, `balanceAfterCoins: balance - coins`.
5. For each allocation: `UPDATE coin_lots SET unspent_coins = unspent_coins - $c WHERE id = $id` and insert a `coin_spend_allocations` row.
6. Update `balance_coins`.

Also add `lockWalletInTx(tx, userId)` (insert-if-missing + `FOR UPDATE`) for callers that must serialise on the wallet before reading their own state (US-037).

**`financial-ledger` module** (`apps/api/src/modules/financial-ledger/`): `FinancialLedgerModule` exports `RevenueLedgerService` with:
- `postSaleInTx(tx, { creatorProfileId, sourceType, sourceId, coins, feeBps, accruesAt })` → computes the split and inserts the CREATOR row (always) and the PLATFORM row (only if > 0); returns the split.
- `reverseSaleInTx(tx, { sourceType, sourceId })` → reads the SALE rows and inserts mirror REVERSAL rows (used by US-038). It is unique per source/account/kind, so a second reversal fails.

**Files:**
| Action | File Path | Purpose |
|---|---|---|
| MODIFY | `apps/api/prisma/schema.prisma` (+ migration) | Enums, allocations, revenue ledger, triggers |
| CREATE | `apps/api/src/modules/wallets/allocate-fifo.ts` (+ `.spec.ts`) | FIFO |
| MODIFY | `apps/api/src/modules/wallets/wallets.service.ts` | `debitInTx`, `lockWalletInTx` |
| CREATE | `apps/api/src/modules/wallets/debit.integration.spec.ts` | Real-DB debit tests |
| CREATE | `apps/api/src/modules/financial-ledger/financial-ledger.module.ts`, `revenue-ledger.service.ts`, `split-revenue.ts` (+ `.spec.ts`), `revenue-ledger.integration.spec.ts` | Revenue ledger |
| MODIFY | `packages/shared/src/wallet.ts` | `walletEntryTypeSchema` adds `POST_PURCHASE_DEBIT` |

**Testing:**
- unit `allocateFifo`: one lot, spanning lots, exact drain, short → throws
- unit `splitRevenue`: 25 Koin @2000 → 25,000 / 5,000 / 20,000; 75 @1500 → 75,000 / 11,250 / 63,750; 20 @0 → platform 0; creator + platform = gross for 1..1000 × {0, 1500, 2000}
- integration: debit spanning two lots updates both lots, the allocations and the balance; insufficient → `INSUFFICIENT_COINS` and nothing written; 10 concurrent debits of 10 against a balance of 50 → exactly 5 succeed, balance 0, `sum(unspent) == balance`; UPDATE/DELETE on allocations and on revenue rows is rejected; a duplicate SALE for the same source is rejected

---

### TASK-165: Post purchase endpoint

**Schema** (migration `--name post_purchases`):
```prisma
/// purchases US-036: a permanent unlock. The row itself is the entitlement (never expires). Snapshot of the offer at purchase.
model PostPurchase {
  id          String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId      String    @map("user_id") @db.Uuid
  postId      String    @map("post_id") @db.Uuid
  postOfferId String    @map("post_offer_id") @db.Uuid
  priceCoins  BigInt    @map("price_coins")
  feeBps      Int       @map("fee_bps")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  user  User      @relation(fields: [userId], references: [id], onDelete: Restrict)
  post  Post      @relation(fields: [postId], references: [id], onDelete: Restrict)
  offer PostOffer @relation(fields: [postOfferId], references: [id], onDelete: Restrict)
  @@unique([userId, postId])
  @@index([postId])
  @@map("post_purchases")
}
```
SQL: `CHECK (price_coins BETWEEN 5 AND 1000)`, `CHECK (fee_bps = 2000)`, append-only trigger.

**`apps/api/src/modules/purchases/`**:
- `post-purchases.service.ts` `PostPurchasesService.purchase(userId, postId, expectedPriceCoins, key)`, in one `prisma.$transaction`:
  1. `idempotency.claim(tx, { scope: 'post_purchase', requestHash: requestHash({ postId, expectedPriceCoins }) })`. On replay: return `resultFor(resultId)` (`REQUEST_IN_PROGRESS` if null).
  2. Lock the post: `SELECT id FROM posts WHERE id = $1 FOR UPDATE`; then load status, visibility, creator (`userId`, public?) and the current offer (highest version).
  3. An existing `post_purchases (userId, postId)` → complete the key with its id and return `{ …, alreadyOwned: true }` (no debit).
  4. Validate: unknown post → `NOT_FOUND`; own post → `CANNOT_PURCHASE_OWN`; FREE, not PUBLISHED (incl. ARCHIVED and REMOVED), or a non-public creator → `POST_NOT_AVAILABLE`; no offer → `POST_NOT_AVAILABLE`; `offer.priceCoins !== expectedPriceCoins` → `OFFER_CHANGED { priceCoins }`.
  5. Create the purchase id (`SELECT uuidv7()`), then `wallets.debitInTx(tx, { coins: price, entryType: POST_PURCHASE_DEBIT, sourceType: POST_PURCHASE, sourceId })`.
  6. Insert `post_purchases`.
  7. `revenue.postSaleInTx(tx, { creatorProfileId, sourceType: POST_PURCHASE, sourceId, coins: price, feeBps: FEE_BPS.POST_PURCHASE, accruesAt: now })`.
  8. `idempotency.complete(...)` and return `{ purchaseId, postId, priceCoins, balanceCoins, alreadyOwned: false }`.

  A `DomainError` thrown inside rolls back the key claim too, so the user can retry after a top-up with the same key.
- `post-purchases.controller.ts`: `@Controller('posts')` `@Post(':id/purchase')`, `@UseGuards(SessionGuard, RateLimitGuard)`, `@RateLimit(PURCHASE_RATE_LIMIT)` (`{ max: 20, timeWindow: '1 minute' }`, TBD placeholder comment), `parseIdempotencyKey(header)`, body `ZodValidationPipe(purchasePostRequestSchema)`, `ParseUUIDPipe`-equivalent (malformed id → 404 `NOT_FOUND`, matching the public posts service), `@HttpCode(200)`, `no-store`.
- `purchases.module.ts` imports `WalletsModule`, `FinancialLedgerModule` and the module providing `IdempotencyService`; registered in `AppModule`.

No outbox yet: the `outbox_events` table does not exist. Note this in the module doc comment as `shortcut: no outbox event until notifications (feature #10) adds the outbox`.

**Files:**
| Action | File Path | Purpose |
|---|---|---|
| MODIFY | `apps/api/prisma/schema.prisma` (+ migration) | `PostPurchase` |
| CREATE | `apps/api/src/modules/purchases/purchases.module.ts`, `post-purchases.service.ts`, `post-purchases.controller.ts` | Endpoint |
| CREATE | `apps/api/src/modules/purchases/post-purchases.integration.spec.ts` | Tests |
| MODIFY | `apps/api/src/app.module.ts` | Register |

**Testing (Supertest, real Postgres; test helper credits Koin via `creditInTx` with a fake TOPUP source):**
- happy path: balance −25, one ledger debit, allocations, purchase row with the offer version snapshot, revenue rows 20,000 / 5,000
- same key + same body → the same purchaseId and no second debit; same key + different `expectedPriceCoins` → 409 `DUPLICATE_REQUEST`
- a new key for an owned post → `alreadyOwned: true` with balance unchanged; 5 concurrent requests with different keys → exactly one debit
- two different posts bought concurrently with a balance for one → one 200, one 402 `INSUFFICIENT_COINS` with details
- an offer price change after the sheet opened → 409 `OFFER_CHANGED` with the new price, no debit
- rejections with no ledger row: guest 401, own 400, FREE / DRAFT / ARCHIVED / REMOVED / suspended creator, malformed id 404
- a missing Idempotency-Key → 400; CSRF without Origin → 403
- a later offer change does not change the stored snapshot

---

### TASK-166: Paid access, wallet activity and Unlock wiring

**Access rule** (`apps/api/src/modules/entitlements/post-access.ts`): `PostAccessFacts` gains `paid: boolean` ("the viewer has a purchase / covering subscription / archive grant; computed by PaidAccessService"). The new order:
```ts
if (viewer?.isAdmin) return 'full';
if (post.status === 'REMOVED') return 'hidden';
if (viewer?.userId === post.ownerUserId) return 'full';
if (!post.creatorPublic) return 'hidden';
if (post.status === 'PUBLISHED') return post.visibility === 'FREE' || post.paid ? 'full' : 'locked';
if (post.status === 'ARCHIVED' && post.visibility === 'PREMIUM' && post.paid) return 'full';   // spec §4: buyers keep access privately
return 'hidden';
```
Update the doc comment (drop the old "US-050" reference) and extend `post-access.spec.ts` with the full truth table.

**`apps/api/src/modules/entitlements/paid-access.service.ts`** `PaidAccessService.paidPostIds(userId: string | null, posts: { id: string; creatorProfileId: string; status: PostStatus; visibility: PostVisibility }[]): Promise<Set<string>>`. Guest or empty list → empty set. PREMIUM posts only. In this story: one `postPurchase.findMany({ where: { userId, postId: { in } } })`. The doc comment says US-037 adds subscription periods and archive grants here.

Wire it in:
- `PostAccessService.check`: also select `id, creatorProfileId`; `paid = (await paid.paidPostIds(userId, [post])).has(post.id)`.
- `PublicPostsService.toPublicPosts`: one `paidPostIds(userId, rows)` per page, passed into `decidePostAccess`. `creatorProfileId` is on `Post` already.
- `EntitlementsModule` provides and exports `PaidAccessService`.

**Wallet activity:** `WalletTransaction` (`packages/shared/src/wallet.ts`) gains `href: z.string().nullable()` (a relative link to the related item). In `WalletsService.listTransactions`, batch-load purchases for `POST_PURCHASE` source ids (`post.creatorProfile.slug/displayName`) → `detail: displayName`, `href: /{slug}/posts/{postId}`. Web `components/wallet/wallet-activity.tsx` adds the label `POST_PURCHASE_DEBIT: (t) => 'Buka post · ' + …` and renders `href` as a link. Update the wallet tests and fixtures for `href`.

**Web wiring:** `purchasePost` in `lib/api/purchases.ts` becomes a real `postJson('/posts/:id/purchase', { expectedPriceCoins }, key)`. Remove `DEMO_PURCHASE_MESSAGE` usage for unlocks (keep it only while subscribe and tip are still dummy). The success toast becomes "Post terbuka".

Update `codebase-map.md` (modules `purchases`, `financial-ledger`; models; endpoint; access rule).

**Files:**
| Action | File Path | Purpose |
|---|---|---|
| MODIFY | `apps/api/src/modules/entitlements/post-access.ts` (+ spec), `post-access.service.ts`, `entitlements.module.ts` | Paid fact |
| CREATE | `apps/api/src/modules/entitlements/paid-access.service.ts` (+ integration spec) | Paid sources |
| MODIFY | `apps/api/src/modules/posts/public-posts.service.ts` | Batched paid set |
| MODIFY | `apps/api/src/modules/wallets/wallets.service.ts`, `packages/shared/src/wallet.ts` (+ tests) | Activity detail/href |
| MODIFY | `apps/web/src/components/wallet/wallet-activity.tsx`, `lib/api/purchases.ts`, `lib/demo.ts` (+ tests) | UI wiring |

**Testing:**
- unit truth table: admin / owner / buyer / other × PUBLISHED / ARCHIVED / REMOVED / DRAFT × FREE / PREMIUM × creator public or not
- integration:
  - after a purchase, `GET /creators/:slug/posts/:id` → `access: 'full'` and `GET /posts/:id/media-access` returns URLs for the buyer, while user B still gets `locked` / 403
  - archived after purchase → the buyer gets `full` on the detail endpoint, the post is absent from the public list, and others get 404
  - REMOVED → 404 for the buyer
  - the feed and creator list show `full` for bought posts using one paid query per page
  - wallet activity shows the debit with `detail` and `href`
- Playwright (if the e2e harness covers wallet top-up with the fake gateway): top up 25 → unlock a 25-Koin post → media visible; the logged-out page HTML contains no media URL
