# QA Report: TASK-026: Wire autoplay into PostCard, sheets and the post page

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- **`MediaItemView`** renders `PostVideo` for VIDEO and passes `active` and `nativeControls` through. The iframe branch and the old bare `<video>` are removed.
- **`PostMediaViewer`** (post page) passes `nativeControls`, so seeking still works. Muted autoplay applies there too (Option B).
- **`AccessibleMedia`** (PostCard) passes `active={i === index}`, so only the shown slide plays. Swiping drops the claim, and the old video pauses.
- **`BottomSheet`** calls `pauseAllVideos()` when `open` becomes true. This covers every sheet: purchase, report and the coming comments sheet.
- **`frontend.md`** documents the playback rules:
  - `PostVideo` only, never an iframe
  - the source is attached on first play
  - `claimPlayback` / `pauseAllVideos`
  - US-013 must pause too
- **Test setup:** a global IntersectionObserver stub in `vitest.setup.ts` was tried and reverted. It made `next/link` start using IO in every test. The viewer test stubs it locally instead.

### Security
- Locked premium is unchanged: `LockedMedia` renders no `<video>` and never calls media-access (the US-008 tests still pass).
- There are no third-party iframes or scripts any more. hls.js is bundled, not loaded from a CDN.

## Acceptance Criteria Verification
- [x] An accessible video autoplays muted and inline once 60 % is visible (example threshold).
- [x] One at a time, and the active slide only. It pauses on slide change, leaving the viewport, a background tab, or a sheet opening.
- [x] A locked premium video never autoplays, and only its preview shows.
- [x] Nyalakan/Matikan suara, the m:ss duration, and tap-to-play for blocked autoplay, reduced motion or data saving.
- [x] Lazy: the poster only, with no source until it plays.

## Tests Run
- `post-card.test.tsx`: a new [video, image] carousel test. Slide 1 plays and shows 1:05; scrolling to slide 2 → "Media 2/2" and the video is paused. The IO stub now reports `intersectionRatio: 1`.
- `bottom-sheet.test.tsx`: opening the sheet clears a claimed video.
- `post-media-viewer.test.tsx`: no iframe; both videos have native controls and `nodownload`; the Stream poster is set, the stub has no poster; no `src` before playing; 3 watermarks.
- `pnpm check` green: shared 212, web 411, api 643. The web build compiles, and both creator routes stay partial prerenders.

## Notes
- Manual UAT on iOS Safari and Android Chrome at 320–430 px:
  - muted autoplay at about 60 % visible
  - swiping pauses
  - Buka → the sheet pauses it
  - a background tab pauses it
  - reduced motion → play button
  - Network shows no video requests before playing
  - Stream sandbox HLS loads (CORS)
