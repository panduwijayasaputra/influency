# QA Report: TASK-055 — Public posts feed endpoint

**Story:** US-019
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `PublicPostsService` + thin `PublicPostsController` in the `posts` module; shared `publicPostSchema` / `publicPostListSchema` / `PUBLIC_FEED_LIMIT`
- [x] Reuses `PUBLIC_CREATOR` (exported, not copied) and `currentOffer`
- [x] `cache-control: no-store` so hidden posts disappear immediately

### Security
- [x] Public endpoint; slug is only an identifier (lowercased, matched with the same APPROVED + ACTIVE rule as the profile, same 404)
- [x] Only `status = PUBLISHED`; DRAFT / HIDDEN / PENDING_REVIEW / REMOVED excluded (tested)
- [x] No media ids, object keys, provider uids or URLs in the body (leak test checks every id/key/uid created plus the `post-media/` / `post-video/` prefixes)
- [x] Premium offer terms only; FREE posts always `offer: null`

### Financial Integrity
- N/A (read-only; BIGINT price converted with `Number()`, safe under the 10,000 cap)

### Code Quality
- [x] Small, single query per request (creator lookup + posts with READY media kinds + current offer)
- [x] Documented `shortcut:` comments for the 30-post cap and the missing index

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 3 | Published posts appear in the right section (free / premium preview) | PASS (API side) | `visibility` + counts + offer for premium; UI in TASK-057 |
| 4 | Hidden post removed from the public page | PASS (API side) | HIDDEN excluded, response uncached |

## Tests Run

- [x] `pnpm check`: PASS (shared 164, web 133, api 394)
- [x] New tests: `apps/api/src/modules/posts/public-posts.integration.spec.ts` (10)
- [x] Edge cases: ordering by `publishedAt`, current offer = highest version, REJECTED media not counted, case-insensitive slug, unknown / pending / rejected / suspended creator → 404, empty creator → `[]`, cap at `PUBLIC_FEED_LIMIT`, `GET /creators/me/posts` still routes to the studio list

## Issues (if any)

None.

## Notes

- No separate shared unit test for `publicPostSchema` (plain schema; exercised by the integration spec's parse).
