# US-056: Penghasilan Page UI

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-studio

## Description

As an approved creator, I want to see what I've earned, what is still pending and where it came from, so that I know when I can withdraw.

## Acceptance Criteria

- [ ] `/studio/earnings` (drawer "Penghasilan") shows a balance card: "Saldo tersedia" in IDR, plus "Tertunda" (with "Tersedia mulai {date}" for the next amount to mature) and "Dalam pencairan" when non-zero. The note says earnings stay pending for 14 days.
- [ ] "Ajukan pencairan" opens the US-058 sheet. It is disabled below Rp100.000 with the hint "Minimal pencairan Rp100.000." The payout account card shows the active account as "{bank} •••• {last4}" and "a.n. {holder}" with "Kelola" linking to Rekening Pencairan; with no account, it shows "Tambah rekening" and payouts are disabled.
- [ ] "Riwayat" has filter chips Semua / Langganan / Unlock / Tip. Each row shows who and what ("{nama} berlangganan", "{nama} membuka post", "{nama} mengirim tip"), date, Koin, fee ("biaya 15%/20%", "tanpa biaya"), the net "+Rp…" amount and a Tertunda/Tersedia badge. Rows load more on scroll. The footer explains the fees and 1 Koin = Rp1.000.
- [ ] A "Pencairan" section lists payout requests with amount, status (Diajukan, Dibatalkan, Dibayar) and date.
- [ ] Data comes from one swappable dummy source shaped like the US-060, US-061 and US-064 responses. Loading, empty ("Belum ada penghasilan.") and error states are covered by component tests. Amounts are integers formatted with `id-ID`.

## Tasks

### TASK-202: Earnings & payout contract + dummy data functions
**Status:** done

### TASK-203: Penghasilan page (`EarningsView`)
**Status:** done
