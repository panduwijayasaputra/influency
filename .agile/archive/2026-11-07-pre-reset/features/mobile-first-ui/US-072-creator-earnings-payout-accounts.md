# US-072: Creator Earnings & Payout Accounts

**Status:** backlog
**Priority:** low
**Feature:** mobile-first-ui

## Description

As a creator, I want to see my earnings and manage where payouts go, so that I understand what I've earned and get paid to the right account.

## Acceptance Criteria

- [ ] **Penghasilan** (`/studio/earnings`, creator only) shows:
  - an available balance
  - a "Setelah potongan platform" note with the last payout
  - a **Ajukan pencairan** button
  - the active payout account with a Kelola link
  - a history of subscriptions, unlocks and tips, showing amounts after fees
  - a note on fees: 15% subscriptions, 20% unlocks, 0% tips, 1 Koin = Rp1.000
- [ ] **Rekening Pencairan** (`/studio/payouts`):
  - It lists bank accounts, at most 3.
  - Exactly one is **Aktif**. "Jadikan aktif" switches it.
  - The active account cannot be deleted. Deleting another account asks for confirmation.
  - At 3 accounts, "Tambah rekening" is disabled with a hint.
- [ ] The add-account form has a bank list, a 6–20 digit account number and the holder name, all validated, plus a "Jadikan rekening aktif" option.
- [ ] Earnings, accounts and Ajukan pencairan are dummy until US-037 and US-038 exist. Pencairan ends in a Demo message. Payout flow, fees and account verification are labelled "Perlu konfirmasi".
