# Technical Plan: US-063 — Request Payout (Quote & Atomic Reservation)

## Architecture Overview

`PayoutsService` + `PayoutsController` in the `payouts` module. Reservation means a `creator_payouts` row in status REQUESTED: `EarningsService.balanceInTx` subtracts REQUESTED amounts from available (TASK-210), so inserting the row **is** the reservation. No separate balance column exists to drift.

**Transfer fee** comes from config, never from the client:
- `PAYOUT_TRANSFER_FEE_IDR`: int, default `2500`, marked EXAMPLE / [TBD]. The env refine requires it to be `< PAYOUT_MIN_IDR`, which guarantees net > 0.
- `PAYOUT_TRANSFER_FEE_CONFIRMED`: bool, default `false`. `feeIsPlaceholder = !confirmed`.

**`GET /me/payouts/quote?amountIdr=`:** validates with `payoutQuoteQuerySchema` (min 100.000 → 400). It reads the active account (`PayoutAccountsService.activeInTx`, none → 409 `PAYOUT_ACCOUNT_REQUIRED`) and the balance (amount > available → 409 `PAYOUT_EXCEEDS_AVAILABLE` with `details.availableIdr`), and returns a `PayoutQuote`. Read-only, no lock.

**`POST /me/payouts`:**
- Header `Idempotency-Key` (`parseIdempotencyKey`), body `createPayoutSchema` `{ amountIdr, expectedFeeIdr }`, rate limit 5/min (TBD constant `PAYOUT_RATE_LIMIT`).
- Returns 201 `Payout`; a replay returns 200 with the same payout.
- **One transaction** (`prisma.$transaction`, READ COMMITTED):
  1. `SELECT id FROM creator_profiles WHERE id = $creatorProfileId FOR UPDATE`. This serializes all payout requests/cancels for the creator. Subscribe/tip hold `FOR SHARE` on the same row, so they also wait (milliseconds).
  2. `idempotency.claim(tx, { userId, scope: 'payout', key, requestHash: requestHash(body) })`. A replay → load the payout by `resultId` (scoped to the creator) and return it. A different payload → `DUPLICATE_REQUEST` (409).
  3. `if (expectedFeeIdr !== configFee) throw PAYOUT_FEE_CHANGED` (details: `feeIdr`).
  4. `account = activeInTx(tx, creatorProfileId)`, none → `PAYOUT_ACCOUNT_REQUIRED`.
  5. `balance = earnings.balanceInTx(tx, creatorProfileId)`. It runs after the lock, so under READ COMMITTED it sees every committed payout. `amountIdr > available` → `PAYOUT_EXCEEDS_AVAILABLE`.
  6. Insert `creator_payouts` `{ creatorProfileId, payoutAccountId, bankCode, accountLast4, holderName (snapshots), amountIdr, feeIdr, netIdr: amount − fee, feeIsPlaceholder, status: REQUESTED, requestedByUserId }` and `creator_payout_status_changes { fromStatus: null, toStatus: REQUESTED, actorUserId }`.
  7. `idempotency.complete(tx, { …, resultId: payout.id })`.
- The DB CHECKs (amount ≥ 100000, net = amount − fee, net > 0) back up the service checks.
- No outbox/notification (none exists for payouts yet), no provider call, no money movement.

## Dependencies

- TASK-206 schemas and error codes; TASK-210 `EarningsService.balanceInTx`; TASK-213 `PayoutAccountsService.activeInTx`; `IdempotencyService` / `parseIdempotencyKey` / `requestHash` (`common/idempotency.ts`); `RateLimitGuard`.
- New env: `PAYOUT_TRANSFER_FEE_IDR`, `PAYOUT_TRANSFER_FEE_CONFIRMED` (`.env.example` with a "[TBD] example" comment).

## Risks

- **Double reservation under concurrency.** Mitigation: the creator-row `FOR UPDATE` before the balance read, plus a concurrency test (N parallel requests whose total exceeds available → the sum of REQUESTED ≤ available).
- **Revenue changing during a request.** New sales only add to pending. Reversals only affect unmatured scheduled periods (US-038 rejects cancel after start), so matured never decreases mid-request.
- **Idempotency replay across creators.** The key store is per user; the replay lookup also filters by `creatorProfileId`.

