# Technical Plan: US-011 — Postingan and Grid Tabs

## Architecture Overview

Agreed with the user (2026-11-07):

- **Web only.** No API, shared-schema or DB change.
- **One feed fetch, client tabs.**
  - `CreatorPosts` (server) still fetches `getPublicPosts` once and keeps its error message ("Konten belum bisa dimuat.") and empty message ("Belum ada konten yang dipublikasikan."). Both show regardless of the tab, and the profile header is unaffected.
  - With posts, it renders the new client `CreatorContent`, which holds the Radix `Tabs` (`radix-ui`) for **Postingan** and **Grid**. Radix gives `role="tablist"`/`tab`/`tabpanel` and `aria-selected`, so the current tab is announced.
  - The tabs are not sticky.
- **Tab in the URL.** The value comes from `useSearchParams().get('tab') === 'grid' ? 'grid' : 'posts'`.
  - Changing it calls `router.replace(`${pathname}?tab=grid` | pathname, { scroll: false })`, so it survives a reload. Postingan is the default and drops the query.
  - Only the active panel is mounted (Radix default), so the cards and tiles of the hidden tab don't fetch media.
- **Grid** has one square tile per post, showing the post's **first media** (`post.media[0]`). The tile's kind and duration come from that entry, with no media-access needed.
  - **Locked** (`access === 'locked'`): `PremiumCover` (blurred preview or lock placeholder) with a lock badge. It never calls media-access.
  - **Accessible**: once the tile nears the viewport, `useMediaAccess(post.id, near)` and the first item's image (`url` for IMAGE, `posterUrl` for VIDEO). While loading, or on failure, the tile shows a muted square.
  - **Video tile** (`media[0].kind === 'VIDEO'`): the `formatDuration` badge when `durationSeconds` is known.
  - **Tap**: every tile links to `/{slug}/posts/{id}` for now. US-013 swaps the accessible tiles to open the full-screen viewer.
- **Filters** are local state and not in the URL.
  - Media `<select>` (Semua / Foto / Video) matches the first media kind.
  - Akses radio group (Semua / Gratis / Premium) matches `visibility`.
  - The two filters combine (AND). With no match: "Tidak ada yang cocok" plus "Coba filter lain."
- The old Gratis/Premium chip grid is already gone (`PostGrid` was deleted in US-008). Remove the "Konten" `h2` wrapper; the tabs take its place.

## Dependencies

- None new. Uses `radix-ui` `Tabs`, `useMediaAccess`, `PremiumCover`, `formatDuration` (`components/post-video.tsx`), `PostCard`, and the US-008 `useNearViewport`, which moves to `lib/`.

## Risks

- **The media-access rate limit (60/min, placeholder).** Each visible accessible tile is one call, roughly 15 per screen. Fast scrolling plus reloads can hit 429, and the tile then just stays muted.
  - Mitigation: lazy loading at 200 px, and only the active tab is mounted.
  - `// shortcut:` comment in `grid-tile.tsx`: "one media-access call per tile; add a batch thumbnails endpoint if 429s show up."
