# QA Report: TASK-087 — Shared contracts, schema and migration for reports and moderation actions

**Story:** US-042
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Zod contracts in `packages/shared/src/moderation.ts`, exported from `index.ts`; strict bodies (`z.strictObject`)
- [x] Prisma conventions: uuidv7 ids, `Timestamptz(3)`, snake_case via `@@map`/`@map`; `schema-conventions` spec passes
- [x] Migration `20261104160000_moderation` committed with hand-written partial unique index + CHECKs, documented on the models

### Security
- [x] Note length and reason enum enforced by both the shared schema and the DB
- [x] All FKs RESTRICT (reports/actions keep history; a reported post cannot be deleted)

### Financial Integrity
- [x] N/A. No finance tables touched; moderation rows are append-only by design (no update path other than setting `resolved_by_action_id` once)

### Code Quality
- [x] Error codes `CANNOT_REPORT_OWN_POST`, `USER_STATUS_CONFLICT`, `CANNOT_SUSPEND_ADMIN` with Bahasa messages

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Report with a reason (data model) | PASS | `post_reports` + `post_report_reason` enum, OTHER needs a note |
| 2 | Queue/dismiss/hide/remove (data model) | PASS | `moderation_actions` + `resolved_by_action_id` |
| 3 | Suspend (data model) | PASS | SUSPEND_USER / UNSUSPEND_USER actions target a user (CHECK) |
| 4 | Never change financial history | PASS | No finance columns/tables; RESTRICT FKs |

## Tests Run

- [x] `packages/shared` moderation + errors tests: 42 passed
- [x] `apps/api` `moderation-schema.integration.spec.ts` + `schema-conventions`: 8 passed
- [x] Typecheck + lint (shared, api): clean; Prettier clean
- [x] Edge cases: duplicate open report → P2002, re-report after resolution allowed, OTHER without note, note 501 chars, wrong action target, post delete blocked

## Notes

- Seed step skipped: the seed has no posts yet (the plan's own condition).
- Prisma's first `migrate dev --create-only` created an empty, clock-named migration (`20261103184026_moderation`) and applied it to the local dev DB. It was deleted along with its `_prisma_migrations` row. The real migration was renamed to sort after `20261104150000_post_comments`.
