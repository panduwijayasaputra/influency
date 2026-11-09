# US-057: Rekening Pencairan Page UI

**Status:** ready_for_uat
**Priority:** medium
**Feature:** creator-studio

## Description

As an approved creator, I want to manage the bank accounts my payouts go to, so that money reaches the right account.

## Acceptance Criteria

- [ ] `/studio/payout-accounts` (from Penghasilan "Kelola" and from Pengaturan) lists up to 3 accounts as "{bank} •••• {last4}", "a.n. {holder}", with a `n / 3` counter. The active account is highlighted with an "Aktif" badge. The back link returns to where I came from.
- [ ] "Jadikan aktif" on an inactive account makes it the only active one (toast "{bank} sekarang rekening pencairan aktif"). The active account has no delete action and shows why: "Rekening satu-satunya · tambah rekening lain sebelum menghapus." or "Rekening aktif · jadikan rekening lain aktif untuk menghapus ini."
- [ ] Deleting an inactive account asks for inline confirmation first (toast "Rekening dihapus").
- [ ] "Tambah rekening" (hidden at 3) opens a form: bank (from the configured list), account number (digits only, 6–20, spaces ignored), holder name (required, prefilled with my name), "Jadikan aktif" checkbox. The first account is always active. Invalid fields show inline errors.
- [ ] Data comes from a swappable dummy source shaped like the US-062 API. The full account number is never shown after saving. Component tests cover the limits, active rules, delete confirmation and validation.

## Tasks

### TASK-204: Payout account contract + dummy client
**Status:** done

### TASK-205: Rekening Pencairan page
**Status:** done
