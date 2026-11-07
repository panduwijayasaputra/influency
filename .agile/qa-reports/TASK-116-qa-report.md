# QA Report: TASK-116 — Shared contracts (create-with-parent, replies page, opaque cursor, constants)

**Result:** PASS

## Review
- `parentId` is `z.uuid().optional()`, so a malformed id is a 400 before any query runs.
- `nextCursor` of the list is now an opaque string; the replies page keeps a uuid cursor (the last reply id), validated.
- `PostReply`/`PostComment` already had `deleted`, `likeCount`, `replyCount`, `replies`; nothing user-identifying was added.

## Tests
- `comments.test.ts`: `parentId` accepted, absent and rejected cases; opaque cursor parses; a reply page parses and rejects a non-uuid cursor. Shared: 220 pass.

## Checks
- `pnpm check` passes (format, lint, typecheck, tests: shared 220, web 526, api 660).

## Notes
- None.
