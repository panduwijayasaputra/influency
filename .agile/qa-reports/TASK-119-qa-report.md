# QA Report: TASK-119 — Replies endpoint

**Result:** PASS

## Review
- `GET /posts/:id/comments/:commentId/replies?cursor=` uses `OptionalSessionGuard`, the same `gate()` read rule and `no-store`.
- The parent must be a top-level comment of that post (a reply id, an unknown id or another post's id is 404). A deleted parent still returns its live replies.
- Pages of 20, oldest first, deleted replies skipped, no user ids.

## Tests
- Preview of 3 plus two pages (20, then the rest) with no overlap; 404 cases; locked premium 403 for guest and fan, OK for the owner (in the replies integration spec).

## Checks
- `pnpm check` passes (format, lint, typecheck, tests: shared 220, web 526, api 660).

## Notes
- None.
