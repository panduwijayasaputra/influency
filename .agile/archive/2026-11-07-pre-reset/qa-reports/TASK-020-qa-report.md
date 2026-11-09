# QA Report: TASK-020 — POST /auth/logout (server-side revocation)

**Story:** US-007
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Thin controller (`auth.controller.ts`), DB write in `AuthService.logout` via Prisma
- [x] Controller prefix changed to `auth`; `telegram/start` and `telegram/callback` paths unchanged (US-006 tests still pass)
- [x] Session cookie attributes shared by `setCookie` and `clearCookie` (one `sessionCookie` field), so clear always matches

### Security
- [x] Revocation is server-side: `updateMany({ tokenHash: sha256hex(token), revokedAt: null })` → old cookie then gets 401 from `SessionGuard`
- [x] Isolation: only the session whose hash matches the caller's own cookie is touched; other sessions of the same user stay live; no id parameters accepted
- [x] CSRF: global `CsrfGuard` rejects cookie-carrying logout without / with a foreign `Origin` (403), session untouched
- [x] `Cache-Control: no-store`; no token in responses or logs

### Financial Integrity
- N/A

### Code Quality
- [x] Idempotent, never throws for unknown/expired/revoked tokens; first `revokedAt` preserved

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | HttpOnly session cookie, Secure on HTTPS | PASS | (TASK-019) cleared cookie also HttpOnly/SameSite=Lax/Path=/ |
| 2 | Expired sessions rejected | PASS | (TASK-019) |
| 3 | Logout revokes the session server-side; old cookie no longer works | PASS | lifecycle test: 200 → logout 204 → 401 `AUTH_REQUIRED` |
| 4 | CSRF protection on state-changing requests | PASS | logout without/with foreign Origin → 403 `FORBIDDEN`, session still valid |

## Tests Run

- [x] Existing test suite: PASS (13 files, 128 tests)
- [x] Typecheck / lint / format: PASS
- [x] New tests: `apps/api/src/modules/auth/logout.integration.spec.ts`
- [x] Edge cases: other session of same user survives; no cookie; unknown token; repeat logout keeps first `revokedAt`; GET → 404

### Manual check (Next proxy forwards `Origin`)

Port 3000 was occupied by an unrelated local process, so the stack ran on web :3100 → API :4100 (`WEB_ORIGIN=http://localhost:3100`, placeholder numeric `TELEGRAM_OIDC_CLIENT_ID` via shell env). `POST http://localhost:3100/api/v1/auth/logout` with cookie `influency_session=dummy`:

| Origin | Result |
|--------|--------|
| none | 403 `FORBIDDEN` |
| `http://localhost:3100` | 204, `Set-Cookie: influency_session=; Max-Age=0; Path=/; …; HttpOnly; SameSite=Lax` |
| `https://evil.example` | 403 `FORBIDDEN` |
| none, no cookie | 204 + cleared cookie |

Conclusion: the Next rewrite proxy forwards `Origin` unchanged; the CSRF check works end to end. A real-session logout through a real Telegram login was not exercised manually (covered by the integration test with the fake provider).

## Issues

None.
