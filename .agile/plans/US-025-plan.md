# Technical Plan: US-025 — Home Feed API

## Architecture Overview

`GET /feed?cursor=` in the posts module (agreed):
- `SessionGuard`, `cache-control: no-store`
- returns `HomeFeedPage` from TASK-134

The query: `PUBLISHED` posts whose creator matches `PUBLIC_CREATOR` and `creator.userId !== viewer`.

Order lives in one placeholder file, `feed-order.ts`:
- `[{ publishedAt: 'desc' }, { id: 'desc' }]`
- an opaque keyset cursor `<publishedAtMs>_<uuid>` of the last item

Keyset means posts published between page loads land above the cursor, so pages have no gaps and no duplicates.

Item mapping reuses the existing per-row logic in `PublicPostsService` (`publicPostFields`, `decidePostAccess`, `viewerOf`, batched likes and admin lookup). It is extracted into one private `toPublicPosts(rows, userId)` helper used by both `list` and `feed`, so the entitlement and leak rules have one implementation.

## Dependencies

- None. Optional index: `posts(status, published_at desc, id desc)`. Add it only if a test or local EXPLAIN shows it is needed (keep the existing `shortcut:` comment style).

## Risks

- **The refactor of `list()` must not change the profile output.** The existing `public-posts.integration.spec.ts` covers it and must stay green unchanged.
- **Hidden or moderated posts:** they are not `PUBLISHED`, so they are excluded by the status filter. A test confirms this for each moderated status that exists in `POST_STATUSES`.

## Tasks

### TASK-141: Feed endpoint

**Order** (new `apps/api/src/modules/posts/feed-order.ts`):
- `FEED_ORDER`, with a PLACEHOLDER doc comment pointing to feature.md
- `feedCursorSchema`: regex `^(\d{1,15})_(<uuid>)$`
- `encodeFeedCursor({ publishedAt, id })` → `${publishedAt.getTime()}_${id}`
- `feedCursorWhere(cursor)` → `{ OR: [{ publishedAt: { lt: d } }, { publishedAt: d, id: { lt: id } }] }`
- Model it on `engagement/comment-order.ts`.

**Service** (`public-posts.service.ts`):
- Extract `private async toPublicPosts(rows: (Row & { creatorProfile: { slug; userId } })[], userId)`, which returns `PublicPost[]` keyed by row. `list()` calls it with its single creator.
- Add `feed(userId, cursor | null): Promise<HomeFeedPage>`:
  - `findMany({ where: { status: 'PUBLISHED', creatorProfile: { ...PUBLIC_CREATOR, userId: { not: userId } }, ...(cursor && feedCursorWhere(cursor)) }, orderBy: FEED_ORDER, take: HOME_FEED_PAGE_SIZE + 1, include: { ...readyMedia, ...currentOffer, ...counts, creatorProfile: { select: { slug, userId, displayName, avatarKey } } } })`
  - Map with `toPublicPosts`, then add `creator: { slug, displayName, avatarUrl: imageUrl(slug, avatarKey) }`. Export `imageUrl` from `creator-profile.service.ts`.
  - `nextCursor` comes from the last kept row when the extra row exists.

**Controller:** new `feed.controller.ts`, `@Controller('feed')`, `@UseGuards(SessionGuard)`.
- `GET /` with `@Query('cursor', new ZodValidationPipe(feedCursorSchema.optional()))`. A malformed cursor returns 400 `VALIDATION_FAILED`.
- `@Header('cache-control', 'no-store')`.
- Register it in `PostsModule`.

**Integration test:** `feed.integration.spec.ts`, with fixed ids `...000000300001+`. Seed 2 approved creators, 1 unapproved creator, 1 suspended-user creator and the viewer's own creator profile, with 12+ posts across them. Cases:
- a guest gets 401
- the order is publishedAt desc, and posts with the same `publishedAt` are ordered by id desc
- page 1 has 10 items with a `nextCursor`, and page 2 has the rest with `nextCursor: null`
- the union of pages has no duplicates
- a post published after page 1 does not appear on page 2
- the viewer's own posts are excluded
- draft, hidden or moderated posts and posts of unapproved or suspended creators are excluded
- a locked premium post has `access: 'locked'` with only `previewUrl` and `offer`, and the serialized JSON contains no media keys, `storageKey`, `providerId` or signed URL (`expect(JSON.stringify(body)).not.toMatch(...)`)
- an admin viewer gets `access: 'full'`
- `viewer.liked` reflects the viewer's likes
- a bad cursor returns 400

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/posts/feed-order.ts` (+ `feed-order.spec.ts`) | placeholder order + cursor |
| MODIFY | `apps/api/src/modules/posts/public-posts.service.ts` | `toPublicPosts`, `feed` |
| CREATE | `apps/api/src/modules/posts/feed.controller.ts` | endpoint |
| MODIFY | `apps/api/src/modules/posts/posts.module.ts` | register |
| MODIFY | `apps/api/src/modules/creators/creator-profile.service.ts` | export `imageUrl` |
| CREATE | `apps/api/src/modules/posts/feed.integration.spec.ts` | tests |

---

### TASK-142: Web: read the feed API

- Replace the body of `fetchHomeFeedPage(cursor)` with `fetch(`/${API_PREFIX}/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { credentials: 'include' })`, parsed with `homeFeedPageSchema`. It throws on non-OK.
- Drop the `ownSlug` parameter, since the server excludes own posts. Remove it from `HomeFeed`'s use of the feed source, but keep `ownSlug` for recommendations until TASK-144.
- Delete `DEMO_FEED_SLUGS`.
- Update `codebase-map.md` with the `GET /feed` route.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/lib/api/home-feed.ts` (+ test) | real API |
| MODIFY | `apps/web/src/components/home-feed/home-feed.tsx` (+ test) | signature |
| MODIFY | `apps/web/src/lib/demo.ts` | remove demo slugs |
| MODIFY | `.agile/guidelines/codebase-map.md` | route |

**Testing:** the source builds the cursor URL, parses a page, throws on 401 or 500, and the HomeFeed tests still pass.
