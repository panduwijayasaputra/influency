# QA Report: TASK-158 — Purchases contract and dummy client

**Result:** PASS

## Checked

- `packages/shared/src/purchases.ts`: bounds are the LOCKED ones (unlock 5–1,000 via the existing `POST_OFFER_*` constants, plan 10–5,000, tip 1–1,000), request schemas are strict (unknown keys rejected), amounts are integers. New error codes (`PLAN_NOT_AVAILABLE`, `RENEWAL_ALREADY_SCHEDULED`, `RENEWAL_ALREADY_STARTED`, `CANNOT_PURCHASE_OWN`, `TIP_NOT_ALLOWED`) carry Bahasa messages.
- `lib/api/errors.ts`: `ApiError` keeps `code`, message and `details`; `wallet.ts` re-exports it, so existing imports still work. `postJson` sends the `Idempotency-Key` and parses error bodies.
- Dummy phase is contained: every dummy function lives in `lib/api/purchases.ts` / `lib/demo.ts` / `creator-subscription.server.ts` with a `shortcut:` comment naming its story. No money logic or price decision in the browser.
- `fetchPublicPost` uses the real, already access-checked endpoint.

## Tests

- `purchases.test.ts` (shared): all bounds on both sides, decimals, unknown keys.
- `errors.test.ts`, `purchases.test.ts` (web): key header, error mapping, dummy tip shortfall, non-OK post fetch.
- `pnpm check`: format, lint, typecheck, API 870 tests, web 631 tests all pass.

## Notes

- Installed the locked `hls.js@1.7.3` (declared in `package.json` and the lockfile but missing from `node_modules`), which had stopped 8 web test files from loading. No dependency or lockfile change.
