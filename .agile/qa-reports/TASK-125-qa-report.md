# QA Report: TASK-125 — Edit endpoint (service, controller, integration tests)

**Result:** PASS

## Review
- **Order of checks:** guest 401, then `gate()` with the write flag (hidden 404, not PUBLISHED `POST_NOT_AVAILABLE`, locked premium 403), then the live comment on that post (404), then author-only (403). The post creator and an admin are rejected with 403 and the text stays.
- **No-op:** unchanged trimmed text returns 200 with `editedAt` still null.
- **Race with delete:** `updateMany` is conditional on `deletedAt: null` and `userId`; `count === 0` is a 404. A test runs PATCH and DELETE together 5 times; the deleted row never shows its old or new text in the list.
- **Deleted text:** a deleted comment's PATCH returns 404 without echoing its text, and the DB text is untouched.
- `editedAt` is returned in list, preview replies, the replies endpoint and create (null). The response is the flat reply shape; `liked` is not meaningful there and the web ignores it.
- Merged with US-018's `liked` set in `mapReply` without changing its behaviour.

## Tests
- `post-comment-edit.integration.spec.ts` (new): author edit of a comment and a reply, a year-old comment, no-op, creator/admin/other 403, guest 401, CSRF 403, deleted/unknown/foreign/malformed ids, validation, locked premium (denied, owner OK, policy flag OK), archived/draft, delete race.
- `pnpm check` passes (format, lint, typecheck; shared 221, web 533, api 688).

## Notes
- The plan said an archived post gives the author `POST_NOT_AVAILABLE`; in fact it is hidden from non-owners, so the author gets 404 `NOT_FOUND` and only the owner sees `POST_NOT_AVAILABLE`. Edits are not rate-limited (marked `shortcut:`).
