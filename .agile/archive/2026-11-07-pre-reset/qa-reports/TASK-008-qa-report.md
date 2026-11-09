# QA Report: TASK-008 — Request ID & Structured JSON Logging

**Story:** US-003
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Logging/request ID in shared infra (`app.factory.ts`), no new logging deps
- [x] `createApp` split into `createFastifyAdapter` + `configureApp` so tests can build the same app with overrides
- [x] ESM `.js` imports, strict types (no `any`)

### Security
- [x] `requestIdHeader: false`: incoming `X-Request-Id` validated in `genReqId` (`/^[A-Za-z0-9_-]{1,64}$/`), otherwise `req_<uuid>` → no log injection
- [x] Request log serializer logs method + path only; query string (future OIDC `code`) and headers (cookies) never logged

### Financial Integrity
- N/A

### Code Quality
- [x] Small and commented only where the why isn't obvious

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 2 | Every response carries a request ID that also appears in JSON logs | PASS | `onRequest` hook sets `x-request-id` on all responses (incl. 404); pino lines carry `"requestId"` equal to the header (unit test + real server) |

## Tests Run

- [x] `apps/api` vitest: PASS (29 tests; new `src/request-id.spec.ts`)
- [x] Typecheck / lint: PASS
- [x] Edge cases: generated IDs unique; well-formed incoming reused; `a b`, `x"injected":1`, 65 chars, empty, `id;drop` replaced
- [x] Manual: built server, `curl ...?code=secret -H "x-request-id: uat_1"` → header `uat_1`, log lines `requestId: uat_1`, `url: /api/v1/x`, `secret` absent from log

## Issues (resolved during dev)

- Fastify 5.12 deprecates top-level `requestIdLogLabel` (FSTDEP024). Switched to `logController: new LogController({ requestIdLogLabel })`, which needs an instance from `fastify` itself → added `fastify` 5.12.7 (same version Nest already installs, released 2026-10-13) as a direct api dependency. Also gives the error filter (TASK-009) Fastify request/reply types. Deviation from plan ("no new deps"): the package was already installed transitively.

## Notes

- Nest framework logs (`ConsoleLogger` json) and Fastify request logs (pino) are both JSON but use different level fields (`"level":"log"` vs `"level":30`). Acceptable for now; unify behind one logger if a log pipeline needs it.
