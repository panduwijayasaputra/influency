# Technical Plan: US-040 — Koleksi Saya Page UI

## Architecture Overview

`/library` becomes a client list view (`LibraryView`) under a thin server page that checks the session like Home does. The view talks to **one function**, `fetchLibraryPage(query)` in `lib/api/library.ts`. It takes the final query (`relation`, `creator`, `media`, `sort`, `cursor`) and returns the final response shape, so US-045 only swaps that function's body for the real `GET /me/library`. Filters are therefore applied by the data function, not the component: a filter change resets the list and refetches, exactly as it will with the real API.

Until US-045 the function is a **dummy**: it reads the real Home feed (`fetchHomeFeedPage`, so locked/unlocked access and media loading are real), takes up to 9 items, flags them saved / purchased / both by position, and applies the filters and sort in memory. The dummy is clearly marked and deleted in US-045.

Shared building blocks (used again by US-041/042): `usePagedList` hook, `SegmentedControl`, `ViewToggle`, `ListSkeleton` / `ListEmpty` / `ListError`. `GridTile` (profile Grid) gets two optional props so the collection can reuse it.

Guests: `src/proxy.ts` already redirects cookie-less visitors to `/login?returnTo=/library` (default-deny, `/library` is not an `isGuestPath`). The page also redirects when the session is revoked (same pattern as `app/page.tsx`).

## Dependencies

- None to install. Uses `lucide-react`, Radix and existing components.
- Shared schemas land in a new `packages/shared/src/user-area.ts` (US-041/042/047 add to it).

## Risks

- The dummy depends on the Home feed having posts. With none the page shows the empty state, which is a valid state. Mitigation: the seed already has free and premium posts.
- Filters that refetch could race. Mitigation: `usePagedList` ignores responses from a stale request key.
- `GridTile` change must not alter the profile Grid. Mitigation: both new props are optional with the old defaults, and `post-grid.test.tsx` stays green.

## Tasks

### TASK-171: Library schemas, dummy `fetchLibraryPage` and `usePagedList` hook

**Shared schemas** (`packages/shared/src/user-area.ts`, export from `index.ts`):

```ts
export const LIBRARY_RELATIONS = ['all', 'saved', 'purchased'] as const;
export const LIBRARY_MEDIA = ['all', 'image', 'video'] as const;
export const LIBRARY_SORTS = ['recent', 'oldest'] as const;
export const LIBRARY_PAGE_SIZE = 12;

export const libraryQuerySchema = z.object({
  relation: z.enum(LIBRARY_RELATIONS).default('all'),
  media: z.enum(LIBRARY_MEDIA).default('all'),
  sort: z.enum(LIBRARY_SORTS).default('recent'),
  creator: z.string().optional(),          // creator slug, case-insensitive
  cursor: z.string().optional(),
});
export type LibraryQuery = z.infer<typeof libraryQuerySchema>;

export const libraryItemSchema = homeFeedItemSchema.extend({
  saved: z.boolean(),
  purchased: z.boolean(),
  addedAt: z.string(),                     // ISO: later of saved / purchased time
});
export const libraryPageSchema = z.object({
  items: z.array(libraryItemSchema),
  nextCursor: z.string().nullable(),
  creators: z.array(z.object({ slug: z.string(), displayName: z.string() })), // dropdown options; [] on pages after the first
});
```

`homeFeedItemSchema` comes from `posts.ts`. Import it with a `.js` suffix.

**Web data function** `apps/web/src/lib/api/library.ts`:
`export async function fetchLibraryPage(query: LibraryQuery): Promise<LibraryPage>`.
Dummy body (mark with `// DUMMY: US-045 replaces this body with GET /me/library`): load `fetchHomeFeedPage(null)`, take the first 9 items, set `saved`/`purchased` by index (`i%3`: 0 saved, 1 purchased, 2 both), `addedAt` = now minus `i` hours, then filter by `relation`, `creator`, `media` (an item matches `image` if `imageCount > 0`, `video` if `videoCount > 0`), sort by `addedAt`, no paging (`nextCursor: null`). Build `creators` from the filtered-out unfiltered set (distinct slug + displayName). Validate with `libraryPageSchema.parse`. A failed feed fetch throws (the view shows its error state).

