# QA Report: TASK-155 — Webhook event store, status mapping and creditOnce

**Result: PASS**

- Migration `payment_webhook_events` (UNIQUE fingerprint, index on order number). `storeEvent` uses `INSERT … ON CONFLICT (fingerprint) DO UPDATE` (atomic, no check-then-insert race); the signature is left out of the fingerprint so a forged copy cannot mask the real delivery.
- Status mapping follows the live Midtrans docs: `settlement` (non-card) and `capture`+`fraud_status accept` (card) are paid, both only with `status_code` "200"; `challenge` stays pending; `deny`/`failure` fail; `expire`, `cancel`; refund/chargeback and unknown statuses go to review. (Plan deviation: a bare `capture` without a fraud verdict no longer credits.) Gross amount must be whole rupiah ("10000.00" or "10000").
- `applyProviderStatus` = creditOnce: one transaction, order row `FOR UPDATE` first, wallet second (inside `creditInTx`). Credit, lot, balance and `CREDITED` + `paid_at`/`credited_at`/provider ref commit together; the ledger's unique source key is the last line of defence.
- Verified: 10 concurrent settlements → 1 `CREDITED` + 9 `ALREADY_CREDITED`, one ledger entry, one lot; capture→settlement credits once; terminal orders never move backwards; settlement after expiry is quarantined (`PAID_AFTER_TERMINAL`); wrong amount (also `.50`), currency, merchant and a reused provider transaction id are quarantined with no credit; a quarantined order is never auto-credited by a later correct message; refund on a credited order is quarantined, a later `deny` only logs (balance untouched).
- Tests: 46 unit (mapping table, amounts, GMT+7 times, fingerprint) + 13 integration; typecheck and lint clean.
- Known limit: a credited order later reported as failed (the documented VA reversal) is logged, not reversed; reversals belong to the admin/finance refund work.
