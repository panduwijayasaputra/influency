# QA Report: TASK-026 — API: `AdminGuard`, `ApprovedCreatorGuard`, `GET /auth/me`

**Story:** US-009
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Guards live in `apps/api/src/common/` next to `SessionGuard`, provided and exported by the global `CommonModule`
- [x] Controller stays thin (`me` delegates to `AuthService.me`); no Prisma in controllers
- [x] Errors via `DomainError` (`AUTH_REQUIRED` 401, `FORBIDDEN` 403, `CREATOR_NOT_APPROVED` 403), standard error body
- [x] Response type is the shared `MeResponse`; tests validate it with `meResponseSchema`
- [x] `session.guard.ts` change is limited to `private` → `protected`

### Security
- [x] Both role guards extend `SessionGuard` and call `super.canActivate` first: no session → 401 before any role query; suspended users are rejected even with an ADMIN row
- [x] Roles come from `user_roles` / `creator_profiles` on every request. Nothing about roles is cached or stored on the session. Tests change the DB between requests with the same cookie
- [x] `GET /auth/me` sends `cache-control: no-store` and returns only id, display name and roles (no tokens, no provider data)
- [x] No endpoint can grant ADMIN
- [x] Isolation: the guards key only on `req.authSession.userId` (from the cookie), never on caller-supplied ids

### Financial Integrity
- N/A

### Code Quality
- [x] Small, no duplication beyond the two parallel guard bodies (each one query)
- [x] The logout spec's stand-in probe ("until US-009 adds /auth/me") now uses the real `/auth/me`

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | `GET /auth/me` returns user, display name, roles; `AUTH_REQUIRED` when not logged in | PASS | `me.integration.spec.ts` |
| 2 | Every account has USER; CREATOR only via approved profile; ADMIN only via DB/seed | PASS | Pending → `['USER']`; approved + admin → `['USER','CREATOR','ADMIN']` |
| 3 | Studio endpoints blocked without an approved profile (`CREATOR_NOT_APPROVED`) | PASS (API) | `ApprovedCreatorGuard`: plain, pending, rejected, admin-without-profile → 403. Web part is TASK-027 |
| 4 | Admin endpoints return `FORBIDDEN` for non-admins | PASS (API) | `AdminGuard`: plain, approved creator → 403. Web part is TASK-027 |
| 5 | Roles read from the DB on each request, never from token claims | PASS | DB-change-then-same-cookie tests in both specs |

## Tests Run

- [x] `pnpm --filter @influency/api test`: 16 files, 156 passed
- [x] Typecheck / lint (api): PASS; `pnpm format:check`: PASS
- [x] New tests: `apps/api/src/common/role.guards.integration.spec.ts`, `apps/api/src/modules/auth/me.integration.spec.ts`; `logout.integration.spec.ts` switched to `/auth/me`
- [x] Edge cases: no cookie, revoked session, suspended admin, rejected/pending profile, admin without a profile, role granted/revoked/approved between requests

## Issues

None.

## Notes

- `backend.md` names an `ADMIN` "RolesGuard"; the implemented name is `AdminGuard` (per the plan). Update the guideline when the story completes.
