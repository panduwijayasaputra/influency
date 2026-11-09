# Technical Plan: US-069 — Discover Videos API

## Architecture Overview

`GET /api/v1/discover/videos?cursor=` lives in a new `discover` module. Both Jelajahi endpoints go there: `/creators/search` would collide with `GET /creators/:slug` for a creator whose slug is `search`.

The query is the Home feed query plus two filters, so it reuses `PublicPostsService`. The private part of `feed()` becomes a `postsPage(where, userId, cursor)` helper that both `feed()` and the new `discoverVideos()` call. Because of this reuse, entitlement (`decidePostAccess`), viewer fields, media counts and the keyset cursor (`FEED_ORDER`, `feedCursorWhere`) all stay identical to the feed.

Playback goes through the existing `GET /posts/:id/media-access`. No URL or `videoUid` is added to this response.

## Dependencies

- TASK-217 (`discoverVideosPageSchema`, `DISCOVER_VIDEOS_PAGE_SIZE`).
- `OptionalSessionGuard`, `RateLimitGuard` + `@RateLimit`, `PUBLIC_CREATOR`, `feedCursorSchema`.

## Risks

- **Moderation-hidden posts** are `PENDING_REVIEW` (hide moves them there), so `status: 'PUBLISHED'` already excludes them. No extra flag.
- **Follower counts for a page** need one grouped query, not one count per item: `creatorFollow.groupBy({ by: ['creatorProfileId'], where: { creatorProfileId: { in }, user: { status: 'ACTIVE' } }, _count: true })`. This must match the `stateOf` rule in `CreatorFollowsService` (ACTIVE followers only).
- **No index on the extra filters.** Same `// shortcut:` note as the feed; fine at MVP volume.

## Tasks

### TASK-225: Discover videos endpoint + web wiring

- `apps/api/src/modules/posts/public-posts.service.ts`:
  - Extract the body of `feed()` into `private async postsPage(where: Prisma.PostWhereInput, userId: string | null, cursor: string | null, pageSize: number)`, returning `{ entries: { row, post }[], nextCursor }`. `feed()` keeps its exact output (its integration tests must stay green).
  - Add `async discoverVideos(userId: string | null, cursor: string | null): Promise<DiscoverVideosPage>` with
    ```ts
    where = {
      status: 'PUBLISHED', visibility: 'FREE',
      media: { some: { kind: 'VIDEO', status: 'READY' } },
      creatorProfile: { ...PUBLIC_CREATOR, ...(userId ? { userId: { not: userId } } : {}) },
    }
    ```
    then map like `feed()` (creator slug/displayName/avatarUrl) and add `follow: { followerCount, following }`. Use one `groupBy` for the counts and one `findMany` on `creatorFollow` for the viewer's follows (`userId`, `creatorProfileId in`); guests get `following: false`. The `row` must include `creatorProfileId` (already there).
- `apps/api/src/modules/discover/discover.module.ts` + `discover.controller.ts`:
  ```ts
  export const DISCOVER_RATE_LIMIT = { max: 120, timeWindow: '1 minute' }; // placeholder, like FOLLOW_RATE_LIMIT
  @Controller('discover')
  @Get('videos') @UseGuards(OptionalSessionGuard, RateLimitGuard) @RateLimit(DISCOVER_RATE_LIMIT) @Header('cache-control', 'no-store')
  videos(@Query('cursor', new ZodValidationPipe(feedCursorSchema.optional())) cursor, @Req() req) → this.posts.discoverVideos(req.authSession?.userId ?? null, cursor ?? null)
  ```
  The module imports `PostsModule` (export `PublicPostsService` from it if not already) and is registered in `app.module.ts`.
- `apps/web/src/lib/api/discover.ts`: replace the dummy `fetchDiscoverVideosPage` body with `fetch('/api/v1/discover/videos?cursor=…', { credentials: 'include' })` → `discoverVideosPageSchema.parse`, matching `home-feed.ts`. Remove the dummy data.
- Update `.agile/guidelines/codebase-map.md` (endpoint + module) as part of the task.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/posts/public-posts.service.ts` | `postsPage` helper + `discoverVideos` |
| MODIFY | `apps/api/src/modules/posts/posts.module.ts` | Export `PublicPostsService` (if needed) |
| CREATE | `apps/api/src/modules/discover/discover.module.ts` | Module |
| CREATE | `apps/api/src/modules/discover/discover.controller.ts` | `GET /discover/videos` |
| MODIFY | `apps/api/src/app.module.ts` | Register module |
| CREATE | `apps/api/src/modules/discover/discover-videos.integration.spec.ts` | Integration tests |
| MODIFY | `apps/web/src/lib/api/discover.ts` (+ `discover.test.ts`) | Real fetch |

**Testing (integration, real Postgres, own fixed ids):**
- Included: a published FREE post with a READY video from an approved creator.
- Excluded: PREMIUM video post; FREE image-only post; video still PROCESSING/REJECTED; DRAFT/ARCHIVED/PENDING_REVIEW (hidden)/REMOVED; creator not APPROVED; creator user SUSPENDED; the viewer's own post (logged in), while a guest still sees the same creator's other qualifying posts.
- Newest first; two pages with no repeats/skips when a new post is published between page 1 and 2; invalid cursor → 400 `VALIDATION_FAILED`.
- `follow.following` true for a follower, false for a guest; `followerCount` counts ACTIVE followers only.
- The response JSON contains no `videoUid`, `objectKey`, or URL under `/media-access`/stream hosts (assert on the serialized body).
- Rate limit returns 429 past the limit (if other public endpoints test this, mirror them; otherwise one test).