## Tasks

### TASK-214: Transfer fee config + quote endpoint

- **`common/env.ts`:** `PAYOUT_TRANSFER_FEE_IDR: z.coerce.number().int().min(0).default(2500)` (comment `[TBD] EXAMPLE value; actual bank cost is OPEN`), `PAYOUT_TRANSFER_FEE_CONFIRMED` boolean (same parsing as other boolean flags such as `POST_MODERATION_REQUIRED`), and a refine `fee < PAYOUT_MIN_IDR`. Extend `env.spec.ts`. Add both to `.env.example`.
- **`apps/api/src/modules/payouts/payouts.service.ts`:** `fee(): { feeIdr: bigint; feeIsPlaceholder: boolean }` and `quote(creatorProfileId, amountIdr): Promise<PayoutQuote>` as above.
- **`payouts.controller.ts`:** `@Controller('me/payouts')`, `@UseGuards(ApprovedCreatorGuard)`, `@Get('quote')` with the query pipe, `no-store`.
- **Web:** `quotePayout(amountIdr)` in `lib/api/payouts.ts` → real GET, parsed with `payoutQuoteSchema`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/common/env.ts` (+ spec), `.env.example` | Fee config |
| CREATE | `apps/api/src/modules/payouts/payouts.service.ts`, `payouts.controller.ts` | Quote |
| MODIFY | `apps/api/src/modules/payouts/payouts.module.ts` | Wire |
| CREATE | `apps/api/src/modules/payouts/payout-quote.integration.spec.ts` | Tests |
| MODIFY | `apps/web/src/lib/api/payouts.ts` (+ test) | Real quote |

**Testing:**
- Env: a fee ≥ 100000 fails validation; the default is 2500 / placeholder true.
- Quote: correct fee/net/destination; 99999 → 400; no active account → 409 `PAYOUT_ACCOUNT_REQUIRED`; amount > available → 409 `PAYOUT_EXCEEDS_AVAILABLE`.
- Guest 401; non-creator 403.

---

### TASK-215: Atomic payout request

- **`PayoutsService.request(userId, creatorProfileId, key, body): Promise<{ payout: Payout; replay: boolean }>`** implementing steps 1–7 exactly. Map the row to `Payout` (`destination.bankName = payoutBankName(bankCode)`, `toSafeInt`). Export a `toPayout(row)` mapper for US-064.
- **Controller:** `@Post()` with `@Headers('idempotency-key')`, body pipe, `RateLimitGuard` `PAYOUT_RATE_LIMIT` (constant in the service file, `// [TBD] example`). Respond 201, or 200 on replay.
- **Web:** `requestPayout(input, key)` → real `postJson('/api/v1/me/payouts', input, { idempotencyKey: key })`, parsed with `payoutSchema`. The sheet (TASK-206) is unchanged. Remove the request dummy; if `studio-dummy-store.ts` still exists it only serves `cancelPayout`/`fetchPayouts` until US-064.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/payouts/payouts.service.ts`, `payouts.controller.ts` | Request |
| CREATE | `apps/api/src/modules/payouts/payout-request.integration.spec.ts` | Tests |
| MODIFY | `apps/web/src/lib/api/payouts.ts` (+ test) | Real request |

**Testing** (integration; matured revenue rows inserted relative to `dbNow`, plus an active account via the service):
- A success snapshots the account. Deleting or deactivating the account afterwards doesn't change the payout's destination.
- Available drops by the amount and reserved rises.
- Same key + same body → same id, one row (replay 200).
- Same key + different amount → 409 `DUPLICATE_REQUEST`; a missing or malformed key → 400.
- `expectedFeeIdr` mismatch → 409 `PAYOUT_FEE_CHANGED`, no row.
- Exactly available → ok; available + 1 → 409; 99999 → 400; no active account → 409.
- **Concurrency:** available 250000, 5 parallel requests of 100000 with different keys → exactly 2 succeed, the rest get `PAYOUT_EXCEEDS_AVAILABLE`, and the sum of REQUESTED = 200000.
- **Concurrency:** 5 parallel requests with the **same** key → one row.
- One status-change row (null → REQUESTED) with the actor.
- Another creator's balance is unaffected; guest 401; non-creator 403; CSRF without Origin 403.
