# QA Report: TASK-127 — pinned_at column, partial unique index, shared schema, delete clears the pin

**Result:** PASS

## Review
- Migration adds `pinned_at`, a partial unique index (`post_comments_one_pinned_per_post`, one per post while pinned) and a CHECK (`pinned_at IS NULL OR parent_id IS NULL`) as raw SQL. A second `prisma migrate dev` reports no drift.
- Shared: `commentPinResponseSchema` and error code `COMMENT_NOT_PINNABLE` (422).
- API: `pinned` comes from `pinned_at` on live rows; the placeholder and new comments send `pinned: false`. Delete now clears `pinned_at` in the same `updateMany` (CMT-12).

## Tests
- Shared schema and error-code cases. Database cases in `post-comment-pin.integration.spec.ts`: a second pin on a post violates the unique index (P2002), a pinned reply violates the CHECK, deleting the pinned comment clears the pin.
- `pnpm check` passes: shared 224, web 538, api 705.
