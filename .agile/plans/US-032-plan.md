# Technical Plan: US-032 — Reconcile Pending Top-Ups

## Architecture Overview

`TopupReconciler` in `apps/api/src/modules/topups/` copies the `MediaSweeper` pattern (in-process `setInterval`, `unref`, overlapping ticks skipped, `TOPUP_RECONCILE_INTERVAL_SECONDS`, 0 = off; tests use 0 and call `run()` directly). It calls `TopupsService.reconcileDue(now)`.

`reconcileOne(order)` asks the gateway for the status and feeds a verified result into the **same** `applyProviderStatus(n, 'STATUS_CHECK')` from US-031, so a status check racing a notification still credits once (order row lock + ledger unique source key).

Per order:
- gateway returns a notification → verify signature (status responses carry `signature_key`); invalid → quarantine (`STATUS_SIGNATURE_INVALID`) and stop checking. Valid → store a `payment_webhook_events` row with `provider = 'midtrans_status'` (same fingerprint dedupe) and apply it.
- gateway returns `null` (not found: the user hasn't chosen a payment method yet) → stays PENDING.
- gateway throws → unchanged, warning log with order number only.
- After every check: `checkAttempts += 1`, `lastCheckedAt = now`, `nextCheckAt = now + min(30 s × 2^attempts, 30 min)`.
- **Expiry:** an order still `CREATED`/`PENDING` after the check whose `expiresAt + 10 min` grace (or `createdAt + TOPUP_EXPIRY_MINUTES + 10 min` for `CREATED` orders that never got a checkout) has passed → `EXPIRED` (`failureReason = 'NOT_PAID_IN_TIME'`), via a conditional `updateMany({ where: { id, status: { in: ['CREATED','PENDING'] } } })` inside a transaction that locks the order first, so it cannot overwrite a concurrent credit. A late `settlement` after that is quarantined by the US-031 rules.

**On demand:** `getForOwner` (TASK-153) calls `reconcileOne` before answering when the order is `PENDING`, not quarantined, and `lastCheckedAt` is null or older than 10 s, bounded by a 5 s timeout (on timeout answer with current state). This is what makes local Sandbox testing work without a tunnel.

Admin "reconcile this order" is out of scope (admin/finance operations).

## Dependencies

None new (status API method already in `MidtransSnapGateway`, TASK-152).

## Risks

- **Multiple API instances** each run the reconciler: safe, because every write goes through the locked, idempotent path; it only costs extra status calls. Same `shortcut:` note as `MediaSweeper` (move to a BullMQ repeatable job with the worker).
- **Midtrans rate limits:** batch of 50 due orders per tick, sequential, ordered by `nextCheckAt`.

## Tasks

### TASK-157: Top-up reconciler and on-demand status check

**Env** (`env.ts` + spec): `TOPUP_RECONCILE_INTERVAL_SECONDS` int 0–3600, default 60 (0 = off).

**`TopupsService`:**
- `reconcileDue(now = new Date()): Promise<number>` — `findMany({ where: { status: { in: ['CREATED','PENDING'] }, quarantinedAt: null, OR: [{ nextCheckAt: { lte: now } }, { nextCheckAt: null }] }, orderBy: { nextCheckAt: 'asc' }, take: 50 })`, then `reconcileOne` each (errors caught per order).
- `reconcileOne(order, now)` — as in the overview. `CREATED` orders (no checkout) skip the gateway call and only go through the expiry rule.
- `getForOwner` — on-demand check described above (`Promise.race` with a 5 s timer).

**`apps/api/src/modules/topups/topup-reconciler.ts`** — copy of `MediaSweeper` structure calling `reconcileDue()`; registered as a provider in `TopupsModule`; `// shortcut: in-process timer on every API instance (idempotent); move to a BullMQ repeatable job with the worker.`

**Codebase map:** add the job row to "Background Jobs" (done by `/dev-team` at story completion; mention it in the QA notes).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/common/env.ts` (+ spec), `.env.example` | Interval |
| MODIFY | `apps/api/src/modules/topups/topups.service.ts` | `reconcileDue`, `reconcileOne`, on-demand check |
| CREATE | `apps/api/src/modules/topups/topup-reconciler.ts` (+ `.spec.ts`) | Timer |
| MODIFY | `apps/api/src/modules/topups/topups.module.ts` | Provider |
| CREATE | `apps/api/src/modules/topups/reconcile.integration.spec.ts` | Tests |
| MODIFY | `docs/payments.md` | How credit arrives without a tunnel |

**Testing (real DB, fake gateway `setStatus`, injected `now`):**
- late success: order PENDING, fake status `settlement` → `reconcileDue` credits once; a second run is a no-op.
- reconcile + notification race: run `reconcileOne` and the webhook handler concurrently with `settlement` → one credit, one ledger entry.
- not found (`null`) → stays PENDING, `checkAttempts` 1, `nextCheckAt` ≈ now + 60 s; backoff grows and caps at 30 min.
- expiry: not found / `pending` past `expiresAt + 10 min` → EXPIRED, no credit; `CREATED` order older than expiry + grace → EXPIRED without a gateway call.
- gateway error → order unchanged except attempt/backoff fields.
- invalid signature in the status response → quarantined, excluded from later runs.
- mismatched amount in the status response → quarantined, no credit.
- on demand: `GET /wallet/topups/:id` for a PENDING order whose fake status is `settlement` → response `CREDITED` with `balanceCoins`; a second GET within 10 s makes no gateway call (spy).
- reconciler timer: interval 0 → no timer; overlapping `run()` skipped (unit test like `media-sweeper.spec.ts`).
