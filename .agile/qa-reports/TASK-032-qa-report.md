# QA Report: TASK-032 — Review history table, shared admin contracts, demo pending application

**Story:** US-011
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Schema change ships with migration `*_creator_application_reviews` (generated with `--create-only`, hand-edited to add the reason CHECK); uuidv7 PK, `Timestamptz(3)`, snake_case via `@map`/`@@map`, enum mapped
- [x] Append-only table: no `updated_at`; FKs `ON DELETE RESTRICT` so history can't be dropped by deleting a profile or reviewer
- [x] Shared Zod contracts in `packages/shared/src/creators.ts`; new error code with Bahasa message in `ERRORS`
- [x] Seed step is idempotent and create-only for the pending demo application (keyed on `user_id`, so a UI-created application for Subscriber B can't make the seed fail)

### Security
- [x] Rejection reason trimmed, 1–500 chars (rendered later as plain text)
- [x] No auth surface in this task

### Financial Integrity
- N/A

### Code Quality
- [x] DB CHECK `(decision = 'REJECTED') = (reason IS NOT NULL)` backs the app rule

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Pending list with applicant details + slug | PARTIAL (contract) | `adminCreatorApplicationSchema` defined; endpoint in TASK-033 |
| 2 | Approve activates / reject records a reason | PARTIAL (storage) | Review table + reason CHECK; logic in TASK-033 |
| 3 | Decision records reviewing admin + timestamp | PASS (storage) | `reviewer_id` NOT NULL FK, `created_at` default now() |
| 4 | Non-admins cannot list/approve/reject | — | TASK-033 |

## Tests Run

- [x] `packages/shared` tests: 102 passed (new: reject schema trim/empty/whitespace/501/500, response with null `rejectionReason`)
- [x] `creator-application-reviews-schema.integration.spec.ts` (new, real Postgres): reason CHECK both ways, valid inserts, profile delete restricted
- [x] `seed.integration.spec.ts`: Subscriber B PENDING_REVIEW; re-seed keeps an APPROVED decision (restored after)
- [x] `schema-conventions.integration.spec.ts`: pass
- [x] Prettier, shared lint + typecheck: pass
- [ ] api typecheck: expected failure in `creators.service.ts` (`rejectionReason` missing) — implemented by TASK-033, re-checked there

## Notes

- Local dev DB is migrated; run `pnpm db:seed` to get the pending demo application.
