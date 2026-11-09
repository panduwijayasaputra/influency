# QA Report: TASK-033 — Admin review API (`GET /admin/creators/applications`, approve, reject) + rejection reason for applicants

**Story:** US-011
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] New `admin` feature module (`AdminCreatorsController` thin, `AdminCreatorsService` holds Prisma + rules), imported in `AppModule`
- [x] Path id validated with `ZodValidationPipe(z.uuid())`, body with shared `rejectCreatorApplicationSchema`; responses typed with shared contracts
- [x] Domain errors: `NOT_FOUND` (404), `CREATOR_APPLICATION_NOT_PENDING` (409), `VALIDATION_FAILED` (400)
- [x] POST decisions return 200 (`@HttpCode(200)`); list is `cache-control: no-store`

### Security
- [x] `@UseGuards(AdminGuard)` on the controller class: 401 without session, 403 for users and approved creators (tested on all three routes, no side effects)
- [x] Reviewer id taken only from `req.authSession`; never from the body
- [x] CSRF guard still applies (foreign Origin → 403, status unchanged)
- [x] List exposes only the documented fields (no user id, no Telegram identity)

### Financial Integrity
- N/A

### Code Quality
- [x] Decision = conditional `updateMany({ id, status: PENDING_REVIEW })` + review insert in one `$transaction`; the UPDATE row lock makes concurrent decisions serialize, losers get 409
- [x] Applicant `rejectionReason` comes from the latest review only while status is REJECTED; `apply` / `findMine` share one `include`

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Admins see pending applications with applicant details + slug | PASS | Only PENDING_REVIEW, oldest first; displayName, slug, bio, category, applicantName, submittedAt |
| 2 | Approving activates + gives Studio access; rejecting records a reason | PASS | After approve, `/auth/me` of the applicant includes CREATOR; reject stores trimmed reason, applicant sees it, resubmit hides it |
| 3 | Each decision records reviewing admin + timestamp | PASS | One `creator_application_reviews` row per decision with `reviewer_id` + `created_at`; history survives a resubmit |
| 4 | Non-admins cannot list, approve or reject | PASS | 401 / 403 tested for USER and approved CREATOR |

## Tests Run

- [x] `admin-creators.integration.spec.ts` (new, 15 tests, real Postgres): auth, non-admin ×2, list content/order/no-store, approve + role, reject + applicant reason + resubmit, 4 invalid reasons, double decision, 404/400 ids, 5× concurrent approve (one 200), approve vs reject race (one decision), CSRF
- [x] `pnpm --filter @influency/api test`: 20 files, 204 passed
- [x] api lint, typecheck, prettier: pass

## Notes

- The "reason visible only while REJECTED" check lives in the admin spec (it needs the reject endpoint) rather than `creators.integration.spec.ts`.
- An admin can approve their own application (accepted for MVP; revisit with US-043).
