# Technical Plan: US-066 — Jelajahi Cari Tab UI

## Architecture Overview

The Cari panel of `DiscoverView` (TASK-218) gets a search input, debounced results and a "Baru dilihat" list.

- **"Baru dilihat"** is a small browser-storage store (`lib/recent-creators.ts`) read through `useSyncExternalStore`. The public creator page writes to it through a tiny client component. That covers every way a profile is opened (reels, search, feed, bio link) with one write site.
- **Results** come from `searchCreators(q)` in `lib/api/discover.ts`: a dummy filter until US-070 swaps it to `GET /discover/creators?q=`.
- The Beranda top-bar search icon already links to `/discover`. Change it to `/discover?tab=cari`. The input gets `autoFocus` when the page opens with `tab=cari`.

## Dependencies

- TASK-217 (`lib/api/discover.ts`) and TASK-218 (`DiscoverView`).

## Risks

- **Storage can be unavailable** (private mode, blocked). Every read/write is wrapped in try/catch; on failure the list is simply empty.
- **Stale entries.** A creator in storage may later be suspended. The row still links to `/{slug}`, which shows the normal not-found page. Acceptable; no server lookup.

## Tasks

### TASK-219: Recent creators store + recording on the creator page

- `apps/web/src/lib/recent-creators.ts`:
  ```ts
  export type RecentCreator = { slug: string; displayName: string; avatarUrl: string | null };
  export const RECENT_CREATORS_KEY = 'influency:recent-creators';
  export const RECENT_CREATORS_MAX = 20;
  export function addRecentCreator(c: RecentCreator): void      // de-dupe by slug, move to front, cap at 20
  export function removeRecentCreator(slug: string): void
  export function useRecentCreators(): RecentCreator[]          // useSyncExternalStore; server snapshot []
  ```
  Parse with a Zod array schema; on any parse/storage error return `[]`. Notify subscribers with an in-module listener set plus the `storage` event (other tabs). Cache the parsed snapshot by the raw string so `getSnapshot` returns a stable reference.
- `apps/web/src/components/record-recent-creator.tsx` (`'use client'`): `useEffect(() => addRecentCreator(creator), [creator.slug])`, renders nothing.
- Mount it in `apps/web/src/app/(public)/[creatorSlug]/page.tsx` where the public creator (`getPublicCreator`) is available: `<RecordRecentCreator creator={{ slug, displayName, avatarUrl }} />`. Do not record the viewer's own profile; the page knows the owner via the existing owner check, so skip it there if easily available. Otherwise recording your own profile is harmless.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/recent-creators.ts` | Device-local store |
| CREATE | `apps/web/src/lib/recent-creators.test.ts` | Store tests |
| CREATE | `apps/web/src/components/record-recent-creator.tsx` | Writes on profile open |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.tsx` | Mount the recorder |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.test.tsx` | Only if the mount breaks existing assertions |

**Testing:**
- add: newest first, de-duplicates and moves to front, caps at 20; remove; corrupt JSON → `[]`; `localStorage.setItem` throwing → no crash.

---

### TASK-220: Cari tab UI

- `apps/web/src/lib/api/discover.ts`: add `searchCreators(q: string): Promise<CreatorSearchResult[]>`, typed by a new shared schema in `packages/shared/src/discover.ts`:
  ```ts
  export const CREATOR_SEARCH_MAX_LENGTH = 50;
  export const creatorSearchQuerySchema = z.object({ q: z.string().trim().min(1).max(CREATOR_SEARCH_MAX_LENGTH) });
  export const creatorSearchResultSchema = z.object({ slug: z.string(), displayName: z.string(), avatarUrl: z.string().nullable() });
  export const creatorSearchResponseSchema = z.object({ creators: z.array(creatorSearchResultSchema) });
  ```
  Body: `// shortcut: dummy list until US-070 swaps this to GET /discover/creators.` Filter about 8 dummy creators by name/slug, case-insensitive.
- `apps/web/src/components/discover/creator-search.tsx` (`'use client'`), rendered in the Cari panel of `DiscoverView`:
  - Visually hidden `<label htmlFor="discover-search">Cari creator</label>` + `<input id="discover-search" type="search" placeholder="Cari creator" maxLength={50} autoComplete="off">` with a search icon, `autoFocus` when `initialTab === 'cari'`, 48px tall, 16px font (no iOS zoom).
  - 300 ms debounce. Ignore responses for an older query (compare the query ref). Results: `<section aria-label="Hasil pencarian">` rows (avatar/initials, name, `@slug`), each a `Link` to `/${slug}`. No match: `Tidak ada creator yang cocok dengan "{q}".` Error: `Pencarian gagal.` + "Coba lagi".
  - Empty query: `<section aria-label="Baru dilihat">` with `<h2>Baru dilihat</h2>`, the first 5 of `useRecentCreators()`, "Lihat semua" (only when more than 5) expands. Each row: a `Link` + a 44px remove button `aria-label={`Hapus ${displayName} dari baru dilihat`}` → `removeRecentCreator`. None: `Creator yang kamu lihat akan muncul di sini.`
- `apps/web/src/components/home-top-bar.tsx`: the search link `href="/discover?tab=cari"` (update its test).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/discover.ts` | Search schemas |
| MODIFY | `apps/web/src/lib/api/discover.ts` | `searchCreators` (dummy) |
| CREATE | `apps/web/src/components/discover/creator-search.tsx` | Cari panel |
| CREATE | `apps/web/src/components/discover/creator-search.test.tsx` | Tests |
| MODIFY | `apps/web/src/components/discover/discover-view.tsx` | Mount `CreatorSearch` |
| MODIFY | `apps/web/src/components/home-top-bar.tsx` (+ test) | Search icon → Cari tab |

**Testing (fake timers for the debounce):**
- Typing shows matching rows linking to `/{slug}`; no match shows the empty text with the query; a slow older response doesn't overwrite a newer one.
- Empty query shows "Baru dilihat" from storage: 5 rows + "Lihat semua" → all; remove drops a row; nothing stored → hint text.
- Top-bar search link targets `/discover?tab=cari`.
