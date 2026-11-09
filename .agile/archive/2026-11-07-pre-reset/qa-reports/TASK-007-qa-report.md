# QA Report: TASK-007 — API Environment Validation (Fail Fast)

**Story:** US-002
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Cross-cutting config lives in `apps/api/src/common/env.ts`; ESM `.js` imports
- [x] No `dotenv` dependency: Node 24 `process.loadEnvFile`; `zod` pinned exactly (4.6.7, same as shared)
- [x] `createApp()` stays env-free, so existing app tests are unaffected

### Security
- [x] Error output lists variable paths + messages only, never values (tested with a password in `DATABASE_URL`)
- [x] `MIDTRANS_IS_PRODUCTION=true` (and any non-`false` value, e.g. `TRUE`, `1`) rejected → sandbox lock in code
- [x] Real environment variables take precedence over the `.env` file (tested)

### Financial Integrity
- [x] Production gateway mode cannot be enabled through config

### Code Quality
- [x] Small, single-purpose functions; one error listing every issue

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 4 | Apps fail fast with a clear message on missing env | PASS | `node dist/main.js` without `.env` → exit 1, lists `DATABASE_URL`, points to `.env.example`. Web reads no env yet (per plan). |
| 5 | `MIDTRANS_IS_PRODUCTION` defaults to `false` | PASS | Default `false`; `true` → exit 1 with sandbox-only message |

## Tests Run

- [x] `pnpm check`: PASS (format, lint, typecheck; tests: shared 2, api 21, web 1)
- [x] New tests: `apps/api/src/common/env.spec.ts` (19 cases)
- [x] Edge cases: defaults, missing/invalid `DATABASE_URL` (mysql, non-URL), `postgres://` accepted, `API_PORT` `abc`/`0`/`70000`/`1.5`, prod flag `true`/`TRUE`/`1`/`yes`, multiple errors at once, no secret leak, missing `.env` file, env precedence
- [x] Manual: built API with no `.env` → exit 1; `MIDTRANS_IS_PRODUCTION=true` → exit 1; valid root `.env` with `API_PORT=4123` → listening, `GET /api/v1/x` → 404 JSON (confirms `../../../.env` resolves to repo root from `dist/`)
- [ ] `psql "<DATABASE_URL>" -c "select 1"`: **not verified** — PostgreSQL is not installed on this machine yet

## Issues (resolved during dev)

- The first `loadEnvFile` test restored env by reassigning `process.env`, which detaches it from the real environment that `process.loadEnvFile` writes. Fixed by deleting the test keys instead.

## Notes

- `pnpm dev` now requires a root `.env`; intended (fail fast).
