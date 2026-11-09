# QA Report: TASK-209 — Payouts data model (accounts, payouts, status history)

**Result:** PASS (2026-11-09)

## Checked
- Migration `20261109055047_creator_payouts`: enum `payout_status`; tables `creator_payout_accounts`, `creator_payouts`, `creator_payout_status_changes` (uuidv7 ids, `TIMESTAMPTZ(3)`, snake_case, BIGINT money — the schema-conventions spec passes); FKs all `ON DELETE RESTRICT`.
- Accounts: partial UNIQUE index `creator_payout_accounts_one_active` (one active, non-deleted account per creator; also per creator, not global), CHECKs on `last4` (4 digits), holder length (1–100) and `NOT (active AND deleted_at IS NOT NULL)`; a guard trigger lets only `active` and `deleted_at` change, keeps a deleted account deleted, and refuses DELETE (payouts reference the account).
- Payouts: CHECKs `amount_idr >= 100000` (LOCKED minimum; exactly Rp100.000 passes, Rp99.999 fails), `fee_idr >= 0`, `net_idr = amount_idr - fee_idr AND net_idr > 0`, `account_last4` format; amounts above 32 bits round-trip. The guard trigger allows only REQUESTED → a final status (status and updated_at only): final statuses cannot change, REQUESTED → REQUESTED is refused, no change to amount / fee / net / destination alone or together with a status change, no DELETE.
- Status changes: append-only trigger (UPDATE and DELETE refused); FK to a missing payout account refused.
- 26 schema tests pass; `PayoutsModule` registered in `AppModule`.

## Notes
- The spec cleans up with `ALTER TABLE … DISABLE TRIGGER USER` inside try/finally, because append-only tables cannot be emptied otherwise. Only these three new tables are touched, and no other spec uses them.
- The new specs use unique fixed-id prefixes (`0000003a`, `0000003b`) and `LEFTOVER_CREATED_AT` for creators (see TASK-210 notes).
