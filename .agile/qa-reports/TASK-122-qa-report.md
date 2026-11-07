# QA Report: TASK-122 — Like / unlike endpoints (service, controller, integration tests)

**Result:** PASS

## Review
- **Gate first:** `PostCommentsService.gate` (now public) runs before any comment lookup, using `PREMIUM_COMMENTS_READ_WITHOUT_ACCESS`. A locked premium post returns the same 403 for a real and an unknown comment id.
- **One transaction per call:** live-comment check, like insert (skip-duplicates) or delete, `like_count` change only when a row really changed, then read the count. The unique index makes the insert result the single source of truth.
- **Delete race:** the increment is `updateMany where deletedAt: null`; no match throws `NOT_FOUND` and rolls back the like row.
- Unlike never goes below zero (`likeCount > 0` guard plus the existing CHECK). Guests get 401, a missing `Origin` gets 403, malformed ids 400. Responses are 200, `no-store`, and match `commentLikeResponseSchema`.
- No rate limit (marked with a `shortcut:` comment).

## Tests
- `comment-likes.integration.spec.ts` (16 cases): idempotent like and unlike, replies and replies under a deleted parent, deleted comments (404, old likes kept), unknown / other-post / malformed ids, session and CSRF, locked premium (same response for real and unknown ids, policy flag on, owner), archived and draft posts, 20 parallel likes by one user, 10 users in parallel, a mixed like/unlike run (count equals rows), a like racing a delete, the DB unique constraint.
- `pnpm check` passes (one unrelated auth test failed once under load and passed on re-run).
