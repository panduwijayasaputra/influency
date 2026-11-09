# QA Report: TASK-132 — comment_moderation_actions table (Prisma model + migration)

**Result:** PASS

## Review
- Migration `comment_moderation_actions`: enum `comment_moderation_actor`, table with UNIQUE `comment_id`, FKs to comment, post and user all RESTRICT, indexes `(post_id, created_at)` and `(actor_id, created_at)`. uuidv7 default, snake_case, timestamptz; `schema-conventions.integration.spec.ts` passes. No applied migration was edited.
- Append-only by convention (the project has no DB triggers for its other append-only tables): no code path updates or deletes audit rows.

## Tests
- A raw second insert for the same `comment_id` is rejected by the UNIQUE index (moderation spec).
- `pnpm check` passes (format, lint, typecheck; shared 224, web 538, api 719).

## Notes
- None.
