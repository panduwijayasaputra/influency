# QA Report: TASK-017 — Auth module: start and callback endpoints, user and identity, session cookie

**Story:** US-006
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `modules/auth/` with a thin controller (parse, call service, set cookies/redirect); Prisma only in `AuthService`
- [x] Provider behind the `TELEGRAM_OIDC_CLIENT` token (in `telegram-oidc.client.ts`, which avoids a module ↔ service import cycle); tests override it with the fake
- [x] `@fastify/cookie` registered in `configureApp` (stays synchronous; Fastify loads the plugin before `ready()`), so every boot path gets it
- [x] Callback query parsed with a lenient Zod schema (malformed → failed-login redirect, tested)

### Security
- [x] `state`, `nonce`, PKCE verifier and browser binding are 256-bit random values; the attempt is consumed with one conditional `updateMany` (state + binding hash + unconsumed + unexpired, server time), so replay, unknown, expired and other-browser attempts are all rejected. A mutation test confirmed the binding and single-use conditions are each covered.
- [x] Login-CSRF protection: the attempt is bound to an HttpOnly `influency_oidc` cookie (SameSite=Lax, scoped to `/api/v1/auth/telegram`, 10 min) and cleared on every callback
- [x] Identity matched only by `(TELEGRAM, sub)`; concurrent first login handled via P2002 → re-read (tested with `Promise.all`)
- [x] Session cookie `influency_session`: HttpOnly, SameSite=Lax, Path=/, Secure when `WEB_ORIGIN` is https; only the SHA-256 hash is stored (tested)
- [x] No client secret or ID token in any response header or body (tested); logs contain only failure reasons; the request logger already strips query strings (`code`/`state`)
- [x] Redirect targets are fixed (`/`, `/login?error=<enum>`); no user-controlled redirect
- [x] `Cache-Control: no-store` on both endpoints

### Financial Integrity
- n/a

### Code Quality
- [x] Clear failure paths through one `fail()` helper; no duplication

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | OIDC Auth Code + PKCE (S256), state + nonce bound to the attempt | PASS | `start` test: S256, state/nonce, attempt row with binding hash; verifier never in URL |
| 2 | Server-side exchange; reject bad signature, wrong iss/aud, expired, mismatched/replayed state or nonce | PASS | One integration test each, plus unknown state, expired attempt, missing/foreign binding, token endpoint 500, missing code |
| 3 | First login creates user by `(provider, provider_sub)`; returning user matched by the same pair, never username | PASS | First/returning/same-name-different-sub/concurrent tests |
| 4 | Client secret and ID token never sent to browser | PASS | Raw headers + body assertion |
| 5 | Failed/cancelled login → friendly error, no session | PASS (API part) | Redirects to `/login?error=login_cancelled|login_failed`, no session cookie or row; page copy is TASK-018 |

## Tests Run

- [x] Full API suite: PASS (11 files, 100 tests)
- [x] Typecheck / lint (api), `pnpm format:check`: PASS
- [x] New: `apps/api/src/modules/auth/auth.integration.spec.ts` (22 tests, real Postgres + fake Telegram)
- [x] Mutation checks: removing the binding check, the single-use check or token verification each fails the matching tests

## Issues

### Issue 1
**Severity:** minor
**Type:** correctness
**File:** apps/api/src/modules/auth/auth.service.ts
**Description:** If the database is down during the callback, the user gets the standard 500 JSON error instead of the `/login` page. This is acceptable for an infrastructure failure, and no session is created. Revisit if UX wants a redirect for every failure.

## Notes

- `oidc_login_attempts` rows are never cleaned up (accepted shortcut in the plan).
