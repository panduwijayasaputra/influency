# QA Report: TASK-204 — Payout account contract + dummy client

**Result:** PASS (2026-11-09)

## Checked
- `packages/shared/src/payouts.ts`: `PAYOUT_ACCOUNT_MAX` 3, example `PAYOUT_BANKS` (labelled OPEN / "Perlu konfirmasi"), `payoutAccountInputSchema` (strict; spaces stripped; 6–20 digits; holder trimmed 1–100; unknown bank or key rejected), `payoutAccountSchema` (only bank, `last4` of exactly 4 digits, holder, active, createdAt). Error codes `PAYOUT_ACCOUNT_LIMIT` and `PAYOUT_ACCOUNT_ACTIVE` added with Bahasa messages. Shared tests: 13 files / 292 tests pass.
- Dummy client mirrors the rules US-062 will enforce (max 3, first account active, activating moves the single active flag, the active one cannot be deleted, unknown id → NOT_FOUND) and keeps only the last 4 digits. Its tests assert the output parses with the shared list schema and never contains a full number or an `accountNumber` key.
- `PayoutAccountSummary` (TASK-202 stub type) replaced by the shared `PayoutAccount`; the earnings page test updated.

## Fixed during QA
- My first masking assertion matched digits inside UUIDs and timestamps; it now checks whole field values and the absence of an `accountNumber` key.
