# QA Report: TASK-169 — Cancel scheduled renewal with full Koin return

**Result:** PASS

## Checked (financial integrity, exactly-once, isolation)

- **`WalletsService.refundSpendInTx`** is the only path that returns spent Koin. It locks the wallet, finds the original debit by its source key, appends a **compensating credit** of the full amount (the debit is never edited), restores each lot allocation to the lot it came from (no new lot, so lot tracing stays exact; the lots-≤-issued CHECK is the backstop), and moves the balance. The credit shares the debit's source with another entry type, so the ledger's unique source key makes a second refund impossible in the database as well (tested directly).
- **`SubscriptionPeriodsService.cancelScheduled`**, one transaction: wallet lock (the same first lock as subscribe, so cancel and subscribe for one user serialise) → the period row `FOR UPDATE` filtered by the session's user (someone else's or unknown id is 404) → already cancelled: answer the same result with no second credit → server clock (`dbNow`) before `starts_at`, else `RENEWAL_ALREADY_STARTED` (an active, started or ended period is rejected) → set `canceled_at` (the only edit the trigger allows) → refund → mirror REVERSAL revenue rows. The clock comparison is the single answer at the boundary: either cancelled-and-refunded or started, never both.
- **Exactly once:** 10 simultaneous cancels → 10× 200 with the same `{ refundedCoins: 75, balanceCoins: 425 }`, one credit entry; a later repeat is the same.
- **Revenue:** creator and platform rows net to 0 for the source (−Rp63.750 / −Rp11.250 reversals).
- **Active period untouched**, the viewer's `scheduled` becomes null, and a new renewal can be prepaid afterwards (the partial unique index ignores cancelled rows) at the same start.
- **Wallet activity:** the credit shows "Perpanjangan dibatalkan · {creator}" with a link, next to the original debit.
- **Auth:** guest 401, cross-origin 403 (global CSRF guard), another user's id 404, malformed id 404. Rate limited like the other spends (20/min, TBD).
- **Web:** `cancelScheduledRenewal` is a real POST with no body and no JSON content type (the API rejects a JSON content type without a body); the sheet asks inline before cancelling, then toasts "N Koin dikembalikan"; `RENEWAL_ALREADY_STARTED` is shown and the sheet stays open.

## Tests

`cancel-scheduled.integration.spec.ts` (7 tests: full cancel with exact lot restoration and revenue net 0; 10-way race and repeat; started/ended rejected; 404/401/403 matrix; re-prepay after cancel; DB-level single refund; wallet activity). Web: `profile-actions.test.tsx` (cancel success, already started, back out), `purchases.test.ts`, `wallet-activity.test.tsx`. `pnpm check` green: shared 249, API 961, web 673.

## Notes

- Only the cancel-before-start refund exists (LOCKED). Other Controlled Refund cases come with admin and finance operations.
- A boundary hit at the exact millisecond cannot be forced in a test; the rule is a single `now >= starts_at` comparison under the wallet and period locks.