**Hook** `apps/web/src/lib/use-paged-list.ts`:
`usePagedList<T extends { id: string }>(load: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>, key: string)` returns `{ items, status: 'loading'|'idle'|'error'|'done', loadingMore, loadMore(), retry(), sentinelRef }`.
- Resets and reloads when `key` changes. Ignores a response whose key is stale (compare a ref).
- De-duplicates by `id` when appending (as `HomeFeed` does).
- `sentinelRef` is an IntersectionObserver target that calls `loadMore` when visible and status is `idle`.
- Start loads from a `setTimeout(…, 0)` callback (the lint rule `react-hooks/set-state-in-effect` forbids setting state in the effect body; copy the `HomeFeed` pattern).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `packages/shared/src/user-area.ts` | library query / item / page schemas + constants |
| MODIFY | `packages/shared/src/index.ts` | `export * from './user-area.js'` |
| CREATE | `apps/web/src/lib/api/library.ts` | `fetchLibraryPage` (dummy) |
| CREATE | `apps/web/src/lib/api/library.test.ts` | dummy filter/sort tests |
| CREATE | `apps/web/src/lib/use-paged-list.ts` | paging hook |
| CREATE | `apps/web/src/lib/use-paged-list.test.tsx` | hook tests |

**Testing:**
- `fetchLibraryPage` (mock `fetchHomeFeedPage`): relation `saved` includes the "both" items, `purchased` likewise; creator filter; media filter; `oldest` reverses `recent`; empty feed → empty page.
- `usePagedList`: first load, append with de-dupe, `retry` after error, key change resets and drops a stale response, no `loadMore` while `done`.

---

### TASK-172: Shared list-page UI blocks and `GridTile` options

Create `apps/web/src/components/user-area/`:

- `segmented-control.tsx`: `SegmentedControl<T extends string>({ label, value, options: {value:T; label:string}[], onChange })`. A `role="group"` with `aria-label`, buttons with `aria-pressed`, ≥44px touch height (`h-11`), selected button has the white pill style from the design (`bg-card shadow-sm font-bold`), track `bg-muted rounded-xl p-[3px]`. Tokens only (Light Social, no raw hex).
- `view-toggle.tsx`: `ViewToggle({ value: 'grid'|'list', onChange })` using `lucide-react` `LayoutGrid` and `Rows3`, labels `aria-label="Tampilan grid"` / `"Tampilan vertikal"`, `aria-pressed`.
- `list-states.tsx`: `ListSkeleton({ variant: 'grid'|'cards', label })` (`aria-busy`, `aria-label`), `ListEmpty({ title, body, action? })`, `ListError({ onRetry })` with "Coba lagi" (reuse `Button`).
- `labeled-select.tsx`: native `<select>` with a visible or `sr-only` `<label>`, 44px height, rounded-xl border, for the creator and sort dropdowns (the design uses native selects).

