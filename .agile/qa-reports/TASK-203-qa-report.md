# QA Report: TASK-203 — Penghasilan page (`EarningsView`)

**Result:** PASS (2026-11-09)

## Checked
- Balance card: Saldo tersedia, Tertunda with "Tersedia mulai {date}" (Asia/Jakarta), "Dalam pencairan" only when > 0, the 14-day note built from the shared constant.
- Ajukan pencairan: enabled at exactly Rp100.000, disabled at Rp99.999 with "Minimal pencairan Rp100.000.", disabled without an active account with "Tambahkan rekening pencairan dulu." and a "Tambah rekening" link. Balance error has a working retry.
- Rekening card shows only `bank •••• last4` and the holder; Kelola links to `/studio/payout-accounts?from=earnings`.
- Riwayat: chips Semua / Langganan / Unlock / Tip reload by type (`aria-pressed`); rows show who/what, date, Koin, fee or "tanpa biaya", net amount with sign, Tertunda / Tersedia badge; reversal is negative; infinite scroll through `usePagedList`; empty ("Belum ada penghasilan.") and error-with-retry states.
- Pencairan list with status labels (Diajukan, Dibatalkan, Ditolak, Dibayar) and empty state; fee footer.
- Web typecheck, lint, Prettier pass; web tests 110 files / 818 tests pass.

## Notes
- "Ajukan pencairan" shows the toast "Segera hadir" until US-058 adds the sheet (planned in TASK-206).
- Fixed during QA: wrong Koin token names (`koin-surface` / `koin-foreground` are the real ones); destructured `usePagedList` to satisfy `react-hooks/refs`.
