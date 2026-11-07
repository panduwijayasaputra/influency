# QA Report: TASK-088 — Report a post (`POST /api/v1/posts/:id/report`)

**Story:** US-042
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Thin controller in `engagement` module; rule in `PostReportsService`; body validated by `ZodValidationPipe(createPostReportSchema)`, id by `ParseUUIDPipe`
- [x] Domain errors only (`NOT_FOUND`, `CANNOT_REPORT_OWN_POST`, `POST_NOT_AVAILABLE`, `RATE_LIMITED`)

### Security
- [x] `SessionGuard` then `RateLimitGuard` (10/hour per user, TBD placeholder); CSRF via global guard (tested)
- [x] Reporter id from the session only. Visibility via `PostAccessService.check`, so the endpoint can't confirm drafts, archived, removed or suspended creators' posts exist (same 404 as unknown)
- [x] Logs post id + reason only, never the user's note

### Creator / user isolation
- [x] A user can only create their own report; no read endpoint exposes reports to non-admins

### Financial Integrity
- [x] N/A

### Code Quality
- [x] Insert via `createMany … skipDuplicates` on the partial unique, the same idempotent pattern as likes

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | A logged-in user can report a post with a reason | PASS | 200 `{ reported: true }`, row with reason + trimmed note |

## Tests Run

- [x] `post-reports.integration.spec.ts`: 9 passed
- [x] Typecheck, lint, Prettier: clean
- [x] Edge cases: locked premium reportable; duplicate open report keeps the first; re-report after resolution; 5 concurrent → 1 row; owner 403; draft/review/archived/removed/suspended-creator/unknown → 404; admin on draft → `POST_NOT_AVAILABLE`; anonymous 401; cross-origin 403; malformed id / empty / OTHER without note / extra key → 400; 11th request → 429 + `Retry-After`

## Notes

- Guards run before validation, so invalid requests also count toward the rate limit. That's intended (abuse protection).
- A report racing an admin removal can land on a just-removed post. It then shows up in the queue and the admin dismisses it. Harmless.
