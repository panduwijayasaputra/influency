# QA Report: TASK-009 — Standard Error Format, DomainError & Zod Validation Pipe

**Story:** US-003
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Error codes, statuses and Bahasa Indonesia messages in `packages/shared` (`ERRORS`, `ErrorCode`, `errorResponseSchema`)
- [x] `DomainError`, global `AllExceptionsFilter`, `ZodValidationPipe` in `apps/api/src/common/`
- [x] Filter registered in `configureApp`, so `createApp` and test apps share it
- [x] `backend.md` documents pipe + `DomainError` usage

### Security
- [x] Unknown errors → generic 500; message/stack only in the server log (`request.log.error`, carries `requestId`)
- [x] Nest `HttpException` and Fastify messages never exposed; default shared messages only
- [x] Validation details = path + message, never submitted values

### Financial Integrity
- N/A (no money code). `INSUFFICIENT_COINS` → 402 with `details` ready for wallet stories.

### Code Quality
- [x] Small pure mapping helpers; no duplication

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 3 | Domain errors return `{ error: { code, message, requestId, details } }`, codes in shared | PASS | 402 `INSUFFICIENT_COINS` with details; `requestId` = `x-request-id` header; every body parses with `errorResponseSchema` |
| 4 | Unexpected errors → generic 500 without stack/internals | PASS | Body has no `secret`/`stack`/`.ts`; log line has stack + `requestId` |
| 5 | Validation failures → 400 same format | PASS | Zod pipe (both fields listed) and malformed JSON (Fastify `FST_ERR_CTP_INVALID_JSON`) |

## Tests Run

- [x] `pnpm --filter @influency/shared test`: PASS (18; new `errors.test.ts`)
- [x] `apps/api` vitest: PASS (37; new `src/common/errors.spec.ts`, updated `app.spec.ts` 404 body)
- [x] Typecheck / lint (all packages), Prettier: PASS
- [x] Edge cases: HttpException message hidden, unknown route 404, malformed JSON 400, valid body passes with unknown keys stripped, Zod paths containing symbols (`map(String)` — `join` would throw)

## Issues (resolved during dev/QA)

- Zod issue paths are `PropertyKey[]`; `Array.join` throws on symbols → `path.map(String).join('.')`.
- Added a test that the unexpected error is actually logged with `requestId` and stack (plan only tested the response).

## Notes

- Other `HttpException` statuses (e.g. 405, 429) map to 500 for now; add codes (e.g. `RATE_LIMITED`) when throttling lands.
