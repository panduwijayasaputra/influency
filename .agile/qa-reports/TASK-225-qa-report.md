# QA Report: TASK-225 — Discover videos endpoint + web wiring

**Story:** US-069
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] New `discover` module (`DiscoverModule` → imports `PostsModule`, which now exports `PublicPostsService`); registered in `AppModule`
- [x] Thin controller: `GET /discover/videos`, `OptionalSessionGuard` + `RateLimitGuard` (`DISCOVER_RATE_LIMIT` 120/min, placeholder), `cache-control: no-store`, cursor validated with the existing `feedCursorSchema` (`ZodValidationPipe` → 400 `VALIDATION_FAILED`)
- [x] Reuse: `feed()` now delegates to a private `feedPage(where, userId, cursor, pageSize)`. `discoverVideos()` calls it with `visibility: FREE` + `media some VIDEO READY`, so entitlement (`decidePostAccess`), viewer fields, media counts and the keyset cursor are identical to the Home feed. The Home feed output is unchanged (its spec passes).
- [x] Follow state from one `creatorProfile.findMany` (ACTIVE follower `_count` + the viewer's own follow row), the same rule as `CreatorFollowsService.stateOf`
- [x] Web `fetchDiscoverVideosPage` calls the API (mirrors `home-feed.ts`); dummy reels removed

### Security / Isolation
- [x] Premium posts can't appear (FREE filter), so no premium original is reachable from Jelajahi; hidden (PENDING_REVIEW), draft, archived and removed posts are excluded by `status: PUBLISHED`; unapproved creators and suspended owners by `PUBLIC_CREATOR`
- [x] The response carries no `videoUid`, object keys or URLs (asserted on the raw body); playback still goes through `GET /posts/:id/media-access`
- [x] Viewer identity only from the session; a guest gets `following: false`

### Code Quality
- [x] `// shortcut:` note on the missing index for the media filter

## Acceptance Criteria (US-069)

| AC | Result |
|---|---|
| Public, optional session; free + READY video, approved creators, newest first, cursor; bad cursor 400 | PASS |
| Item fields incl. follower count + follow state; playback via media access, no videoUid/URLs | PASS |
| Premium/draft/archived/hidden/removed and unapproved/suspended creators excluded; own posts excluded when signed in | PASS |
| Rate limited; US-065 uses it | PASS |
| Integration tests | PASS |

## Testing

- `modules/discover/discover-videos.integration.spec.ts` (7): public + no-store; inclusion/exclusion (premium, image-only, PROCESSING/REJECTED video, DRAFT/ARCHIVED/PENDING_REVIEW/REMOVED, pending creator, suspended creator); own posts excluded for the creator; follow state (guest false, fan true, suspended follower not counted); cursor paging without repeats; malformed cursor 400; raw body has no video uids, hidden post ids or URLs.
- `apps/web/src/lib/api/discover.test.ts` (5): URL with/without cursor, error statuses, contract mismatch.
- `posts` + `discover` specs: 3 consecutive runs, 252/252 each. Full API suite: 106 files / 1,335 tests pass. ESLint and `tsc` clean.

## Notes

- Test data is dated 2098 so it leads this list without displacing the Home feed spec's 2099 posts, which that spec expects first. A first attempt with 2100 broke `feed.integration.spec.ts`.
- One full-suite run showed 4 failures in `feed.integration.spec.ts` that did not reproduce (3 targeted runs + the next full run passed). The likely cause is the other session running tests at the same time against the same `TEST_DATABASE_URL`: `global-setup` wipes and re-migrates it per run. Avoid running both sessions' test suites at once.
- The rate limit isn't exercised by a test (no other public read endpoint tests its limit either).
