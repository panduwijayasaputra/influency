# US-058: Ajukan Pencairan Sheet UI

**Status:** ready_for_uat
**Priority:** medium
**Feature:** creator-studio

## Description

As an approved creator, I want to request a payout and see the fee and what I'll actually receive before I confirm, so that there are no surprises.

## Acceptance Criteria

- [ ] "Ajukan pencairan" opens a bottom sheet with the amount (whole rupiah, default: all available, "Semua" shortcut), the destination account "{bank} •••• {last4}", the transfer fee, and "Kamu terima" (amount − fee).
- [ ] Amounts below Rp100.000, above the available balance, or whose net would be ≤ 0 block confirmation with an inline reason.
- [ ] The transfer fee comes from the quote (US-063) and is labelled "Perlu konfirmasi" while its value is a placeholder. The sheet states "Diproses manual setiap Jumat hari kerja. Waktu masuk ke rekening tidak dijamin."
- [ ] Confirm sends one request with an `Idempotency-Key` reused on retry; the button is disabled while pending. Success closes the sheet, shows the toast "Pencairan diajukan", and the balance and payout list refresh. A conflict (balance changed) shows the error and refreshes the quote.
- [ ] A requested payout in the list can be cancelled after confirmation ("Batalkan pencairan?"). Uses the dummy source until US-063/US-064. Component tests cover validation, fee display, double-submit prevention and cancel.

## Tasks

### TASK-206: Payout request sheet + cancel
**Status:** done
