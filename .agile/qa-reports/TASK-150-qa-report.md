# QA Report: TASK-150 — WalletsService ledger core and read API

**Result: PASS**

- `WalletsService.creditInTx(tx, …)` is the single credit path: `INSERT … ON CONFLICT DO NOTHING` for the wallet, `SELECT … FOR UPDATE`, ledger entry with `balance_after`, lot, balance update, all on the caller's transaction. Lock order documented (caller's row first, then wallet). Non-positive credit throws before touching the DB. BigInt → number only via `toSafeInt` (throws above 2^53−1).
- Endpoints: `GET /wallet`, `GET /wallet/transactions` (SessionGuard, `no-store`, user from the session only), `GET /wallet/packages` (public, `max-age=60`). Keyset cursor `<ms>_<id>` validated by a Zod pipe (bad cursor → 400).
- Financial review: no code path writes `balance_coins` outside `creditInTx`; ledger rows are never updated; a duplicate source aborts the whole transaction (balance, entry and lot all roll back — tested).
- Concurrency: 10 parallel credits to a brand-new wallet → balance 100, 10 entries, exactly one wallet row; `balance == SUM(ledger)` checked after each scenario.
- Isolation: guests 401; another user's wallet reads 0 / empty.
- Tests: 8 integration + 2 unit; api typecheck and lint clean.
