# Technical Plan: US-023 — "Creator untukmu" Block

## Architecture Overview

`CreatorUntukmu` is a client carousel in `components/home-feed/`:
- It takes `creators: RecommendedCreator[]` and chunks them into pages of 3.
- Each page is a full-width CSS scroll-snap slide, with page dots below.
- The cards use a new `FollowButton`. In this story it is local only and shows a "Segera hadir" toast. US-024 wires it to the API.

`HomeFeed` decides where the block goes:
- after the 5th item
- after the last item when the feed ends with fewer than 5 items
- inside the empty state

Suggestions come from one swappable source, `fetchRecommendedCreators(ownSlug)`, which already returns the final contract.

## Dependencies

- None new. Mouse drag uses pointer events and `scrollLeft`, with no carousel library.

## Risks

- **Drag vs click:** a drag must not open a profile. Mitigation: after more than 5px of movement, suppress the click.

## Tasks

### TASK-136: Recommended-creators contract, interim source and carousel

**Shared** (`packages/shared/src/creators.ts`):
- `recommendedCreatorSchema = z.object({ slug, displayName, avatarUrl: nullable, bannerUrl: nullable, followerCount: z.int() })`
- `recommendedCreatorListSchema = z.object({ creators: z.array(recommendedCreatorSchema) })`
- `export const RECOMMENDED_CREATORS_LIMIT = 15;`

**Web data source:**
- `lib/demo.ts`: add `DEMO_RECOMMENDED_SLUGS = ['claudiandreya', 'creatorb']` with a `shortcut:` comment ("until US-026").
- `lib/api/recommended-creators.ts`, client: `fetchRecommendedCreators(ownSlug): Promise<RecommendedCreator[]>`.
  - Interim body: fetch `/${API_PREFIX}/creators/${slug}` for each demo slug and skip 404s.
  - Drop `ownSlug`, map to `followerCount: 0`, and slice to the limit.

**Follow button:** new `components/follow-button.tsx` (`'use client'`), `FollowButton({ slug, creatorName, initialFollowing = false, size })`.
- It is a `Button` with `aria-pressed`, label "Ikuti"/"Diikuti" and `aria-label` `${label} ${creatorName}`.
- On click it toggles local state and calls `toast('Segera hadir')`.
- `ProfileActions` switches its inline Ikuti button to `FollowButton` (variants `secondary`/`outline` as today), so US-024 changes one component.

**Carousel:** new `components/home-feed/creator-untukmu.tsx`.
- `<section aria-label="Creator untukmu">` with the header `h2` "Creator untukmu" and a `Link` "Jelajahi" to `/discover` (min-h-11).
- The track is `flex overflow-x-auto snap-x snap-mandatory`, with the scrollbar hidden.
- **Slides:** each page is a `role="group" aria-roledescription="slide" aria-label="Halaman i dari n"`, `basis-full shrink-0 snap-start`, holding 3 cards. The track gets `aria-roledescription="carousel"` and `aria-label="Creator untukmu, geser untuk lainnya"`.
- **Card:**
  - height 200px, `rounded-2xl` and `overflow-hidden`
  - background is `bannerUrl` (`<img>` object-cover) or a brand gradient, with a bottom gradient overlay
  - a `Link` to `/${slug}` wraps the avatar (initials fallback), the name and `@slug`
  - a `FollowButton` on the right, as a sibling so it is not nested in the link
- **Mouse drag:** on `pointerdown` with `pointerType === 'mouse'`, store `x` and `scrollLeft`. On move, set `scrollLeft`. On up, snap is left to CSS. If the pointer moved more than 5px, swallow the next click in the capture phase.
- **Dots:** `aria-hidden`, one per page. The active page is `Math.round(scrollLeft / clientWidth)` from `onScroll`. The active dot is wider.
- Keyboard: links and buttons are tabbable. Focusing a card scrolls it into view natively.
- Return null when `creators.length === 0`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/creators.ts` | schema + limit |
| MODIFY | `apps/web/src/lib/demo.ts` | demo slugs |
| CREATE | `apps/web/src/lib/api/recommended-creators.ts` (+ `.test.ts`) | interim source |
| CREATE | `apps/web/src/components/follow-button.tsx` (+ `.test.tsx`) | Ikuti toggle |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/profile-actions.tsx` (+ test) | use FollowButton |
| CREATE | `apps/web/src/components/home-feed/creator-untukmu.tsx` (+ `.test.tsx`) | carousel |

**Testing:**
- 7 creators give 3 slide groups and 3 dots, and 0 creators render nothing.
- A card links to `/slug`.
- Ikuti toggles `aria-pressed` and shows the "Segera hadir" toast.
- A mouse drag of more than 5px does not navigate.
- The source drops the own slug and skips 404s.
- The `profile-actions` tests still pass.

---

### TASK-137: Place the block in the Home feed

- `HomeFeed` fetches suggestions once on mount with `fetchRecommendedCreators(ownSlug)`. A failure leaves the list empty and hides the block silently.
- **Placement:**
  - when `items.length >= 5`, render `<CreatorUntukmu>` between item 5 and item 6
  - when the feed is done and `0 < items.length < 5`, render it after the last item
  - in the empty state, render it under the empty copy
- Render the block only once.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/components/home-feed/home-feed.tsx` | placement |
| MODIFY | `apps/web/src/components/home-feed/home-feed.test.tsx` | placement tests |

**Testing:**
- 6 items: the block sits after the 5th card.
- 3 items with the feed done: the block is last.
- 3 items with more pages left: no block yet.
- Empty feed: the block is shown.
- No suggestions: no section.
