# Technical Plan: US-060 — Earnings Balance API

## Architecture Overview

New module `apps/api/src/modules/payouts/` (domain from backend.md) holding earnings, payout accounts and payouts. This story creates the feature's payout data model, because the balance has to subtract reserved and paid payouts, then computes the balance **on read** (decision 2026-11-09).

**Balance** (`EarningsService.balanceInTx(tx, creatorProfileId)`, also used by US-063 under its lock). One raw SQL statement with DB time:

```sql
WITH rev AS (
  SELECT
    COALESCE(SUM(amount_idr) FILTER (WHERE accrues_at <= now() - make_interval(days => ${EARNINGS_PENDING_DAYS})), 0) AS matured,
    COALESCE(SUM(amount_idr) FILTER (WHERE accrues_at >  now() - make_interval(days => ${EARNINGS_PENDING_DAYS})), 0) AS pending,
    MIN(accrues_at) FILTER (WHERE accrues_at > now() - make_interval(days => ${EARNINGS_PENDING_DAYS})) AS next_accrues_at
  FROM revenue_ledger_entries
  WHERE creator_profile_id = $1::uuid AND account = 'CREATOR'
), pay AS (
  SELECT
    COALESCE(SUM(amount_idr) FILTER (WHERE status = 'REQUESTED'), 0) AS reserved,
    COALESCE(SUM(amount_idr) FILTER (WHERE status = 'PAID_OUT'), 0)  AS paid
  FROM creator_payouts WHERE creator_profile_id = $1::uuid
)
SELECT rev.*, pay.*, ... FROM rev, pay
```

- `available = matured − reserved − paid`. If it is negative, log an error (`{ creatorProfileId, matured, reserved, paid }`, no PII) and return 0. It should never happen: payouts are bounded by available under a lock, and reversals only hit unmatured rows.
- `nextMaturityAt = next_accrues_at + 14 days`. `nextMaturityIdr` = SUM of pending rows whose `(accrues_at + 14d)` falls on the same Asia/Jakarta calendar day as `nextMaturityAt` (`date_trunc('day', (accrues_at + interval) AT TIME ZONE 'Asia/Jakarta')`).
- Pending includes scheduled periods (`accrues_at` = period start, in the future); they mature 14 days after the start. A cancelled scheduled renewal has a REVERSAL with the same `accrues_at` (US-038 `reverseSaleInTx`), so it nets to 0 in whichever bucket it falls into.
- `reserved` counts REQUESTED only; `paid` counts PAID_OUT. The admin feature extends the reserving set if it adds statuses (constant `RESERVING_PAYOUT_STATUSES` in the service).
- BigInt end to end, converted with `toSafeInt` (`common/bigint.ts`) for JSON.

## Dependencies

- `packages/shared/src/payouts.ts` from TASK-202 (`earningsBalanceSchema`, `EARNINGS_PENDING_DAYS`, `PAYOUT_STATUSES`).
- `ApprovedCreatorGuard` (`req.creatorProfileId`).

## Risks

- **Clock source.** JS `Date` and DB `now()` can differ. Mitigation: all maturity math happens in SQL with `now()`. Integration tests build rows relative to DB time (`dbNow` from `common/db-time.ts`).
- **The schema conventions spec** fails on new tables if a convention is missed. Mitigation: follow uuidv7 ids, timestamptz(3), snake_case `@@map`, BIGINT money.

## Tasks

### TASK-209: Payouts data model (accounts, payouts, status history)

**Prisma models + migration `creator_payouts`:**
- `enum PayoutStatus { REQUESTED CANCELED REJECTED PAID_OUT @@map("payout_status") }`.
- `CreatorPayoutAccount` → `creator_payout_accounts`:
  - Columns: `id` uuidv7; `creatorProfileId` FK RESTRICT; `bankCode String @map("bank_code")`; `accountNumberEnc String @map("account_number_enc")` (AES-GCM payload, US-062); `last4 String`; `holderName String @map("holder_name")`; `active Boolean @default(false)`; `createdAt`; `deletedAt DateTime? @map("deleted_at")`.
  - `@@index([creatorProfileId])`.
  - Migration SQL:
    - partial UNIQUE `creator_payout_accounts_one_active ON (creator_profile_id) WHERE active AND deleted_at IS NULL`;
    - `CHECK (last4 ~ '^[0-9]{4}$')`;
    - `CHECK (char_length(holder_name) BETWEEN 1 AND 100)`;
    - `CHECK (NOT (active AND deleted_at IS NOT NULL))`;
    - a trigger allowing UPDATE only of `active` and `deleted_at` (deleted_at only from NULL to a value), rejecting DELETE.
