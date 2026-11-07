# QA Report: TASK-085 — Comments API — list, create, delete with access and rate-limit rules

**Story:** US-052
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Lives in the `engagement` module. The controller is thin; rules live in `PostCommentsService`; it reuses `PostAccessService` and never re-implements the access rule
- [x] One engagement rule: US-051's `canLike` was renamed to `canEngage` (with a neutral parameter name) and is used by likes, the detail view's `canLike`, and comments. Like behaviour is unchanged and the US-051 tests pass unmodified
- [x] Body validated with `createPostCommentSchema` via `ZodValidationPipe`; `id`/`commentId` via `ParseUUIDPipe`; `cursor` via `z.uuid().optional()`
- [x] Standard `DomainError` codes: `NOT_FOUND`, `POST_NOT_AVAILABLE`, `FORBIDDEN`, `RATE_LIMITED`, `AUTH_REQUIRED`, `VALIDATION_FAILED`
- [x] `cache-control: no-store` on every route

### Security
- [x] Writes require `SessionGuard`, and the global CSRF guard covers POST/DELETE (tested with a foreign Origin → 403)
- [x] userId comes only from `req.authSession`
- [x] Responses never contain user ids (asserted: no `USERS` id appears in the list JSON)
- [x] Markup is stored verbatim. The web renders it as text (TASK-086)

### Creator / user isolation
- [x] Delete requires the comment to belong to **that** post (`findFirst({ id, postId, deletedAt: null })`) and the caller to be the author or the post owner. A comment id from another post → 404; a third user → 403
- [x] Posts that are hidden from the caller (draft/archived/removed, non-public creator) → 404 for every route
- [x] Premium comments are invisible and unwritable without access by default

### Financial Integrity
- N/A (non-financial)

### Code Quality
- [x] Small, readable; `toComment` mapper shared by list/create
- [x] Known limits carry `shortcut:` comments: the rate limit can overshoot under concurrency; a comment can race an archive

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | A logged-in user comments on a published free post; text only, max length | PASS | 201 + trimmed body; whitespace / 501 chars → 400; DB CHECK verified with a raw INSERT |
| 2 | Premium read/write configurable, default only viewers with access | PASS | Default → 403 for GET and POST; READ flag → read only (`canComment: false`, write 403); WRITE flag → 201; the owner always reads/writes |
| 3 | Author deletes own; creator deletes any on own posts; deleted vanish for everyone | PASS | Soft delete with `deleted_by_user_id`; absent for anon/author/owner afterwards; a second delete → 404; concurrent double delete → no 5xx, deleted once |
| 4 | Archived/removed posts: not shown, new comments rejected | PASS | Non-owner → 404 `NOT_FOUND`; the owner of an archived post → 404 `POST_NOT_AVAILABLE` for GET/POST; the owner can still delete |
| 5 | Plain text (no injection) | PASS (API side) | Stored and returned verbatim; rendering is covered in TASK-086 |

## Tests Run

- [x] Existing api suite: PASS (47 files, 589 tests)
- [x] Engagement specs: PASS (37 tests: likes + 20 new comment tests)
- [x] Typecheck / lint / prettier (api): PASS
- [x] New tests: `apps/api/src/modules/engagement/post-comments.integration.spec.ts`
- [x] Edge cases: pagination boundary (51 → 50 + 1, `nextCursor` null on the last page), a malformed cursor, an unknown post, a CSRF origin, the rate limit (3 → 4th is 429; deleting does not free a slot; other users unaffected), concurrent deletes

## Issues

None.

## Notes

- An admin can read every comment (`access` is `full`) but cannot delete other users' comments. Admin moderation belongs to US-042.
- Comments by users who are later suspended stay visible. That also belongs to moderation (US-042).
