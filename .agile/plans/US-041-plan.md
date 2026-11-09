# Technical Plan: US-041 — Diikuti Page UI

## Architecture Overview

`/following` becomes a client list view that calls one function, `fetchFollowingPage({ sort, cursor })` in `lib/api/following.ts`, shaped like the final `GET /me/following` response (US-046 swaps the body). It reuses the building blocks from US-040 (`usePagedList`, `ViewToggle`, `LabeledSelect`, list states).

Decision (confirmed): **no unfollow action on the cards.** The design cards only open the creator profile, where the existing `FollowButton` toggles. The list refetches on every visit (no client cache), so it stays in sync. The story criterion about an optimistic unfollow on the card is removed (see the story edit in this plan's TASK-175).

Dummy body: `fetchRecommendedCreators()` (real API) mapped to the following shape, so avatars and banners are real. `bio` is `null` in the dummy because that endpoint does not carry it. Sort `name` is applied in memory.

## Dependencies

- Needs US-040 TASK-171 (`user-area.ts`, `usePagedList`) and TASK-172 (UI blocks). Implement after US-040.

## Risks

- A creator card with no bio or cover must still look right. Mitigation: gradient/initials fallbacks as in `CreatorUntukmu` cards.
- Dummy count differs from the real total. Mitigation: the dummy returns `total = items.length`; the real value comes from the API in US-046.

## Tasks

### TASK-174: Following schema and dummy `fetchFollowingPage`

Add to `packages/shared/src/user-area.ts`:

```ts
export const FOLLOWING_SORTS = ['recent', 'name'] as const;
export const FOLLOWING_PAGE_SIZE = 20;
export const followingQuerySchema = z.object({
  sort: z.enum(FOLLOWING_SORTS).default('recent'),
  cursor: z.string().optional(),
});
export const followingCreatorSchema = z.object({
  slug: z.string(), displayName: z.string(),
  avatarUrl: z.string().nullable(), bannerUrl: z.string().nullable(),
  bio: z.string().nullable(),
});
export const followingPageSchema = z.object({
  creators: z.array(followingCreatorSchema),
  total: z.int(),
  nextCursor: z.string().nullable(),
});
```

Create `apps/web/src/lib/api/following.ts`: `fetchFollowingPage(query: FollowingQuery): Promise<FollowingPage>` (dummy, marked `// DUMMY: US-046 replaces this body with GET /me/following`): map `fetchRecommendedCreators()` result to `followingCreatorSchema`, sort in memory (`name` = `localeCompare` on `displayName` case-insensitive, `recent` keeps API order), `total` = length, `nextCursor` null, parse with `followingPageSchema`.

`usePagedList` needs items with `id`: the view maps `creator.slug` to `id` (`items.map(c => ({ ...c, id: c.slug }))` inside the load callback).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/user-area.ts` | following schemas |
| CREATE | `apps/web/src/lib/api/following.ts` (+ `.test.ts`) | dummy fetch |

**Testing:** sort `name` orders case-insensitively; `recent` keeps source order; schema rejects a page without `total`.

---

### TASK-175: `FollowingView` and the `/following` page

**Page** `apps/web/src/app/(public)/following/page.tsx`: same shape as US-040 (`getCurrentUser` or `redirect(loginHref('/following'))`), `PageHeader title="Diikuti" asHeading fallbackHref="/"`, then `<FollowingView />`.

**Component** `apps/web/src/components/following/following-view.tsx` (`'use client'`):
- Header row: count `"{total} creator"` (from the latest page; id-ID `Intl.NumberFormat`), sort select ("Terakhir diikuti" / "Nama A–Z"), `ViewToggle` (default grid: 2 columns `grid-cols-2`; list: 1 column).
- Card (a `Link` to `/{slug}`, `aria-label="Buka {displayName}"`): banner (image or `bg-muted` fallback), avatar overlapping (initials fallback), name, `@slug`, 2-line clamped bio when present. Card height is stable for missing bio.
- Copy under the header: "Mengikuti itu gratis dan terpisah dari berlangganan."
- States: skeleton, empty ("Kamu belum mengikuti siapa pun" + `Link` button **Jelajahi** to `/discover`), `ListError` with retry, end of list.

**Story edit (already applied by the Tech Lead; do not redo):** in `.agile/features/user-area/US-041-diikuti-page-ui.md` replace the third criterion with: "Cards have no unfollow action (per the design); following is toggled on the creator profile and the list refetches on every visit." Make the same edit in US-046's fourth criterion ("its unfollow action keeps…" becomes "the list reflects a follow or unfollow made on the creator profile after a refetch").

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(public)/following/page.tsx` | real page |
| CREATE | `apps/web/src/components/following/following-view.tsx` (+ `.test.tsx`) | view |
| MODIFY | `.agile/features/user-area/US-041-diikuti-page-ui.md`, `US-046-following-list-api.md` | AC edit above |
| MODIFY | `.agile/guidelines/codebase-map.md` | `/following` page and component |

**Testing:** cards link to `/{slug}`; count text; sort change refetches with `sort=name`; grid/list column classes; empty state links to `/discover`; error + retry; skeleton; no button inside a card other than the link; page redirects when logged out.

## Suggested order

TASK-174 → TASK-175.
