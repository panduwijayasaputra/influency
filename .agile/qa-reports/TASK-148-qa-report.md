# QA Report: TASK-148 — Top-up status page

**Result: PASS**

- Route `/wallet/topups/[orderId]` (`PageHeader` "Status Isi Ulang", fallback `/wallet`, login-only by the proxy default); `params` read inside a Suspense child per Next 16 `cacheComponents`.
- `TopupStatus` polls `fetchTopup` every 3 s (10 s after 1 min, "Muat ulang" after 15 min), pauses while the tab is hidden, stops on any terminal status, UNDER_REVIEW or not-found, keeps the last state with "Gagal memperbarui. Mencoba lagi…" on errors. States: Menunggu pembayaran (+ Lanjutkan pembayaran), Berhasil (+Koin, new balance), Pembayaran gagal/kedaluwarsa/dibatalkan (Beli Koin lagi), ditinjau, not found.
- A `?transaction_status=settlement` query string has no effect (tested). `aria-live="polite"` on the card.
- Deviation noted: the UUID format check from the plan is left to the API (an invalid id returns 404 → "Pesanan tidak ditemukan."), so there is no second check in the page.
- Tests 25/25 in wallet; typecheck, lint, prettier clean.
