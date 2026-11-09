# QA Report: TASK-110 — Extend the shared comment schema

**Result:** PASS

## Review
- All new fields on `postReplySchema` and `postCommentSchema` are optional, so the current API response still parses. The API typechecks unchanged.
- Replies are one level deep: `replies` is an array of `postReplySchema`, which has no `replies` of its own.
- `commentLikeResponseSchema` is the contract for US-018: `{ liked, likeCount }`. `likeCount` has a `min(0)` check.
- No user ids are added to the comment shape.

## Tests
- Shared tests cover:
  - the minimal comment (back-compat)
  - every new field, including a nested reply
  - a reply's own `replies` being stripped
  - a negative `likeCount` and a non-boolean `liked` rejected
  - `commentLikeResponseSchema`
- 217 shared tests pass. The shared build is rebuilt.
