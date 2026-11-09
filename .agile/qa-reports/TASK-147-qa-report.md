# QA Report: TASK-147 — Top-up confirmation sheet and checkout adapter

**Result: PASS**

- `TopupSheet` (BottomSheet "Beli Koin"): sandbox badge, Paket / Harga / Biaya layanan Rp0 / Total bayar, "Lanjut ke pembayaran". The sheet body remounts per package, so there is one `crypto.randomUUID()` idempotency key per opening, kept across retries.
- Double click calls `createTopup` once (`pending` guard + disabled button); failure shows an inline alert and a retry with the **same** key.
- `createTopup` / `startCheckout` / `ApiError` live in `lib/api/wallet.ts` (dummy `createTopup` until TASK-154; `startCheckout` = `window.location.assign`, separate so tests mock it).
- The browser never sends a price; only the package id.
- Tests 11/11 in `components/wallet`; typecheck, lint, prettier clean.
