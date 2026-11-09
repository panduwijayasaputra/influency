# QA Report: TASK-214 — Transfer fee config + quote endpoint

**Result:** PASS (2026-11-09)

## Checked
- Config: `PAYOUT_TRANSFER_FEE_IDR` (whole rupiah, default 2.500, an EXAMPLE value) is validated to stay below the Rp100.000 minimum, so any valid request leaves a positive net; `PAYOUT_TRANSFER_FEE_CONFIRMED` (default false) drives the "Perlu konfirmasi" label. Rejected: 100.000, 150.000, negative, fractional, non-numeric, and a confirmed flag other than true/false. In `.env.example`; 87 env tests pass.
- `GET /api/v1/me/payouts/quote?amountIdr=` (approved creator, `no-store`, 30/min [TBD]): fee from config, net = amount − fee, masked destination (bank, last 4, holder), `availableIdr`. The fee is never taken from the client (`?feeIdr=0` is ignored). Exactly the available amount quotes; one rupiah more → 409 `PAYOUT_EXCEEDS_AVAILABLE` with `details.availableIdr`; no active account (none, or only inactive) → 409 `PAYOUT_ACCOUNT_REQUIRED`; pending earnings are not available; an earlier REQUESTED payout is subtracted; another creator's balance never counts. A quote reserves and writes nothing.
- Validation → 400 `VALIDATION_FAILED`: below Rp100.000 (99.999), fractional, not a number, missing, empty, negative. Guest 401; non-creator 403 `CREATOR_NOT_APPROVED`.
- Web: `quotePayout` is the real call. 17 quote tests pass.
