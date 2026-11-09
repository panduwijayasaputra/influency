# Technical Plan: US-046 — Following List API

## Architecture Overview

`GET /api/v1/me/following` (signed in, `no-store`) lists the caller's followed creators. It is read-only: no locking, and the user id comes only from the session. It lives in the existing `engagement` module next to `CreatorFollowsService` (new `list` method) with a small controller on `@Controller('me')`.

Only **visible** creators are returned: `creator_profiles.status = 'APPROVED'` and the owner user `ACTIVE` (the same `PUBLIC_CREATOR` rule used everywhere). The follower count the profile shows is untouched.

Two sorts, one cursor codec in `following-order.ts` (mirrors `feed-order.ts`):
- `recent`: `ORDER BY creator_follows.created_at DESC, id DESC` through Prisma. Cursor `r.<createdAt ms>.<followId>`.
- `name`: case-insensitive A–Z. Prisma cannot `ORDER BY lower(...)`, so this path uses `$queryRaw` with `ORDER BY lower(cp.display_name) ASC, f.id ASC` and a keyset `(lower(cp.display_name), f.id) > (lower($name), $id)`. Cursor `n.<base64url(lowerName)>.<followId>`.

`total` is the count of visible followed creators, independent of paging. Response fields are the public creator shape only (`slug`, `displayName`, `avatarUrl`, `bannerUrl`, `bio`); never follower identities or counts of other users. Avatar and banner URLs use the same `imageUrl(slug, key)` helper as the feed and recommended creators.

## Dependencies

- US-041 (schema `followingQuerySchema`, `followingPageSchema`, dummy `fetchFollowingPage`). The existing follow API (US-024) stays unchanged.

## Risks

- `name` keyset with equal names. Mitigation: tie-break by follow id, tested.
- Raw SQL drift. Mitigation: use `@@map` names (`creator_follows`, `creator_profiles`, `users`) and cover with integration tests.

## Tasks

### TASK-186: `GET /me/following` (service, cursor, controller, tests)

- `apps/api/src/modules/engagement/following-order.ts`: `followingCursorSchema` (regex for both forms), `encodeFollowingCursor`, `parseFollowingCursor` (throws on malformed), keyed by sort.
- `CreatorFollowsService.list(userId, { sort, cursor })`:
  - `total`: `creatorFollow.count({ where: { userId, creatorProfile: PUBLIC_CREATOR } })` (import `PUBLIC_CREATOR` from `../creators/creator-profile.service.js`).
  - `recent`: `findMany({ where: { userId, creatorProfile: PUBLIC_CREATOR, ...keyset }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: FOLLOWING_PAGE_SIZE + 1, select: { id, createdAt, creatorProfile: { select: { slug, displayName, bio, avatarKey, bannerKey } } } })`.
  - `name`: `$queryRaw` with the same visibility and the keyset above; fetch `FOLLOWING_PAGE_SIZE + 1` rows.
  - Slice to the page size, compute `nextCursor` from the last page row when there was an extra row, map to `followingCreatorSchema` (avatar/banner via `imageUrl`). The `bio` is returned as stored (plain text).
- `apps/api/src/modules/engagement/following.controller.ts`: `@Controller('me') @UseGuards(SessionGuard)`, `@Get('following') @Header('cache-control','no-store')`, `@Query(new ZodValidationPipe(followingQuerySchema))`. Register in `engagement.module.ts`. Check the route does not collide with `GET /auth/me` or `creators/:slug`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/engagement/following-order.ts` (+ `.spec.ts`) | cursor codec |
| MODIFY | `apps/api/src/modules/engagement/creator-follows.service.ts` | `list()` |
| CREATE | `apps/api/src/modules/engagement/following.controller.ts` | `GET /me/following` |
| MODIFY | `apps/api/src/modules/engagement/engagement.module.ts` | register |
| CREATE | `apps/api/src/modules/engagement/following.integration.spec.ts` | integration tests |
| MODIFY | `.agile/guidelines/codebase-map.md` | endpoint row |

**Testing** (real Postgres; model on `creator-follows.integration.spec.ts`):
- Guest → 401; user A never sees B's follows.
- `recent`: latest follow first; following a creator after page 1 does not repeat or skip on page 2.
- `name`: case-insensitive order ("alma" before "Budi"), ties by follow id, pages disjoint and complete.
- Excludes suspended / unapproved creators and creators whose owner is not ACTIVE; `total` excludes them too.
- Unfollowing removes the creator from the next response; following adds it.
- Fields are limited to the public shape (assert exact keys); malformed cursor / `sort` → 400.

---

### TASK-187: Swap the Diikuti UI to the real API

- `apps/web/src/lib/api/following.ts`: replace the dummy body with `fetch('/api/v1/me/following?sort=…&cursor=…', { credentials: 'include' })`, throw on `!res.ok`, parse with `followingPageSchema`. Delete the `fetchRecommendedCreators` dummy import.
- `FollowingView`: switch to `usePagedList` paging if TASK-175 loaded a single page; use `total` from the latest page for the count; map `creator.slug` → `id` for the hook. Cards still have no unfollow action.
- Update `following.test.ts` to mock `fetch`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/lib/api/following.ts`, `following.test.ts` | real client |
| MODIFY | `apps/web/src/components/following/following-view.tsx` (+ test) | paging, count |
| MODIFY | `.agile/guidelines/codebase-map.md` | remove "dummy" note |

**Testing:** query string for each sort and cursor; error on non-OK; paging appends and de-dupes; manual run: follow a creator on its profile, open `/following`, see it; unfollow on the profile, reopen, it is gone.

## Suggested order

TASK-186 → TASK-187.
