# QA Report: TASK-206 — Payout request sheet + cancel

**Result:** PASS (2026-11-09)

## Checked
- Shared: `payoutQuoteQuerySchema` (coerced integer, min Rp100.000), `payoutQuoteSchema`, `createPayoutSchema` (strict `{ amountIdr, expectedFeeIdr }`), error codes `PAYOUT_EXCEEDS_AVAILABLE`, `PAYOUT_FEE_CHANGED`, `PAYOUT_ACCOUNT_REQUIRED`, `PAYOUT_NOT_CANCELABLE` with Bahasa messages. Shared tests: 13 files / 299 tests pass.
- Sheet: starts with the whole balance; "Semua"; digits-only input (a pasted "Rp 120.000" becomes 120000); blocks below Rp100.000 (accepts exactly Rp100.000), above the balance, empty, and a net ≤ 0, without asking for a quote; shows the quoted fee with the "Perlu konfirmasi" pill while it is a placeholder, "Kamu terima", the masked destination and the Friday/no-guarantee note.
- Request: sends the amount and the fee that was shown; a double click sends one request; a retry after a failure reuses the same Idempotency-Key; changing the amount starts a new key; `PAYOUT_FEE_CHANGED` / `PAYOUT_EXCEEDS_AVAILABLE` show the message, refetch the quote, refresh the balance and start a new attempt. Success toasts "Pencairan diajukan", closes and refreshes.
- Dummy rules (same as the API will have): reservation lowers available and raises reserved at once; same key + same payload → same payout, reserved once; same key + different payload → DUPLICATE_REQUEST; wrong fee → PAYOUT_FEE_CHANGED; exactly-available passes, +1 rupiah is refused; cancel returns the amount once, a paid or unknown payout cannot be cancelled; the payout snapshots its destination.
- Penghasilan: the sheet opens from the button; Batalkan on a REQUESTED row asks first ("Batalkan pencairan?", "Saldo Rp150.000 kembali tersedia."); Tidak keeps it; Ya, batalkan cancels, toasts and reloads balance and list; an API refusal shows its message and still reloads; no cancel on a paid payout.
- Web typecheck, lint, Prettier pass; web tests 115 files / 877 tests pass.

## Notes
- No real money moves anywhere: all payout data is an in-memory dummy (`lib/api/studio-dummy-store.ts`, removed in US-064) until US-063 / US-064.
- Test fixes during QA: the double-click test held a stale button label; two async arrows without await.
