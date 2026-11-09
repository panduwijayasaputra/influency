# QA Report: TASK-123 — Return `liked` for the viewer in comment responses

**Result:** PASS

## Review
- `likedIds` runs one query per list / replies response (none for a guest or an empty page). It covers top-level comments and their preview replies together. `mapReply` / `mapTop` set `liked`; the deleted placeholder is always `liked: false`, `likeCount: 0`; a new comment starts unliked.
- Ordering and cursors are unchanged (Top order still uses the stored `like_count`). The web heart already reads `liked` and `likeCount`; only a doc comment changed there.

## Tests
- In `comment-likes.integration.spec.ts`: own likes on comments and replies, other viewers and guests (counts only), the replies endpoint, the deleted placeholder with a stale like row, and create.
- `pnpm check` passes: shared 221, web 526, api 676.

## Notes
- Not exercised in a browser; the heart toggle against the real API is for UAT. A like does not re-sort the list until the next load.
