# QA Report: TASK-082 — Like / unlike API and like counts on public posts

**Story:** US-051
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] New `engagement` module (controller thin, rule + Prisma in `PostLikesService`), imports `EntitlementsModule`; access always via `PostAccessService.check`, never re-implemented.
- [x] One like rule: pure `canLike(access, status, PREMIUM_LIKES_WITHOUT_ACCESS)` used by like, unlike and `PublicPostsService.get` (`viewer.canLike`). Deviation from the plan: `PublicPostsService` imports the pure function and injects `ENV` instead of importing `EngagementModule`/`PostLikesService` — same single rule, no module coupling.
- [x] Idempotent: `createMany({ skipDuplicates: true })` (ON CONFLICT DO NOTHING on `UNIQUE(post_id, user_id)`) and `deleteMany`; both return the fresh `COUNT(*)`.
- [x] `ParseUUIDPipe` before any query; `SessionGuard`; `no-store`; existing `DomainError` codes only (`NOT_FOUND`, `POST_NOT_AVAILABLE`, `FORBIDDEN`).

### Security / isolation
- [x] userId only from `req.authSession`; hidden posts (other users' drafts/archived/removed, non-public creators) answer the same 404 as unknown ids; CSRF covered by the global guard (tested).
- [x] No media references added to public responses; `likeCount` is a number only.

### Code Quality
- [x] Known race (like vs. concurrent archive) documented with a `shortcut:` comment; non-financial, harmless.

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Like/unlike a viewable published post; one like even under repeated/simultaneous requests | PASS | Repeat PUT/DELETE tests; 5 concurrent PUTs → 1 row |
| 2 | Logged-out visitors see the count | PASS (API) | `likeCount` in feed + detail, `viewer: null`; login redirect in TASK-083 |
| 3 | Counts on published posts; draft/archived/removed accept no likes | PASS | 404 hidden for others, `POST_NOT_AVAILABLE` for the owner; archived like kept, unlike refused |
| 4 | Premium policy configurable, default only with access | PASS | 403 default, 200 with `PREMIUM_LIKES_WITHOUT_ACCESS=true`; `canLike` mirrors it |

## Test Results

- `post-likes.integration.spec.ts`: 18 passed (new).
- Public post + entitlements specs: all passed after adding `likeCount`/`viewer` to two whole-object fixtures.
- API lint + typecheck clean; prettier clean.
