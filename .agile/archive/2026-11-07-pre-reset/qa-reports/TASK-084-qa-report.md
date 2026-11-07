# QA Report: TASK-084 — Post comments — table, env flags and shared contract

**Story:** US-052
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `PostComment` follows the schema conventions: uuidv7 PK, Timestamptz(3), snake_case `@map`/`@@map`, an index on every FK (`post_id` via `(post_id, id)`, `user_id` via `(user_id, created_at)`, `deleted_by_user_id`)
- [x] The migration is committed (`20261104150000_post_comments`) and hand-edited only to append the two CHECKs. It is named so that it sorts after `post_likes`
- [x] Env flags follow the `PREMIUM_LIKES_WITHOUT_ACCESS` pattern and are documented in `.env.example` as TBD placeholders
- [x] The shared contract lives in `packages/shared/src/comments.ts`, is exported from the index, and its error messages are in Bahasa

### Security
- [x] Input validation: trim + 1..500 in zod; the DB CHECK is a second line of defence
- [x] `postCommentSchema` carries no user ids, only `author.displayName` + `canDelete`
- [x] The `post_comments_deleted_consistent` CHECK makes a half-deleted row impossible

### Financial Integrity
- N/A (non-financial)

### Code Quality
- [x] Clean, minimal; no duplication

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Text only, configured max length | PASS (contract) | `POST_COMMENT_MAX_LENGTH = 500` + CHECK; endpoints in TASK-085 |
| 2 | Configurable premium read/write policy, default access-only | PASS (config) | Both flags default `false`; applied in TASK-085 |
| 3 | Deleted comments disappear | PASS (schema) | Soft-delete columns; filtering in TASK-085 |

## Tests Run

- [x] `@influency/shared` tests: PASS (193 passed), including the new `comments.test.ts` (trim, empty/whitespace, max and max+1, list parse)
- [x] `env.spec.ts` + `schema-conventions.integration.spec.ts`: PASS (61 passed)
- [x] Typecheck / lint (shared, api): PASS
- [x] Migration applied with `prisma migrate dev`; schema in sync, client regenerated

## Issues

None.

## Notes

- `COMMENT_RATE_LIMIT_PER_MINUTE` is also capped at 1000 (the plan only gave a minimum of 1), so that a typo can't effectively disable the limit.
- The raw-INSERT CHECK assertion is covered in TASK-085's integration spec, as planned.
