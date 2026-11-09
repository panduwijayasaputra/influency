# Technical Plan: US-039 — Send Tip

## Architecture Overview

`TipsService` in the `purchases` module. Two thin routes share one method:
- `POST /creators/:slug/tips` (profile tip)
- `POST /posts/:id/tips` (post tip; the creator is derived from the post)

One transaction:
1. claim the Idempotency-Key (scope `tip`, hash `{ target, amountCoins }`)
2. lock the creator profile row, then `lockWalletInTx`
3. **re-check eligibility at commit time**
4. `debitInTx` (`TIP_DEBIT`)
5. insert `tips`
6. `postSaleInTx` with `FEE_BPS.TIP = 0`: a CREATOR row of amount × 1,000 and no PLATFORM row
7. complete the key

Tips never touch entitlements or periods.

Eligibility (pure function `isTipEligible(facts)` + one loader):
- not self (`creator.userId !== userId`)
- the creator is public
- the viewer has an active period for the creator **or** at least one `post_purchases` row for a post of that creator
- post tip only: the post is PUBLISHED, PREMIUM, of that creator, and `decidePostAccess(..., paid)` is `'full'` with `paid` coming from the viewer's own sources. Admin and owner bypasses don't count, because eligibility already excludes self and requires a paid source.

`viewer.canTip` (post) becomes `PREMIUM && PUBLISHED && paid && not own`; `paid` is already computed per page, so there is no extra query. `CreatorSubscriptionState.viewer.canTip` uses the same loader.

## Dependencies

- TASK-161 (sheet, `viewer.canTip`), TASK-164, TASK-165, TASK-167/168.

## Risks

- **Abuse** (rapid micro-tips, structured tipping) is RECOMMENDED for review, not LOCKED. Here only the rate limit applies (`TIP_RATE_LIMIT` `{ max: 10, timeWindow: '1 minute' }`, TBD placeholder). Note it in the codebase map as an open item.
- Tips are repeatable, so there is no natural unique business key. Duplicate safety comes from the required Idempotency-Key, and the ledger `UNIQUE (TIP, tip_id, TIP_DEBIT)` keeps the debit single per tip row.

## Tasks

### TASK-170: Tips schema, endpoints, eligibility and Kirim Tip wiring

**Schema** (migration `--name tips`):
```prisma
enum CoinEntryType     { … TIP_DEBIT }
enum CoinSourceType    { … TIP }
enum RevenueSourceType { … TIP }

/// purchases US-039: a thank-you in Koin, 100% to the creator. Grants no access.
model Tip {
  id               String         @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId           String         @map("user_id") @db.Uuid
  creatorProfileId String         @map("creator_profile_id") @db.Uuid
  postId           String?        @map("post_id") @db.Uuid
  amountCoins      BigInt         @map("amount_coins")
  createdAt        DateTime       @default(now()) @map("created_at") @db.Timestamptz(3)
  relations (RESTRICT)
  @@index([creatorProfileId, createdAt])
  @@index([userId, createdAt])
  @@map("tips")
}
```
SQL: `CHECK (amount_coins BETWEEN 1 AND 1000)` and an append-only trigger. Shared `walletEntryTypeSchema` adds `TIP_DEBIT`.

**API** (`apps/api/src/modules/purchases/`):
- `tip-eligibility.ts`: `isTipEligible({ isSelf, creatorPublic, hasActivePeriod, hasPurchaseFromCreator })` (unit-tested).
- `tips.service.ts` `TipsService`:
  - `tipCreator(userId, slug, amountCoins, key)` and `tipPost(userId, postId, amountCoins, key)`, both calling a private `tipInTx`
  - `canTipCreator(userId, creatorProfileId)` (two `exists` queries: active period via `PaidAccessService.activeCreatorIds`, and a purchase joined to the creator's posts), exported for `SubscriptionPlansService.stateFor`
  - errors: self → `TIP_NOT_ALLOWED`; not eligible → `TIP_NOT_ALLOWED` (403); post not PREMIUM/PUBLISHED/accessible → `TIP_NOT_ALLOWED`; unknown → `NOT_FOUND`; insufficient → `INSUFFICIENT_COINS`
  - response `TipResponse`; replay returns the stored tip plus the current balance
- `tips.controller.ts`: `@Post('creators/:slug/tips')` and `@Post('posts/:id/tips')` (or two controllers matching the existing prefixes), `SessionGuard, RateLimitGuard`, `TIP_RATE_LIMIT`, Idempotency-Key, body `tipRequestSchema`, 200, `no-store`.
- `public-posts.service.ts` `viewerOf`: `canTip = status === 'PUBLISHED' && visibility === 'PREMIUM' && paid && ownerUserId !== userId`. Remove the TASK-161 shortcut.
- `SubscriptionPlansService.stateFor`: `viewer.canTip = await tips.canTipCreator(...)`. Avoid a circular module import: put `canTipCreator` in `PaidAccessService` (entitlements) instead, since both purchases and subscriptions already import entitlements.

**Wallet activity:** `TIP` sources → `detail` = creator name, `href` = post or profile; web label `TIP_DEBIT: 'Tip · {creator}'`.

**Web:** `sendTip` becomes a real `postJson` (`/creators/:slug/tips` or `/posts/:id/tips`). Remove the remaining dummies from `lib/demo.ts`; delete the file if it is empty and update its importers.

Update `codebase-map.md` (model, endpoints, open item: anti-abuse review).

**Files:**
| Action | File Path | Purpose |
|---|---|---|
| MODIFY | `apps/api/prisma/schema.prisma` (+ migration) | Tip model, enums |
| CREATE | `apps/api/src/modules/purchases/tip-eligibility.ts` (+ spec), `tips.service.ts`, `tips.controller.ts`, `tips.integration.spec.ts` | Tips |
| MODIFY | `apps/api/src/modules/entitlements/paid-access.service.ts` | `canTipCreator` |
| MODIFY | `apps/api/src/modules/posts/public-posts.service.ts`, `subscriptions/subscription-plans.service.ts` | canTip |
| MODIFY | `apps/api/src/modules/wallets/wallets.service.ts`, `packages/shared/src/wallet.ts` | Activity |
| MODIFY | `apps/web/src/lib/api/purchases.ts`, `components/wallet/wallet-activity.tsx`, `lib/demo.ts` (+ tests) | Wiring |

**Testing (real Postgres):**
- amounts 0, 1,001 and 2.5 → 400; 1 and 1,000 → 200
- a subscriber can tip the creator and a premium post; a purchaser of one post can tip the creator and that post; someone with neither → 403 and no ledger row
- self-tip → 403; a free-post tip → 403; a locked premium post tip by a subscriber of another creator → 403
- revenue: one CREATOR row of amount × 1,000, no PLATFORM row, `fee_bps` 0
- no new `post_purchases` or `subscription_periods` rows after a tip, and access unchanged
- same key + same body → one tip; same key + different amount → 409; 5 concurrent tips with a balance for 2 → 2 succeed
- `viewer.canTip` is false for admins viewing someone else's premium post without paying, and true for a purchaser; profile `canTip` matches eligibility
