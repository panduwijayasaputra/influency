# Technical Plan: US-038 — Cancel Scheduled Renewal

## Architecture Overview

`POST /subscription-periods/:id/cancel-scheduled` (`SessionGuard`, rate-limited). It is idempotent by nature, so no Idempotency-Key is needed. One transaction:
1. `lockWalletInTx(userId)`: the same first lock as subscribe, so cancel and subscribe for this user serialise.
2. `SELECT … FROM subscription_periods WHERE id = $1 FOR UPDATE`. Missing or another user's → `NOT_FOUND`.
3. Already cancelled → return the stored result (`refundedCoins = price_coins`, current balance), with no second credit.
4. `now()` (DB time, read in the transaction) `>= starts_at` → `RENEWAL_ALREADY_STARTED`. A period "starts" only by the clock, so this single comparison is the serialisation with activation: either before the start (cancel) or not.
5. `UPDATE subscription_periods SET canceled_at = now()` (the only update the trigger allows).
6. `WalletsService.refundSpendInTx(...)`: a credit ledger entry for 100% of the Koin, and each allocation of the original debit restored to its lot (`unspent_coins += coins`). No new lot: the Koin go back to the lots they came from, so lot tracing stays exact.
7. `RevenueLedgerService.reverseSaleInTx({ sourceType: SUBSCRIPTION_PERIOD, sourceId })`: mirror REVERSAL rows.

Exactly-once is guaranteed three ways: the period row lock, the `canceled_at` check, and the ledger `UNIQUE (source_type, source_id, entry_type)` for `SUBSCRIPTION_REFUND_CREDIT`, plus the revenue `UNIQUE (…, kind)`.

## Dependencies

- TASK-164 (allocations, revenue reversal), TASK-167 (periods).

## Risks

- Restoring lots must never exceed `issued_coins`. The existing CHECK `unspent_coins BETWEEN 0 AND issued_coins` is the backstop.
- Using DB `now()` here while subscribe uses JS time could disagree by clock skew between the app and DB hosts (same machine locally). Document it; both are server time.

## Tasks

### TASK-169: Cancel scheduled renewal with full Koin return

**Schema** (migration `--name subscription_refund`): `CoinEntryType` adds `SUBSCRIPTION_REFUND_CREDIT`; shared `walletEntryTypeSchema` adds it as well.

**`WalletsService.refundSpendInTx`** (`wallets.service.ts`):
```ts
async refundSpendInTx(tx, input: { userId: string; debitSource: { sourceType: CoinSourceType; sourceId: string; entryType: CoinEntryType };
  creditEntryType: CoinEntryType }): Promise<{ balanceCoins: bigint; refundedCoins: bigint }>
```
Steps:
1. Lock the wallet `FOR UPDATE`.
2. Find the debit entry by `(sourceType, sourceId, entryType)` and its allocations.
3. `refundedCoins = -debit.amountCoins`.
4. Insert the credit entry (`amountCoins: +refunded`, same source type and id, `creditEntryType`).
5. For each allocation: `UPDATE coin_lots SET unspent_coins = unspent_coins + $c WHERE id = $lot`.
6. Update the balance.

The doc comment says this is the only path that returns spent Koin, and that it does not create a lot.

**`SubscriptionPeriodsService.cancelScheduled(userId, periodId)`**: the steps from the overview; returns `CancelScheduledResponse`. A malformed id → `NOT_FOUND`.

Controller: `@Controller('subscription-periods')` `@Post(':id/cancel-scheduled')`, `SessionGuard, RateLimitGuard`, `PURCHASE_RATE_LIMIT`, 200, `no-store`.

`subscription-periods` is a top-level API path, not a web route, so no reserved-slug change is needed.

**Wallet activity:** `listTransactions` resolves `SUBSCRIPTION_PERIOD` sources for the credit entry too. The web label `SUBSCRIPTION_REFUND_CREDIT: 'Perpanjangan dibatalkan · {creator}'` is shown as `+N`.

**Web:** `cancelScheduledRenewal` becomes a real `postJson` (no key); remove its dummy.

Update `codebase-map.md`.

**Files:**
| Action | File Path | Purpose |
|---|---|---|
| MODIFY | `apps/api/prisma/schema.prisma` (+ migration) | Entry type |
| MODIFY | `apps/api/src/modules/wallets/wallets.service.ts` | `refundSpendInTx` |
| MODIFY | `apps/api/src/modules/subscriptions/subscription-periods.service.ts`, `subscription-periods.controller.ts` | Endpoint |
| CREATE | `apps/api/src/modules/subscriptions/cancel-scheduled.integration.spec.ts` | Tests |
| MODIFY | `packages/shared/src/wallet.ts`, `apps/web/src/components/wallet/wallet-activity.tsx`, `apps/web/src/lib/api/purchases.ts`, `lib/demo.ts` | Wiring |

**Testing (real Postgres):**
- cancel before the start → `canceled_at` set, +price credit, lots restored to exactly their pre-debit `unspent`, revenue REVERSAL rows −63,750 / −11,250 (net 0 per account for the source), the active period untouched, `viewer.scheduled` null afterwards
- a repeat cancel → 200 with the same refunded amount and no second credit; 10 concurrent cancels → one credit entry
- cancel at or after `starts_at` (insert a period whose start is in the past) → 409 `RENEWAL_ALREADY_STARTED`; cancelling the active period → 409
- another user's period → 404; a guest → 401; CSRF without Origin → 403
- `sum(unspent lots) == balance` after the refund
- after the cancel, the user can schedule a renewal again (the partial unique index ignores cancelled rows)