- **Tiles load full-size originals.** This is acceptable for the MVP; the same shortcut comment covers it.
- **Content without a first media entry** (shouldn't happen for published posts). The tile treats it as an image tile with a muted square.

## Tasks

### TASK-097: PostGrid with tiles and Media/Akses filters

1. **Move `useNearViewport`** from `components/post-card/post-media.tsx` to `lib/use-near-viewport.ts` (export it unchanged) and import it in `post-media.tsx`.
2. **`components/post-grid/grid-tile.tsx`** (`'use client'`): `GridTile({ post, href }: { post: PublicPost; href: string })`.
   - It renders `<Link href={href} aria-label={label} className="relative block aspect-square overflow-hidden bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">`.
   - `label` is e.g. `Post premium terkunci · 2 foto · 1 video` or `Post · 1 video`. Build it from `mediaSummary(post)` (exported from `post-media.tsx`) and the locked state.
   - **Locked**: `<PremiumCover previewUrl={post.previewUrl} className="aspect-square rounded-none" />`, plus a top-right `Lock` badge (`absolute top-1.5 right-1.5 rounded-full bg-black/50 p-1 text-white`, icon `size-3.5`). Never call `useMediaAccess`.
   - **Accessible**: `const near = useNearViewport(ref)`, then `const { state } = useMediaAccess(post.id, near)`.
     - On `ready`, `item = state.access.media[0]`, and `src = item.kind === 'IMAGE' ? item.url : item.posterUrl`.
     - Render `<img src alt="" loading="lazy" className="size-full object-cover" />` when `src` is set, else nothing (the muted background shows).
     - Add the shortcut comment from Risks.
   - **Video badge**, when `post.media[0]?.kind === 'VIDEO'`: bottom-left `rounded bg-black/60 px-1.5 text-[11px] font-semibold text-white`, with a `Play` icon plus `formatDuration(durationSeconds)` when it is not null.
3. **`components/post-grid/post-grid.tsx`** (`'use client'`): `PostGrid({ posts, creatorSlug }: { posts: PublicPost[]; creatorSlug: string })`.
   - State: `media: 'ALL' | 'IMAGE' | 'VIDEO'`, `access: 'ALL' | 'FREE' | 'PREMIUM'`.
   - Pure, exported helper: `filterPosts(posts, media, access)`.
     - Media: `media === 'ALL' || post.media[0]?.kind === media`.
     - Akses: `access === 'ALL' || post.visibility === access`.
   - Toolbar (`flex items-center justify-between gap-2 px-4 py-2`):
     - **Media**: a `<label>` "Media" (`sr-only`) plus a native `<select>` with options Semua / Foto / Video, `h-11 rounded-md border border-input bg-card px-3 text-sm font-semibold`.
     - **Akses**: `<div role="radiogroup" aria-label="Akses" className="flex rounded-sm bg-muted p-1">` with three `<button role="radio" aria-checked>` for Semua / Gratis / Premium. Each is `min-h-11 px-3 text-sm font-semibold rounded-sm`; the selected one is `bg-card shadow-sm`.
   - Grid: `grid grid-cols-3 gap-0.5`, one `GridTile` per filtered post, with `href = /${creatorSlug}/posts/${post.id}`.
   - No match: `<p>` with **Tidak ada yang cocok** (bold) and "Coba filter lain." (`text-muted-foreground`), centred, `p-8`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/use-near-viewport.ts` | Moved hook |
| MODIFY | `apps/web/src/components/post-card/post-media.tsx` | Import the moved hook |
| CREATE | `apps/web/src/components/post-grid/grid-tile.tsx` | One square tile |
| CREATE | `apps/web/src/components/post-grid/post-grid.tsx` | Filters + grid |
| CREATE | `apps/web/src/components/post-grid/post-grid.test.tsx` | Tests |

**Testing** (`post-grid.test.tsx`, `wrapper: Toaster` not needed; mock `fetch` / `IntersectionObserver` the way `post-card.test.tsx` does):
- `filterPosts` covers every Media × Akses combination on a fixture: an image free post, a video free post, an image premium post, a video premium post, and a mixed post with an image first (it counts as Foto only).
- Choosing Video and then Premium shows only the matching tile. A combination with no posts shows "Tidak ada yang cocok" and "Coba filter lain."
- A locked tile renders `previewUrl`, never calls `fetch` (media-access), and is labelled `terkunci`. Its link goes to the post detail.
- An accessible image tile, once near the viewport, fetches `/api/v1/posts/{id}/media-access` and renders the item's `url`. An accessible video tile renders `posterUrl`.
- A video tile shows `1:05` for `durationSeconds: 65`, and no time when it is null.
- `renderToString` of the grid contains no media-access URLs or storage URLs.
- `post-card.test.tsx` passes unchanged.

---

### TASK-098: Postingan / Grid tabs on the creator page

1. **`app/(public)/[creatorSlug]/creator-content.tsx`** (`'use client'`): `CreatorContent({ posts, creator }: { posts: PublicPost[]; creator: PostCardCreator })`.
   - `const params = useSearchParams(); const pathname = usePathname(); const router = useRouter();`
   - `tab = params.get('tab') === 'grid' ? 'grid' : 'posts'`.
   - `Tabs.Root value={tab} onValueChange={(v) => router.replace(v === 'grid' ? `${pathname}?tab=grid` : pathname, { scroll: false })}`.
   - `Tabs.List aria-label="Konten"` (`grid grid-cols-2 border-b`) with two `Tabs.Trigger`s, `posts` → **Postingan** and `grid` → **Grid**. Classes: `min-h-11 text-sm font-bold text-muted-foreground data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_-2px_0_var(--brand)]`. The active indicator uses the `brand` token and never carries text. Not sticky.
   - `Tabs.Content value="posts"`: the current `-mx-5 flex flex-col divide-y` PostCard list, moved from `creator-posts.tsx`.
   - `Tabs.Content value="grid"`: `<div className="-mx-5"><PostGrid posts={posts} creatorSlug={creator.slug} /></div>`.
   - Only the active content is mounted (the Radix default without `forceMount`).
2. **`creator-posts.tsx`**: keep the fetch and the two messages. With posts, return `<CreatorContent posts={posts} creator={creator} />`.
3. **`page.tsx`**: replace the `<section aria-labelledby="konten">` + `h2` with a plain `<div className="mt-4">` around the existing `Suspense` (the tab list is now labelled "Konten"). The fallback "Memuat konten…" stays.
   - `useSearchParams` sits inside that `Suspense`, which `cacheComponents` requires. No page-level `searchParams` read is needed.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/creator-content.tsx` | Tabs + URL state |
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/creator-content.test.tsx` | Tests |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/creator-posts.tsx` | Render CreatorContent |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/creator-posts.test.tsx` | Adjust expectations |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.tsx` | Drop the Konten section heading |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.test.tsx` | `region 'Konten'` → the fallback text / tablist |

**Testing** (`creator-content.test.tsx`; mock `next/navigation` with `useSearchParams`, `usePathname` → `/ana`, and `useRouter` → `{ replace }`):
- With no `tab`: the Postingan tab has `aria-selected="true"` and the PostCards are shown (an article per post, newest first, in the order given). There is no grid toolbar.
- With `?tab=grid`: the Grid tab is selected and the tiles and Media/Akses controls are shown. No PostCard articles are rendered.
- Clicking Grid calls `replace('/ana?tab=grid', { scroll: false })`. Clicking Postingan calls `replace('/ana', { scroll: false })`.
- An unknown `?tab=x` falls back to Postingan.
- `creator-posts.test.tsx`: the empty and error messages still render, and the tabs are not shown in either state.
- `page.test.tsx`: the existing tests pass, with the updated `Konten` assertion (the "Memuat konten…" fallback).
- Run `pnpm check`.