- `CreatorPayout` → `creator_payouts`:
  - Columns: `id`; `creatorProfileId` FK RESTRICT; `payoutAccountId` FK RESTRICT; snapshot `bankCode`, `accountLast4 @map("account_last4")`, `holderName`; `amountIdr BigInt`, `feeIdr BigInt`, `netIdr BigInt`; `feeIsPlaceholder Boolean @map("fee_is_placeholder")`; `status PayoutStatus @default(REQUESTED)`; `requestedByUserId` FK users; `createdAt`; `updatedAt @updatedAt`.
  - `@@index([creatorProfileId, createdAt])`.
  - CHECKs: `amount_idr >= 100000` (LOCKED minimum), `fee_idr >= 0`, `net_idr = amount_idr - fee_idr`, `net_idr > 0`.
  - Trigger: DELETE rejected. UPDATE may only change `status` and `updated_at`, and only REQUESTED → CANCELED | REJECTED | PAID_OUT.
- `CreatorPayoutStatusChange` → `creator_payout_status_changes`:
  - Columns: `id`; `payoutId` FK RESTRICT; `fromStatus PayoutStatus?`; `toStatus PayoutStatus`; `actorUserId` FK users; `createdAt`.
  - `@@index([payoutId, createdAt])`.
  - Append-only trigger (reuse the pattern of the existing append-only triggers in earlier migrations).
- Relations on `CreatorProfile` / `User` as needed.
- **Module skeleton:** `payouts.module.ts` (imports `CommonModule`), registered in `app.module.ts`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` (+ migration `creator_payouts`) | 3 tables, enum, CHECKs, triggers, partial unique |
| CREATE | `apps/api/src/modules/payouts/payouts.module.ts` | Module |
| MODIFY | `apps/api/src/app.module.ts` | Register |
| CREATE | `apps/api/src/modules/payouts/payouts-schema.integration.spec.ts` | Constraint tests |

**Testing** (integration, raw inserts via Prisma):
- Two active non-deleted accounts for one creator → unique violation; active + deleted rejected; bad last4 rejected.
- Payout CHECKs (amount < 100000, net ≠ amount − fee).
- Illegal transitions (CANCELED → REQUESTED, REQUESTED → REQUESTED with an amount change) rejected by the trigger.
- DELETE rejected on all three tables; status changes can't be updated.

---

### TASK-210: `GET /me/earnings` balance

- **`apps/api/src/modules/payouts/earnings.service.ts`:** `balanceInTx(tx: Prisma.TransactionClient | PrismaService, creatorProfileId): Promise<EarningsBalanceRaw>` (bigints), running the SQL above with `$queryRaw`, plus `balance(creatorProfileId): Promise<EarningsBalance>` (mapped with `toSafeInt`, ISO date). Export the service from the module (US-063 uses it).
- **`earnings.controller.ts`:** `@Controller('me/earnings')`, `@UseGuards(ApprovedCreatorGuard)`, `@Get()` → `service.balance(req.creatorProfileId)`, header `Cache-Control: no-store`.
- **Web:** `lib/api/earnings.ts` `fetchEarnings()` → real `GET /api/v1/me/earnings`, parsed with `earningsBalanceSchema`. Remove the balance dummy. If `studio-dummy-store.ts` (US-058) still feeds the balance, change the dummy request/cancel to stop touching it; US-064 deletes the store.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/payouts/earnings.service.ts`, `earnings.controller.ts` | Balance |
| MODIFY | `apps/api/src/modules/payouts/payouts.module.ts` | Provide/export |
| CREATE | `apps/api/src/modules/payouts/earnings.integration.spec.ts` | Tests |
| MODIFY | `apps/web/src/lib/api/earnings.ts` (+ test) | Real fetch |

**Testing** (integration; insert `revenue_ledger_entries` rows directly with `accruesAt` relative to `dbNow`):
- A row at `now − 14d − 1s` is available; one at `now − 14d + 60s` is pending. Assert the exact boundary `<=`.
- A scheduled period row (`accruesAt = now + 10d`) is pending; its REVERSAL nets the pending to 0.
- PLATFORM rows are ignored.
- REQUESTED payouts reduce available into reserved; PAID_OUT goes to paid; CANCELED is ignored.
- `nextMaturityAt/Idr` sum the same Jakarta day only.
- Another creator's rows don't leak.
- Guest → 401; an unapproved user → 403 `CREATOR_NOT_APPROVED`.
