# QA Report: TASK-120 — Web — wire Balas, more replies, new cursor

**Result:** PASS

## Review
- Balas now starts a reply under the top-level comment (reply-to-reply passes the same `topId`); the server also normalizes. A "Membalas {name}" chip with a cancel button sits above the composer, and the textarea takes focus.
- The reply is added under its thread only when every earlier reply is loaded, otherwise just counted, so oldest-first order is never broken. The thread opens after the viewer replies.
- "Lihat balasan lainnya" loads after the last loaded reply and stops when the API says there is no more; failure shows an inline alert and keeps the button.
- List cursor is URL-encoded. A new top-level comment is inserted after liked and pinned ones (`insertTopLevel`).
- Guests still get a login link on Balas. No permission is computed on the client.

## Tests
- `comment-replies.test.ts`, `comment-thread.test.tsx` (Balas wiring, load more, failure), `post-comments.test.tsx` (parentId sent, cancel, reply-to-reply, unloaded-replies case, `insertTopLevel`). The old "Balas = Segera hadir" test was updated. Web: 526 pass.

## Checks
- `pnpm check` passes (format, lint, typecheck, tests: shared 220, web 526, api 660).

## Notes
- Not checked in a browser at 375px; the visual match of the reply chip is for UAT.
