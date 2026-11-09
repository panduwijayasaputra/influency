# QA Report: TASK-030 — Creator application API (`POST /creators/apply`, `GET /creators/me/application`)

**Story:** US-010
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] New `creators` feature module (controller thin, service holds rules, Prisma only in the service), imported in `AppModule`
- [x] Body validated with `ZodValidationPipe(creatorApplicationSchema)` from `@influency/shared`; response typed with the shared `CreatorApplicationResponse`
- [x] Domain errors: `SLUG_TAKEN` (409, `details.field = 'slug'`), `CREATOR_APPLICATION_EXISTS` (409), validation → 400 `VALIDATION_FAILED`
- [x] `GET /creators/me/application` is `no-store` and two segments deep, so it can't shadow the future public `GET /creators/:slug`

### Security
- [x] Both routes behind `SessionGuard` (controller-level); 401 without a session
- [x] User/creator isolation: the user id comes only from `req.authSession`; no id in the body or path. The response omits row id/user id
- [x] Global `CsrfGuard` still applies to the POST (foreign Origin → 403, tested)
- [x] Agreement version and timestamp set server-side, never from the client

### Financial Integrity
- N/A

### Code Quality
- [x] Race handling relies on DB uniques: `P2002` → re-check slug owner (`SLUG_TAKEN`) else `CREATOR_APPLICATION_EXISTS`; no parsing of adapter-specific `meta`
- [x] REJECTED → PENDING_REVIEW uses a conditional `updateMany({ where: { userId, status: 'REJECTED' } })`, so a concurrent resubmit can't overwrite a pending application

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Collects display name, slug, bio/category, agreement acceptance | PASS | Stored + returned; empty category → null; agreement version recorded |
| 2 | Lowercase normalization, permitted chars, unique case-insensitively | PASS | `'  Kreator-Baru '` → `kreator-baru`; `a.b`/`ab` → 400; `CREATORS-SPEC-APPROVED` → 409 `SLUG_TAKEN` |
| 3 | Reserved names rejected with a clear message | PASS | `admin`, `Become-Creator` → 400 with issue on `slug` |
| 4 | Status `PENDING_REVIEW`; no second application while pending | PASS | pending/approved users → 409; 5 concurrent submits from one user → exactly one 201 |

## Tests Run

- [x] `creators.integration.spec.ts` (17 tests, real Postgres): auth required, null application, create + normalize + read back, 7 validation cases, slug taken (case variant), second application pending/approved, rejected resubmit (own old slug, then blocked), 5× concurrent same user, 2 users racing one slug, CSRF
- [x] `pnpm --filter @influency/api test`: 18 files, 185 passed
- [x] api typecheck, lint, prettier: pass

## Notes

- Validation issue paths are dotted strings (`'slug'`), as produced by the existing `ZodValidationPipe`; the web form (TASK-031) must map on that.
- No rate limit on `POST /creators/apply` (backend.md lists auth/top-up/purchase/upload/payout/webhook only).
