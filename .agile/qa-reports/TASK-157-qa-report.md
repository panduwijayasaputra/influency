# QA Report: TASK-157 — Top-up reconciler and on-demand status check

**Result: PASS**

- `TopupReconcileService.reconcileDue/reconcileOne` ask the gateway about PENDING orders (CREATED orders never got a checkout, so they only go through expiry), verify the answer's signature, store it (`midtrans_status` event) and feed it to the same `applyProviderStatus` as notifications. `reconcileOne` never throws.
- Backoff 30 s, 60 s, 2 min … capped at 30 min. Expiry = `expires_at` (or created + `TOPUP_EXPIRY_MINUTES`) + 10 min grace, applied in a transaction that locks the order row first and re-reads its status, so it cannot overwrite a concurrent credit. A late payment after expiry is quarantined (tested).
- Verified: late success credited once and a second run is a no-op; a status check racing duplicate notifications (4 concurrent calls) → one credit, one ledger entry; "not found" stays PENDING with `check_attempts` and a 60 s then 120 s `next_check_at`; Midtrans error leaves the order unchanged except backoff; bad status signature → quarantined `STATUS_SIGNATURE_INVALID` and no longer polled; wrong amount → quarantined.
- On demand: `GET /wallet/topups/:id` on a PENDING order checks Midtrans (max once per 10 s, 5 s cap) and returns CREDITED with the new balance, so local Sandbox testing works without a tunnel; another user's order triggers no provider call.
- `TopupReconciler` timer mirrors `MediaSweeper` (interval 0 = off, overlapping ticks skipped, survives failures); `TOPUP_RECONCILE_INTERVAL_SECONDS` default 60, pinned to 0 in tests.
- Isolation fix found by the full run: the top-up spec's inactive `coins: 7` package made the wallet seed test see 6 rows; the seed test now looks only at the seeded ids.
- Full `pnpm check` green twice: shared 239, web 613, api 870 tests; format, lint, typecheck clean.
