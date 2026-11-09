# Technical Plan: US-064 — Payout History & Cancel Request

## Architecture Overview

Two endpoints on `PayoutsController` (TASK-214/215):

- **`GET /me/payouts?cursor=`:** the caller's payouts newest first, keyset `(created_at, id)` with the same cursor codec as the earnings activity (TASK-211), page size 20, `no-store`, mapped with `toPayout`.
- **`POST /me/payouts/:id/cancel`:** no body. One transaction:
  1. Creator-row `FOR UPDATE` (the same lock as a request, so cancel and request serialize).
  2. `SELECT … FROM creator_payouts WHERE id = $id AND creator_profile_id = $creatorProfileId FOR UPDATE`. Missing or foreign → 404 `NOT_FOUND`.
  3. `status !== 'REQUESTED'` → 409 `PAYOUT_NOT_CANCELABLE`.
  4. `UPDATE creator_payouts SET status = 'CANCELED' WHERE id = $id AND status = 'REQUESTED'`. Assert 1 row (defence in depth; the TASK-209 trigger also allows only REQUESTED → CANCELED).
  5. Insert a `creator_payout_status_changes` row (REQUESTED → CANCELED, actor = session user).
  6. Return 200 `Payout`.
- **The reservation is released implicitly:** a CANCELED payout no longer counts as reserved in `balanceInTx`. It can't be released twice, because the second cancel sees CANCELED → 409.
- Rate limit cancel with `PAYOUT_RATE_LIMIT`.

## Dependencies

- TASK-209 tables/trigger, TASK-210 balance, TASK-211 cursor codec, TASK-215 `toPayout`, error `PAYOUT_NOT_CANCELABLE` (TASK-206).

## Risks

- **None new beyond the concurrency of a double cancel**, covered by the row lock and the conditional update.

## Tasks

### TASK-216: Payout list + cancel endpoints, remove the studio dummies

- **`PayoutsService.list(creatorProfileId, cursor?)` and `cancel(userId, creatorProfileId, payoutId)`** as above.
- **Controller:**
  - `@Get()` with `@Query(new ZodValidationPipe(z.object({ cursor: z.string().optional() })))` (put the schema in shared `payouts.ts` as `payoutListQuerySchema`).
  - `@Post(':id/cancel')`: a malformed uuid → 404.
- **Web:** `fetchPayouts(cursor?)` and `cancelPayout(id)` in `lib/api/payouts.ts` → real calls. Delete `lib/api/studio-dummy-store.ts` and every remaining `// dummy until US-0xx` body in `earnings.ts` / `payouts.ts` / `payout-accounts.ts` (grep for `dummy until US-06`). Update their tests to mock `fetch`. After this task no creator-studio dummies are left.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/payouts.ts` | `payoutListQuerySchema` |
| MODIFY | `apps/api/src/modules/payouts/payouts.service.ts`, `payouts.controller.ts` | List + cancel |
| CREATE | `apps/api/src/modules/payouts/payout-cancel.integration.spec.ts` | Tests |
| MODIFY | `apps/web/src/lib/api/payouts.ts`, `earnings.ts` (+ tests) | Real calls |
| DELETE | `apps/web/src/lib/api/studio-dummy-store.ts` | No dummies left |

**Testing** (integration):
- The list shows only own payouts, newest first; pages of 20 have no gaps (25 rows); a bad cursor → 400.
- Cancel REQUESTED → 200 CANCELED; available returns to its previous value; a status-change row is written.
- A second cancel → 409 `PAYOUT_NOT_CANCELABLE`.
- 5 concurrent cancels → exactly one 200 and one status-change row.
- A cancel racing a new request for the full available amount → the final state is consistent (reserved ≤ matured).
- A payout set to PAID_OUT/REJECTED directly in SQL (simulating admin) → cancel 409.
- Another creator's payout → 404; guest 401; non-creator 403.
