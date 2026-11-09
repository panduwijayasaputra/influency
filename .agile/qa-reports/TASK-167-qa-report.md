# QA Report: TASK-167 — Subscription periods schema and subscribe endpoint

**Result:** PASS

## Checked (financial integrity, concurrency)

- **Model:** `subscription_periods` snapshots the plan version (`plan_id`), price, `fee_bps` and duration. State is derived from timestamps and server time; there is no status column. The DB enforces the LOCKED rules: price 10–5,000, fee 1,500 bps, 30 days, `ends_at = starts_at + 720 hours`; a partial unique index allows one live period per (user, creator, start); a trigger rejects DELETE and any UPDATE except `canceled_at` going from NULL to a time (once).
- **Subscribe (`POST /creators/:slug/subscribe`):** one transaction in this order: Idempotency-Key claim → creator (public, not the caller) → shared lock on the creator row (a plan edit waits) → active plan and price check (`PLAN_NOT_AVAILABLE`, `OFFER_CHANGED { priceCoins }`) → wallet lock → live periods read → decision → debit with FIFO lots → period → revenue rows → key completed. The price comes from the DB plan.
- **Period rules:** no live period → starts at server time; an active period and no scheduled one → the new period starts exactly at its `ends_at` (no overlap, no gap); a scheduled period already exists → `RENEWAL_ALREADY_SCHEDULED` with no debit. Nothing renews or debits automatically.
- **Revenue:** 85/15 split (75 Koin → creator Rp63.750, platform Rp11.250). A prepaid period's `accrues_at` is its own `starts_at`, so the 14-day clock starts at the period start, not at the purchase (spec §5).
- **Race:** 5 simultaneous requests from one user → exactly 2 periods (one active, one scheduled) and 3× `RENEWAL_ALREADY_SCHEDULED`, 2 debits, balance 850 of 1,000.
- **Bug found and fixed during QA:** reading `clock_timestamp()` through a raw query returned a time shifted by +7 hours (the DB session is on Asia/Jakarta and the driver adapter drops the offset). `dbNow` now reads epoch milliseconds, which cannot be misread, and has its own spec. Model-mapped `Timestamptz` columns are not affected.
- **Viewer state:** `GET /creators/:slug/subscription` now returns the viewer's `current` and `scheduled` periods (by server time); other users and other creators see nothing of them.

## Tests

`subscribe.integration.spec.ts` (first subscribe with ledger and revenue rows; early renewal; third renewal rejected; 5-way race; new period after expiry; plan price change keeps the bought price and asks again on a stale price; replay and payload mismatch; no plan / inactive / pending / suspended / unknown creator; own profile, low balance, guest, missing key, bad body, cross-origin; isolation; DB CHECKs, duplicate start, trigger rules), `db-time.integration.spec.ts`. `pnpm check` green.
