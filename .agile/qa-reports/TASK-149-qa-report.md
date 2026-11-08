# QA Report: TASK-149 — Wallet schema, migration and package seed

**Result: PASS**

- Migration `20261107154117_koin_wallet`: `coin_packages`, `coin_wallets` (UNIQUE user), `coin_ledger_entries` (UNIQUE `(source_type, source_id, entry_type)`, keyset index), `coin_lots` (UNIQUE `(source_type, source_id)`), enums, FKs RESTRICT, BIGINT Koin, no float/numeric columns (conventions spec green).
- CHECKs: balance ≥ 0, ledger amount ≠ 0 and `balance_after` ≥ 0, lot issued > 0 / 0 ≤ unspent ≤ issued / basis ≥ 0, package coins and price > 0.
- Append-only trigger rejects UPDATE and DELETE on `coin_ledger_entries`. Consequence for tests: ledger rows and their users are never deleted, so wallet specs create fresh users per test (the test DB is dropped each run).
- Seed: the five LOCKED packages (10/25/50/100/250 at Rp1.000 per Koin, no bonus), idempotent upsert by fixed id; re-seeding does not flip `active`.
- Tests: 6 new (seed, CHECKs, duplicate source, append-only update+delete, lot range + single source, one wallet per user); api typecheck and lint clean.
