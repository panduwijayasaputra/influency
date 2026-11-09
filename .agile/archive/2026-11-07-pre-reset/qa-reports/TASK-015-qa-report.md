# QA Report: TASK-015 — Auth schema, env config and dependencies

**Story:** US-006
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Prisma models follow the conventions header (uuidv7 ids, `Timestamptz(3)`, snake_case maps); `schema-conventions.integration.spec.ts` passes unchanged
- [x] New migration `20261102185758_auth_identities_sessions`; `init_users` untouched
- [x] Deps pinned exactly and at least two weeks old: `jose` 6.2.13 (2026-10-20), `@fastify/cookie` 11.1.3 (2026-10-08); transitive `cookie` 2.0.1 (2026-06-30), `fastify-plugin` 6.0.1 (2026-10-10). No install scripts, so no `allowBuilds` change.
- [x] Shared `LOGIN_ERROR_CODES` / `SESSION_COOKIE` in `packages/shared/src/auth.ts`

### Security
- [x] `sessions.token_hash` unique, so only hashes are stored; `oidc_login_attempts.state` unique
- [x] `UNIQUE (provider, provider_sub)` on `auth_identities`, so identity never depends on username
- [x] Env error messages contain names only, no values (the test covers the client secret)
- [x] `.env.example` holds placeholders only; vitest supplies its own Telegram placeholders, so CI needs no secrets or workflow change

### Financial Integrity
- n/a

### Code Quality
- [x] Small, consistent with existing env and test patterns

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 3 | User identified by `(provider, provider_sub)` | PASS (schema part) | Unique index + P2002 test in `auth-schema.integration.spec.ts` |
| 4 | Client secret never sent to browser | PASS (config part) | Secret only in API env schema |

Remaining criteria are covered by TASK-016–018.

## Tests Run

- [x] API suite: PASS (9 files, 57 tests)
- [x] Typecheck / lint (api) and `pnpm format:check`: PASS
- [x] New tests: `apps/api/src/common/auth-schema.integration.spec.ts`; `env.spec.ts` cases for each missing Telegram var, non-numeric client id, secret not echoed

## Issues

None.

## Notes

- **Local `.env` action for the user:** the existing `.env` still has `TELEGRAM_OIDC_CLIENT_ID=SET_LOCALLY` and the old `:4000` redirect URI. The API now refuses to start until the client ID is numeric (a real Bot ID or the `.env.example` placeholder) and the redirect URI is updated.
- The migration was applied to the local dev DB by `prisma migrate dev`.
