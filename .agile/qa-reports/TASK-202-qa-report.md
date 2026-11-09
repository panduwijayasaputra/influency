# QA Report: TASK-202 — Earnings & payout contract + dummy data functions

**Result:** PASS (2026-11-09)

## Checked
- `packages/shared/src/payouts.ts`: LOCKED constants (`EARNINGS_PENDING_DAYS` 14, `PAYOUT_MIN_IDR` 100.000), balance / activity / payout schemas. All money is `z.int()`; `last4` must be exactly 4 digits so a full account number cannot pass the contract; reversals are negative; fee 0–10.000 bps.
- Shared tests (13 files / 278 tests) and the dummy-data tests pass: the dummies parse with the shared schemas, page 5 at a time without gaps or repeats (newest first), filter by type, apply 20% / 15% / 0% fees in whole rupiah, show a reversal as negative, and mark status by the 14-day rule.
- Each dummy body is marked `dummy until US-060 / US-061 / US-064 / US-062`.
- No financial logic is decided on the client; the dummies only feed the display.
