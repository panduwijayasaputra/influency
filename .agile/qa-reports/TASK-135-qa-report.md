# QA Report: TASK-135 — HomeFeed component and Home page

**Result:** PASS

## Review
- **Page:** `/` keeps the `getCurrentUser` redirect (guest or API outage → login), then renders `HomeTopBar` + `AccountDrawer` and `HomeFeed`. A creator's own slug is passed so the interim source drops their posts. A lookup failure means "none"; the API will decide once US-025 lands. An sr-only `h1` "Beranda" replaces the ComingSoon heading.
- **Infinite scroll:** a sentinel plus `IntersectionObserver` (400 px margin) is re-created after every page, so a page that leaves the sentinel in view loads the next one. `useNearViewport` was not reused because it latches true and would load every page back to back. An in-flight guard prevents double loads, and pages are de-duplicated by id.
- **States:** skeleton with `aria-busy`, "Memuat…" status, error with "Coba lagi" (the first-page failure replaces the list; a later failure keeps the loaded posts and retries the same cursor), end note, and the empty state with a Jelajahi link to `/discover`.
- **PostCard:** new opt-in `linkCreator` makes the avatar and name open `/{slug}`. The creator page is unchanged. Muted autoplay, comments sheet, viewer and purchase sheet are untouched. Overlays do not unmount the list, so scroll position is kept.
- **Lint:** `react-hooks/set-state-in-effect` forbids setting state from an effect body, so loads start from callbacks (a 0 ms timer for the first page, the observer callback and click handlers for the rest).
- **Guidelines:** `frontend.md` updated (Home bullet).

## Tests
- `home-feed.test.tsx`: skeleton → posts with the creator link, next page near the end without duplicates, page-2 failure keeps page 1 and retries the same cursor, first-page failure and retry, empty state link, end note.
- `page.test.tsx`: signed-in user sees the top bar, drawer and feed; a creator's own slug is passed; guest and API outage redirect to login.
- `post-card.test.tsx`: the creator link appears only with `linkCreator`.
- `pnpm check` passes (format, lint, typecheck; shared 226, web 549, api 719).

## Notes
- Not checked in a real browser: infinite scroll with real scrolling, and the hide-on-scroll top bar with the feed's height.
- Acceptance criterion "dummy posts include free, locked premium and video posts": the interim source shows real published posts of the demo creators instead (as planned), so those kinds appear only once such posts exist.
