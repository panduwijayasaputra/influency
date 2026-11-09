# QA Report: TASK-146 — Dompet page and drawer Koin card

**Result: PASS**

- `/wallet` renders `PageHeader` + `WalletView` (login-only via the proxy default). Saldo Koin card, Beli Koin tile group (`aria-pressed`, 25 Koin preselected, button label follows the selection), "Perlu konfirmasi" policy note, Aktivitas list (Asia/Jakarta dates, signed amounts), pending top-up rows linking to `/wallet/topups/{id}`.
- States: skeleton, "Gagal memuat dompet." + Coba lagi, "Belum ada aktivitas.", "Muat lagi" with inline retry that keeps loaded rows. Pending top-ups failing never blocks the page.
- Drawer reads the balance through `useWalletBalance(open)` ("—" while unknown/failed); the hard-coded "Demo" badge is gone. `DEMO_KOIN_BALANCE` remains only for the purchase sheet (removed in TASK-151).
- React Compiler lint caught a `useCallback` dependency mismatch; removed the memoization.
- Note for devs: a `beforeEach(() => mock.mockResolvedValue(...))` arrow returns the mock, which Vitest calls as teardown — use braces.
- Web suite 593/593, typecheck, lint, prettier clean. "Beli" is a "Segera hadir" toast until TASK-147.
