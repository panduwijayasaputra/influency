# QA Report: TASK-128 — Pin / unpin endpoints (service, controller, integration tests)

**Result:** PASS

## Review
- Order of checks: session, access (hidden 404, not PUBLISHED `POST_NOT_AVAILABLE`), then creator-only (403) **before** any comment lookup, so non-owners (fan, admin, another creator) learn nothing about a comment's existence. Then: missing / deleted / other-post comment 404, reply 422.
- Pin and replace run in one transaction under the post-row lock (`lockAnyPost`); the target write is conditional (`deletedAt: null`) and the transaction rolls back (including the cleared old pin) when a delete won the race. Pinning an already pinned comment keeps its timestamp.
- Responses are 200 `{ pinned }`, `no-store`. Guest 401, missing Origin 403, malformed ids 400. No rate limit (marked `shortcut:`).

## Tests
- `post-comment-pin.integration.spec.ts`: idempotent pin and unpin, replace in one step, independent posts, 403 for fan / admin / another creator with identical responses for real and unknown ids, session / CSRF / ids, reply 422, deleted / unknown / other-post 404, archived and draft posts, DB constraints, delete clears the pin, 9 parallel pins of different comments, 20 parallel pins of one comment, a mixed pin/unpin run, and a pin racing the delete. Ran three times in a row with no flakes.
- `pnpm check` passes.
