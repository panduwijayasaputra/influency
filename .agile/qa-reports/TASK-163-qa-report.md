# QA Report: TASK-163 — Owner plan API, public subscription state and profile wiring

**Result:** PASS

## Checked against the acceptance criteria

- **Owner API:** `GET`/`PUT /creators/me/subscription-plan` use `ApprovedCreatorGuard`; the creator comes from `req.creatorProfileId`, never from the body. The body schema is strict (price 10–5,000 whole Koin, `active`); `durationDays` is rejected because the duration is fixed. A non-creator or pending creator gets 403 `CREATOR_NOT_APPROVED`, a guest 401. The global CSRF guard rejects a cross-origin PUT.
- **Versioning:** each change inserts version + 1; an identical request adds nothing. Concurrent edits lock the creator profile row (`FOR UPDATE`) first, so versions stay gap-free (5 simultaneous edits → 5 consecutive versions).
- **Public read:** `GET /creators/:slug/subscription` (`OptionalSessionGuard`, `no-store`) returns the current active plan or `null`; a deactivated plan reads as none. Unknown and non-public creators are 404. For a signed-in viewer it returns `current: null, scheduled: null, canTip: false`, marked with a `shortcut:` comment for US-037 / US-039.
- **Isolation:** creator2 editing their own plan leaves creator1's versions untouched.
- **Web:** `getCreatorSubscription` is now a real no-store fetch with the cookie forwarded; any failure reads as "no plan" so the public page still renders. The dummy plan/subscription data is gone from `lib/demo.ts`. `fetchCreatorSubscription` is the real client call.
- The service exposes `currentActivePlanInTx(tx, creatorProfileId)` for the subscribe transaction (US-037).

## Tests

`subscription-plans.integration.spec.ts` (8 tests: empty state, bounds and unknown keys, versioning and repeat, public and deactivated plan, concurrency, ownership and roles, 404s, CSRF), `purchases.test.ts` (shared), `creator-subscription.server.test.ts`, `page.test.tsx`. `pnpm check` green: shared 249, API 883, web 660.

## Notes for UAT

- Run `pnpm db:seed` once to create the demo plans (done on this machine). Until US-037 nobody has an active period, so the profile shows Langganan but never Berlangganan.