Modify `components/post-grid/grid-tile.tsx`: add optional `tag?: string` (small white pill, bottom-left, "Disimpan"/"Dibeli") and `aspect?: 'square' | 'portrait'` (default `'square'`; `portrait` = `aspect-[3/4]`). Do not change existing behaviour when both are omitted.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/user-area/segmented-control.tsx` (+ `.test.tsx`) | filter control |
| CREATE | `apps/web/src/components/user-area/view-toggle.tsx` (+ test) | Grid / Vertikal |
| CREATE | `apps/web/src/components/user-area/list-states.tsx` (+ test) | skeleton, empty, error |
| CREATE | `apps/web/src/components/user-area/labeled-select.tsx` | native select with label |
| MODIFY | `apps/web/src/components/post-grid/grid-tile.tsx` | `tag`, `aspect` props |
| MODIFY | `apps/web/src/components/post-grid/post-grid.test.tsx` | cover the new props, old behaviour unchanged |

**Testing:** `aria-pressed` follows the value and `onChange` fires with the clicked option; keyboard (Tab/Enter/Space); `ListError` calls `onRetry`; `GridTile` shows the tag, uses `aspect-[3/4]` for `portrait`, and the profile Grid renders as before.

---

### TASK-173: `LibraryView` and the `/library` page

**Page** `apps/web/src/app/(public)/library/page.tsx` (replace the `ComingSoon` stub):

```tsx
export const metadata = { title: 'Koleksi Saya' };
export default function Page() { return <Suspense fallback={null}><Library /></Suspense>; }
export async function Library() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(loginHref('/library'));
  return (<><PageHeader title="Koleksi Saya" asHeading fallbackHref="/" /><LibraryView /></>);
}
```

**Component** `apps/web/src/components/library/library-view.tsx` (`'use client'`):
- State: `relation`, `media`, `sort`, `creator` (`'all'` = none), `view` (`'grid'|'list'`, default grid).
- Data: `usePagedList((cursor) => fetchLibraryPage({ relation, media, sort, creator: creator === 'all' ? undefined : creator, cursor: cursor ?? undefined }), key)` with `key = [relation, media, sort, creator].join('|')`.
- Creator dropdown options come from the first page's `creators` (keep them in state when the first page of the current key arrives; do not clear them on a refetch, or the selected creator would vanish). First option "Semua creator".
- Controls, in design order: creator select; `SegmentedControl` Semua / Disimpan / Dibeli; media `SegmentedControl` Semua / Gambar / Video; row with sort select ("Terbaru ditambahkan" / "Terlama") and `ViewToggle`. Sticky is not required.
- Grid view: `grid grid-cols-3 gap-0.5` of `GridTile` with `aspect="portrait"`, `tag={item.purchased ? 'Dibeli' : 'Disimpan'}`, `href=/{creator.slug}/posts/{id}`, `creator` from `item.creator`. Locked tiles open the post detail (existing GridTile behaviour), unlocked open `MediaViewer`.
- List view: `PostCard` per item with `linkCreator`, as in `HomeFeed`.
- States: `ListSkeleton` while loading; `ListEmpty` "Belum ada apa-apa" / "Simpan post dengan ikon penanda, atau buka post premium, dan semuanya muncul di sini." when no filter is active, and "Tidak ada hasil" / "Coba ubah filter." when a filter is active; `ListError` with retry; sentinel at the bottom; end note.
- Footnote under the list: "Menyimpan post premium tidak membukanya. Post yang disimpan dan dibeli hanya tampil sekali."

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(public)/library/page.tsx` | real page, session check |
| CREATE | `apps/web/src/components/library/library-view.tsx` | the view |
| CREATE | `apps/web/src/components/library/library-view.test.tsx` | component tests |
| MODIFY | `.agile/guidelines/codebase-map.md` | `/library` page, `components/library`, `components/user-area`, `usePagedList` |

**Testing** (Vitest + Testing Library, mock `@/lib/api/library`, wrap in `Toaster`):
- Renders title controls with no "Liked"/"Disukai" option.
- Changing relation / media / sort / creator calls `fetchLibraryPage` with the right query and resets the list.
- Grid tiles carry the right tag; an item that is saved and purchased shows "Dibeli" once.
- Locked tile links to the post page; no media-access request for locked items.
- Toggling to Vertikal renders `PostCard`s.
- Empty (no filters), empty (filter active), error + retry, loading skeleton.
- Page-level: redirect when `getCurrentUser` is null.

## Suggested order

TASK-171 → TASK-172 → TASK-173.
