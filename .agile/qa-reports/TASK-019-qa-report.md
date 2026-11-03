# QA Report: TASK-019 — Configurable session lifetime, SessionGuard and CSRF guard

**Story:** US-007
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Guards live in `apps/api/src/common/` (backend.md: shared guards in common); `CsrfGuard` registered once via `APP_GUARD` in the global `CommonModule`
- [x] Errors via `DomainError` (`AUTH_REQUIRED` 401, `FORBIDDEN` 403) → standard error body through `AllExceptionsFilter`
- [x] New env var added to `envSchema` + `.env.example`; ESM `.js` imports; no `any`
- [x] Guidelines updated (backend.md CSRF + session lifetime, frontend.md server-side mutation Origin rule)

### Security
- [x] `SessionGuard`: single query requires matching `token_hash`, `revoked_at IS NULL`, `expires_at > now` (API server time), user `ACTIVE`; token and hash never logged or returned
- [x] `CsrfGuard`: unsafe methods with the session cookie require exact `Origin === new URL(WEB_ORIGIN).origin`; missing / `null` / foreign / look-alike origins rejected (fail closed)
- [x] Requests without the session cookie are exempt (can't act as a user; keeps future webhooks working)
- [x] Cookie still HttpOnly, SameSite=Lax, Secure on https `WEB_ORIGIN` (now asserted)

### Financial Integrity
- N/A (no financial code)

### Code Quality
- [x] Hardcoded `SESSION_TTL_MS` shortcut removed; one source (`SESSION_TTL_DAYS`) drives row `expires_at` and cookie `Max-Age`
- [x] No duplication; small, readable guards

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | HttpOnly session cookie (Secure on HTTPS), no tokens readable from JS | PASS | http test: HttpOnly, not Secure; https override test: HttpOnly + Secure |
| 2 | Sessions expire after a configured lifetime; expired sessions rejected | PASS | `SESSION_TTL_DAYS` (default 30, 1–365); expired row → 401 `AUTH_REQUIRED` |
| 3 | Logout revokes the session | n/a | TASK-020 (guard already rejects revoked rows) |
| 4 | State-changing requests protected against CSRF | PASS | `CsrfGuard` tests: allow web origin; reject none/foreign/null/look-alike; exempt cookieless + safe methods |

## Tests Run

- [x] Existing test suite: PASS (`pnpm --filter @influency/api test`: 12 files, 120 tests)
- [x] Typecheck / lint / format: PASS
- [x] New tests: `apps/api/src/common/session.guard.integration.spec.ts`; additions to `env.spec.ts` and `auth.integration.spec.ts`
- [x] Edge cases: unknown / expired / revoked / suspended-user sessions; `Origin: null`; look-alike origin prefix; GET with foreign origin; https + custom TTL (7 days → `Max-Age=604800`, row ≈ now+7d)

## Issues

None.

## Notes

- Sessions created before this change keep their stored `expires_at` (guard reads the row) — fine.
- Expired/revoked rows are not cleaned up yet (planned with the Phase 5 worker).
