# QA Report: TASK-164 — Spend core: debit with FIFO lot allocation and revenue ledger

**Result:** PASS

## Checked (financial integrity)

- **`WalletsService.debitInTx`** is the only code that removes Koin. In the caller's transaction it locks the wallet (`FOR UPDATE`), rejects a balance that is too low with `INSUFFICIENT_COINS { required, available }` before writing anything, appends a negative ledger entry (`balance_after_coins` set), consumes lots oldest first (`ORDER BY created_at, id FOR UPDATE`), records a `coin_spend_allocations` row per lot, and moves the cached balance. Integers only (BigInt end to end). The lock order (idempotency key → business row → wallet → lots) is documented on the method. `creditInTx` was refactored onto the shared `lockWalletInTx` with no behaviour change (existing wallet specs still pass).
- **A lots/balance mismatch** throws a plain `Error` (500, rolled back), never silently corrected.
- **Revenue ledger:** `RevenueLedgerService.postSaleInTx` writes a CREATOR row and, only when the fee is above 0, a PLATFORM row; `reverseSaleInTx` writes mirror REVERSAL rows once. Split arithmetic is `splitRevenue` (half-up, creator + platform = gross for every Koin amount 1..5,000 and every LOCKED fee). `FEE_BPS` holds the LOCKED values (2,000 / 1,500 / 0).
- **Database backstops:** `coin_spend_allocations` (coins > 0, `UNIQUE (ledger_entry_id, lot_id)`, append-only trigger) and `revenue_ledger_entries` (SALE > 0 / REVERSAL < 0, fee 0–10,000, gross > 0, `UNIQUE (source_type, source_id, account, kind)`, append-only trigger). No float/numeric columns (the schema-conventions spec passes).
- Top-ups never post revenue (nothing in the top-up path was touched).

## Tests

- Unit: `allocate-fifo.spec.ts`, `split-revenue.spec.ts` (spec examples 25 Koin → Rp20.000/Rp5.000, 75 Koin @1,500 bps → Rp63.750/Rp11.250, tip 0%, 1..5,000 × 3 fees sums, rounding).
- Real Postgres: `debit.integration.spec.ts` (two-lot debit, insufficient balance writes nothing, no wallet row, same source debits once, **10 simultaneous debits of 10 against 50 → exactly 5 succeed, ledger == balance == lots**, append-only), `revenue-ledger.integration.spec.ts` (split, no PLATFORM row at 0%, one sale per source, reversal nets to 0 and only once, DB sign and fee rules, append-only).
- `pnpm check` green.
