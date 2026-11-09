# Technical Plan: US-022 — Home Feed UI

## Architecture Overview

`/` (server) keeps the session check and renders the `HomeTopBar` plus a client `HomeFeed`. `HomeFeed` loads pages through one swappable client data source, `fetchHomeFeedPage(cursor)` in `apps/web/src/lib/api/home-feed.ts`. That source already returns the final contract (`HomeFeedPage`, defined in shared now), so US-025 only replaces the function body.

Interim source: the existing public APIs. The browser fetches same-origin `/api/v1/creators/:slug` and `/api/v1/creators/:slug/posts` for the slugs in `DEMO_FEED_SLUGS`, merges the posts newest first and slices them into pages with an offset cursor. Because the posts are real, the media, likes and comments in PostCard all work.

## Dependencies

- None new. Reuses `PostCard`, `useNearViewport`, `HomeTopBar`, `AccountDrawer`, `getCurrentUser` and `getMyCreatorProfile`.

## Risks

- **Seeded demo creators have no posts**, so the feed is empty on a fresh seed. Mitigation: the empty state is part of the story. Posts created in studio for `claudiandreya`/`creatorb` show up.
- **Own posts:** the interim source drops posts whose `creator.slug === ownSlug`. US-025 moves that rule to the server.

## Tasks

### TASK-134: Shared feed contract and interim data source

**Shared** (`packages/shared/src/posts.ts`):
- `export const HOME_FEED_PAGE_SIZE = 10;`
- `homeFeedItemSchema = publicPostSchema.extend({ creator: z.object({ slug: z.string(), displayName: z.string(), avatarUrl: z.string().nullable() }) })`. The creator object matches `PostCardCreator`.
- `homeFeedPageSchema = z.object({ items: z.array(homeFeedItemSchema), nextCursor: z.string().nullable() })`, documented as an opaque cursor where null means the end.
- Export the types `HomeFeedItem` and `HomeFeedPage`.

**Web:**
- `apps/web/src/lib/demo.ts`: add `DEMO_FEED_SLUGS = ['claudiandreya', 'creatorb']` with the usual `shortcut:` comment ("until US-025 ships GET /feed").
- New `apps/web/src/lib/api/home-feed.ts`, client-safe (no `'use cache'`):
  - `fetchHomeFeedPage(cursor: string | null, ownSlug: string | null): Promise<HomeFeedPage>`.
  - Interim body: fetch `/${API_PREFIX}/creators/${slug}` and `/${API_PREFIX}/creators/${slug}/posts` for every demo slug with `credentials: 'include'`, so likes stay viewer-aware.
  - Skip slugs that return 404. Throw on any other non-OK response.
  - Drop `ownSlug`. Attach `creator`, sort by `publishedAt` desc then `id` desc, and slice `HOME_FEED_PAGE_SIZE` from `Number(cursor ?? 0)`.
  - `nextCursor` is the next offset as a string, or null at the end. Parse the result with `homeFeedPageSchema`.
  - Mark the function `// shortcut: aggregates demo creators client-side; US-025 replaces the body with GET /feed.`

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/posts.ts` | feed schemas + page size |
| MODIFY | `packages/shared/src/posts.test.ts` (or create) | schema parse test |
| MODIFY | `apps/web/src/lib/demo.ts` | `DEMO_FEED_SLUGS` |
| CREATE | `apps/web/src/lib/api/home-feed.ts` | `fetchHomeFeedPage` |
| CREATE | `apps/web/src/lib/api/home-feed.test.ts` | source tests |

**Testing:**
- The shared schema accepts an item with `creator` and rejects one without it.
- With `fetch` mocked:
  - posts from 2 creators come back merged newest first
  - the own slug is dropped
  - a 404 slug is skipped
  - paging gives 10 items with `nextCursor: '10'`, and the last page gives `nextCursor: null`
  - a 500 throws

---

### TASK-135: HomeFeed component and Home page

**Component:** new `apps/web/src/components/home-feed/home-feed.tsx` (`'use client'`), `HomeFeed({ ownSlug }: { ownSlug: string | null })`.

State:
- `items`, `cursor`
- `status: 'loading' | 'idle' | 'loadingMore' | 'error' | 'done'`
- `errorOnFirst`

Behaviour:
- **First load** on mount. While loading, show a skeleton: 2 card-shaped `animate-pulse` blocks with `aria-busy`.
- **Next page:** a sentinel `<div ref>` after the list uses `useNearViewport(ref)`. When it is near, `status === 'idle'` and `cursor !== null`, load the next page and append it, de-duplicated by `id`.
- **Loading more** shows a small "Memuat…" line with `role="status"`.
- **Error:**
  - Show "Postingan belum bisa dimuat." with a `Button` labelled "Coba lagi" that retries the same cursor.
  - Keep the loaded items.
  - If the first page fails, show the same error in place of the list.
- **End:** when `nextCursor === null` and there are items, show "Kamu sudah melihat semua postingan." in muted text.
- **Empty:** first page with 0 items → "Belum ada postingan" plus body copy "Postingan dari creator akan muncul di sini." plus a `Link` "Jelajahi" to `/discover`.
- **Rendering:** each item is `<PostCard key post={item} creator={item.creator} />` in a `flex flex-col divide-y` list, the same as `CreatorContent`.
  - Muted autoplay, comments sheet, viewer and purchase sheet already live inside PostCard, and overlays don't unmount the list, so the scroll position is kept.
  - Check that PostCard links the creator name/avatar to `/{slug}`. If it doesn't, add that link to PostCard behind `showCreatorLink`. Avoid a duplicate link on the creator's own page.

**Page:** `apps/web/src/app/page.tsx`:
- `Home()` keeps the `getCurrentUser` redirect.
- It computes `ownSlug` the way `CreatorView` does (`roles.includes('CREATOR')` → `getMyCreatorProfile().catch(() => null)?.slug`).
- It renders `<HomeTopBar account={<AccountDrawer user={user} />} />` plus `<main className="mx-auto w-full max-w-feed"><HomeFeed ownSlug={ownSlug} /></main>`, in place of `ComingSoon`.
- `metadata` stays the same.
- Update `frontend.md` (App shell): Home no longer passes `HomeTopBar` to `ComingSoon`, and the feed lives in `components/home-feed/`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/home-feed/home-feed.tsx` | feed list + states |
| CREATE | `apps/web/src/components/home-feed/home-feed.test.tsx` | component tests |
| MODIFY | `apps/web/src/app/page.tsx` | render feed |
| MODIFY | `apps/web/src/app/page.test.tsx` | Home test update |
| MODIFY | `apps/web/src/components/post-card/post-card.tsx` (only if needed) | creator link |
| MODIFY | `.agile/guidelines/frontend.md` | Home note |

**Testing (Vitest + Testing Library; mock `fetchHomeFeedPage` and `useNearViewport`):**
- The skeleton shows first, then the cards.
- Near-viewport loads page 2, and the items are appended without duplicates.
- A failed page 2 keeps page 1 and shows "Coba lagi". Retry succeeds.
- A failed first page shows the error.
- An empty first page shows the empty state with a `/discover` link.
- The end note appears when `nextCursor` is null.
- Page test: a guest is redirected to login, and a signed-in user sees the top bar and the feed (not ComingSoon).
