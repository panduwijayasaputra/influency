# QA Report: TASK-124 — edited_at column and shared schemas

**Result:** PASS

## Review
- Migration `comment_edited_at` adds one nullable `edited_at TIMESTAMPTZ(3)`; existing rows stay null (never edited). No applied migration was edited.
- `updatePostCommentSchema` is `createPostCommentSchema.pick({ body })`, so the create rules (trim, 1–500) apply and a stray `parentId` is stripped.

## Tests
- Shared test covers trimming, empty, whitespace, 500 vs 501 characters and the stripped `parentId`.
- `pnpm check` passes (format, lint, typecheck; shared 221, web 533, api 688).

## Notes
- None.
