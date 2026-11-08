# QA Report: TASK-151 — Wire Dompet, drawer and purchase sheet to the wallet API

**Result: PASS**

- `fetchWallet`, `fetchCoinPackages` (unwraps `{items}`) and `fetchWalletTransactions` (cursor URL-encoded) now call `/api/v1/wallet…` with `credentials: 'include'` and parse with the shared schemas; non-OK or a contract break rejects. Only the top-up functions stay dummy (flagged, US-030).
- `PurchaseSheet` reads the balance through `useWalletBalance(open)`: no request until the sheet opens, "…" and a disabled CTA while loading or on error, "Isi Koin · kurang n Koin" from the real balance. `DEMO_KOIN_BALANCE` is deleted (`grep` finds none).
- Test fix worth remembering: a stubbed `Response` body can be read once, so the fetch stub clones per call.
- Web 610/610, API 769/769 (full suite after the new migration + seed), typecheck and lint clean in both.
