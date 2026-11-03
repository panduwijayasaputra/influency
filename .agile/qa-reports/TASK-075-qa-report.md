# QA Report: TASK-075 — Public post detail endpoint

**Story:** US-014
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] NestJS module pattern: route on the existing `PublicPostsController`, logic in `PublicPostsService`, `PostsModule` imports `EntitlementsModule` for `PostAccessService`
- [x] Shared response schema (`publicPostDetailSchema`) in `packages/shared`; ESM `.js` imports
- [x] Standard `DomainError('NOT_FOUND')` error shape

### Security
- [x] Input validation: malformed `postId` → 404 before any query (no 400/500 that would differ from "hidden")
- [x] No injection: Prisma queries only
- [x] Auth: `OptionalSessionGuard`; `userId` is `req.authSession?.userId ?? null` only, never request data
- [x] Isolation: the single `PostAccessService.check` decides; hidden, wrong-slug, unknown and malformed ids all give the same 404 (no existence leak). Response carries no media ids, keys, uids or URLs (asserted on the raw body for anonymous and owner)
- [x] `cache-control: no-store` (owner/admin responses must not be cached publicly)

### Financial Integrity (if applicable)
- N/A: read-only; price is the current offer from the DB (`Number()` exact under the 1,000 Koin CHECK)

### Code Quality
- [x] Feed mapping extracted to `publicPostFields` and shared by feed and detail (no duplication); feed output unchanged
- [x] Proper error handling

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Free post shown in full to anyone | PASS (API) | `access: 'full'` for anonymous; page in TASK-076 |
| 2 | Premium shows blurred preview + Koin price "akses permanen" (+ subscription once plans exist) | PASS (API) | `access: 'locked'`, latest offer price, `previewUrl`; subscription option deferred to US-026/US-027 by agreed plan |
| 3 | User with access sees full post + unlocked indication | PASS (API) | owner/admin get `full`; paid sources arrive with US-050 through the same check |
| 4 | Draft/archived/removed → not found for public | PASS | draft, archived, pending, removed, suspended-creator → 404; archived library access is US-050/US-029 |

## Tests Run

- [x] Existing suites: `public-posts`, `public-post-preview` integration specs PASS; shared `posts.test.ts` PASS (34)
- [x] Typecheck / lint (api, shared): PASS; prettier clean
- [x] New tests: `apps/api/src/modules/posts/public-post-detail.integration.spec.ts` (13 cases), `packages/shared/src/posts.test.ts` (detail schema)
- [x] Edge cases: wrong slug, slug case, malformed/unknown id, expired session → anonymous, owner removed → 404, admin removed → full, READY-only media counts, latest offer version

## Issues (if any)

None.

## Notes

- An admin sees a REMOVED premium post with a `previewUrl` whose preview endpoint 404s (it serves PUBLISHED only). Harmless: admins get `full` and the page shows media, not the cover.
