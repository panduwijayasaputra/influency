# QA Report: TASK-154 — Wire checkout and status page to the top-up API

**Result: PASS**

- `lib/api/wallet.ts` has no dummy data left: `createTopup` (POST with `Idempotency-Key`, only `packageId` in the body, `ApiError` with the shared code), `fetchTopup` (404 → null), `fetchPendingTopups`. Midtrans query strings still never reach the status logic.
- `TopupSheet`: `REQUEST_IN_PROGRESS` and other errors keep the same key; `PAYMENT_GATEWAY_UNAVAILABLE` starts a new key (the old order is FAILED). The key lives in state (no ref reads during render, React Compiler lint clean).
- Checkout uses the Snap redirect URL (`startCheckout` = `location.assign`); no Snap JS or client key reaches the web app.
- `docs/payments.md`: drivers, how to try Sandbox, notification URL, invariants.
- Web 613/613, typecheck, lint, prettier clean. Manual real-Sandbox check is documented but not run here (no Sandbox keys in this environment).
