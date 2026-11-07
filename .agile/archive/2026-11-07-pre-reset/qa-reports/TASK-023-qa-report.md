# QA Report: TASK-023 — API: store returnTo on the login attempt and redirect to it

**Story:** US-008
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Schema change via a new migration `20261102193007_oidc_attempt_return_to` (`return_to TEXT NOT NULL DEFAULT '/'`); no applied migration edited; schema-conventions spec passes
- [x] Controller stays thin: `@Query('returnTo')` → `safeReturnTo` → `AuthService.startLogin(returnTo)`; the service also sanitizes before storing (defense in depth)
- [x] Lenient input: arrays or unsafe values become `/`, never a 400

**Plan deviation (minor):** the plan used a Zod object for the start query. `@Query('returnTo')` + `safeReturnTo(unknown)` gives the same result (handles non-strings/arrays) with less code.

### Security
- [x] The return path comes only from the consumed attempt row, never from callback params, so a tampered callback can't redirect elsewhere
- [x] The Telegram authorization URL doesn't carry returnTo
- [x] Failures before consume (unknown/replayed/other-browser state) get no returnTo: `/login?error=…` only
- [x] Error locations are built with `URLSearchParams` (encoded); returnTo is printable ASCII only, so the `Location` header can't fail
- [x] No change to session, cookie, PKCE or state handling

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Login started from a page returns to that page | PASS | `start?returnTo=/kreator/posts/abc?x=1` → callback `302` to the same path |
| 2 | Only same-origin relative paths; else home | PASS | `https://evil.com`, `//evil.com`, `/\evil.com`, `/login`, `/kreator/€`, array → stored `/`, redirect `/` |

## Tests Run

- [x] `pnpm --filter @influency/api test`: 139 passed (13 files), including 10 new returnTo cases in `auth.integration.spec.ts`
- [x] `pnpm --filter @influency/api typecheck` / `lint`: PASS
- [x] Edge cases: absent returnTo (row default `/`, existing happy path still `/`), cancelled login and token-exchange failure keep returnTo on `/login`, unknown state ignores it

## Issues

None.
