# QA Report: TASK-121 — comment_likes table (Prisma model + migration)

**Result:** PASS

## Review
- `comment_likes`: `UNIQUE (comment_id, user_id)`, index on `user_id`, both foreign keys `ON DELETE RESTRICT`, `uuidv7()` id. The generated migration has nothing else. Rows are never edited or deleted by the app (only by unlike).

## Tests
- Covered by `comment-likes.integration.spec.ts`: a direct duplicate insert fails with P2002.
- `pnpm check` passes: shared 221, web 526, api 676.
