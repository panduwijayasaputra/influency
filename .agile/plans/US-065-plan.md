# Technical Plan: US-065 — Jelajahi Video Tab UI

## Architecture Overview

`/discover` becomes a client `DiscoverView` with two tabs ("Video" | "Cari"), chosen by `?tab=cari` (default Video). The Video tab is a full-height, vertical, `scroll-snap` list of `ReelItem`s. Each item reuses `PostVideo` through `useMediaAccess`, so playback, one-at-a-time, the 60% visibility rule, mute and tap-to-play all come from existing code. No new player logic.

The data contract is final from day one (shared Zod schema). `lib/api/discover.ts` is the only place that knows where pages come from. It returns dummy pages until US-069 swaps the body to `GET /discover/videos`.

**Guest access:** `/discover` stays login-only (frontend.md: new pages are login-only by default; guests never see the bottom nav). The proxy already sends a guest to `/login?returnTo=/discover`, which covers the story's guest case. The API (US-069) still accepts anonymous calls.

## Dependencies

- Existing: `PostVideo`, `useMediaAccess`, `useNearViewport`, `usePagedList`, `FollowButton` (`onDark`), `PageHeader` not used (full-screen surface, like the artboard), `AppChrome` bottom nav.
- `followStateSchema` / `homeFeedItemSchema` in `packages/shared`.

## Risks

- **Dummy items can't play.** Dummy post ids have no media, so `useMediaAccess` fails and the item shows its poster/fallback. That is acceptable until US-069. Tests mock `useMediaAccess`.
- **Nested scroll vs page scroll.** The reel list is its own scroll container (`h-[calc(100dvh-var(--bottom-nav))]`, `overflow-y-auto`, `snap-y snap-mandatory`, `overscroll-contain`). Check the bottom nav height variable that `AppChrome` uses rather than hardcoding 65px.

## Tasks

### TASK-217: Discover videos contract + dummy source

- `packages/shared/src/discover.ts` (export from `index.ts`):
  ```ts
  export const DISCOVER_VIDEOS_PAGE_SIZE = 10;
  export const discoverVideoSchema = homeFeedItemSchema.extend({ follow: followStateSchema });
  export type DiscoverVideo = z.infer<typeof discoverVideoSchema>;
  export const discoverVideosPageSchema = z.object({ items: z.array(discoverVideoSchema), nextCursor: z.string().nullable() });
  export type DiscoverVideosPage = z.infer<typeof discoverVideosPageSchema>;
  ```
  (`followStateSchema` lives in shared already, used by `GET /creators/:slug/follow`. Import it; don't redefine it.)
- `apps/web/src/lib/api/discover.ts`: `fetchDiscoverVideosPage(cursor: string | null): Promise<DiscoverVideosPage>`. Body for now: `// shortcut: dummy reels until US-069 swaps this to GET /discover/videos.` Return 5 items (FREE, `videoCount: 1`, creators from the artboard `REELS`: captions in Bahasa Indonesia, follower counts) split into two pages, each parsed with `discoverVideosPageSchema`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `packages/shared/src/discover.ts` | Schemas + page size |
| MODIFY | `packages/shared/src/index.ts` | Export |
| CREATE | `packages/shared/src/discover.test.ts` | Schema accepts a valid page, rejects an item without `follow` |
| CREATE | `apps/web/src/lib/api/discover.ts` | Dummy source |

**Testing:**
- Shared schema test as above.

---

### TASK-218: Jelajahi page with tabs and video reels

- `apps/web/src/app/(public)/discover/page.tsx`: replace `ComingSoon`. Keep `metadata.title = 'Jelajahi'`. Read `searchParams.tab` (await it inside a `Suspense` child because `cacheComponents` is on) and render `<DiscoverView initialTab={tab === 'cari' ? 'cari' : 'video'} />`.
- `apps/web/src/components/discover/discover-view.tsx` (`'use client'`): a tab bar (`role="tablist"`, two `role="tab"` buttons with `aria-selected`, labels "Video" and "Cari", 44px targets, coral underline on the selected tab per artboard). Switching tabs updates the URL with `router.replace('/discover?tab=cari' | '/discover', { scroll: false })` and calls `pauseAllVideos()` when leaving Video. The Video panel mounts `DiscoverReels`; the Cari panel is a placeholder `<div>` that US-066 fills (render `null` content with the tab panel for now).
- `apps/web/src/components/discover/discover-reels.tsx`: `usePagedList(fetchDiscoverVideosPage, 'discover')`. Container: dark (`bg-[#141418]`), full height above the bottom nav, `snap-y snap-mandatory`, `aria-label="Video creator, geser ke atas untuk video berikutnya"`. The `sentinelRef` sits after the last item. States: loading skeleton (one dark full-height block), empty `Belum ada video.`, error `Gagal memuat video.` + "Coba lagi" (keeps loaded items, like `HomeFeed`).
- `apps/web/src/components/discover/reel-item.tsx`: `<section aria-label={`Video dari ${creator.displayName}`} className="relative h-full snap-start snap-always">`. Media: `useNearViewport` → `useMediaAccess(post.id, near)`; render the first VIDEO item with `<PostVideo item={…} className="h-full w-full object-cover" />`, otherwise a poster/gradient fallback. Overlay at the bottom (gradient): avatar + name (a `Link` to `/${slug}` with `aria-label={`Buka profil ${displayName}`}`), `formatCompactNumber(follow.followerCount)` + " pengikut" (reuse the existing compact formatter in `lib/format.ts`; add one only if none exists), caption through `ExpandableText` (2 lines), and `FollowButton slug initialFollowing={follow.following} onDark creatorName`. No `FollowButton` when the creator is the viewer (compare `slug` with `useCurrentUser()`'s `creatorSlug`, or pass the viewer's slug from the page; the API already excludes own posts, so this is a belt-and-braces check).
- Opening a profile records it in "Baru dilihat". That happens on the creator page itself (TASK-219), so no extra code here.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(public)/discover/page.tsx` | Tabs page instead of ComingSoon |
| CREATE | `apps/web/src/components/discover/discover-view.tsx` | Tab bar + panels |
| CREATE | `apps/web/src/components/discover/discover-reels.tsx` | Paged snap list |
| CREATE | `apps/web/src/components/discover/reel-item.tsx` | One reel |
| CREATE | `apps/web/src/components/discover/discover-view.test.tsx` | Component tests |

**Testing (Vitest + Testing Library, `{ wrapper: Toaster }`):**
- Video tab selected by default; `initialTab="cari"` selects Cari; clicking a tab calls `router.replace` with the right URL.
- Reels render the creator name, follower count and caption; the profile link points to `/{slug}`.
- `FollowButton` shows "Ikuti"/"Diikuti" from `follow.following`; it is hidden for the viewer's own creator slug.
- Only one `PostVideo` claims playback: mock `useMediaAccess` and assert `PostVideo` receives each item (the one-at-a-time rule is already covered by `video-playback.test.ts`).
- Empty and error states; "Coba lagi" reloads.
