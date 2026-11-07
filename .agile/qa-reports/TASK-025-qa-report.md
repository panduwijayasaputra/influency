# QA Report: TASK-025 — PostVideo player and single-playback store

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- `lib/video-playback.ts`:
  - `AUTOPLAY_VISIBLE_RATIO = 0.6`, labelled as an example value (spec §6.3 doesn't lock it).
  - A single `active` id with `claimPlayback` / `releasePlayback` (no-op unless the caller holds it) / `pauseAllVideos`.
  - `usePlaybackActive` uses `useSyncExternalStore` (server snapshot `false`).
  - `prefersTapToPlay` checks reduced motion or `saveData`, guarded for a missing `matchMedia`/`connection`.
- `components/post-video.tsx` (client):
  - **Playback rule:** `wants` = active slide ∧ visible ≥ ratio ∧ tab visible ∧ not tap mode ∧ not user-paused ∧ not failed. It claims while `wants`, and plays only while it holds the claim.
  - **Lazy source:** `preload="none"` plus the poster. The source is attached on the first play only: native `src` for `video` or Safari HLS, otherwise a dynamically imported hls.js. A refreshed URL reattaches at `currentTime` (hls `startPosition`, or `loadedmetadata` for native). hls is destroyed on unmount.
  - **Tap mode:**
    - when it applies: preference (via `useSyncExternalStore`, so SSR-safe), or a `NotAllowedError` from `play()`
    - a tap allows one playback; once it stops, it needs another tap (reset during render, not in an effect)
  - **Overlay:** a full-area "Putar video"/"Jeda video" button, with the play icon in tap mode or when user-paused; the m:ss duration pill (from the item, else `loadedmetadata`); a 44 px "Nyalakan suara"/"Matikan suara" button. With `nativeControls`, the overlay is skipped.
  - **Failure:** hls fatal / `error` → "Video tidak dapat diputar.".
  - `muted` is synced through the ref for iOS. `playsInline`, `controlsList="nodownload"`, `disablePictureInPicture`, and a blocked context menu.
- hls.js is pinned at `1.7.3` (≥ 2 weeks old) and loaded only through `import()`.
- Lint fixes made during dev:
  - `react-hooks/set-state-in-effect`: the preference became `useSyncExternalStore`, and the tap reset became render-time state adjustment.
  - `attach` moved inside the effect, so it isn't used before it is declared and the deps are honest.

### Security
- Video URLs come only from media-access (TASK-024) and are handled client-side; nothing is logged. Locked posts never render `PostVideo` (US-008 `LockedMedia`).

## Acceptance Criteria Verification
- Muted inline autoplay once mostly visible; the ratio is a configurable example value.
- One video at a time; inactive slide, viewport exit, background tab and `pauseAllVideos` all pause. Wiring the slide and sheets is TASK-026.
- Mute control labels and the m:ss duration; tap-to-play for blocked autoplay, reduced motion and data saving.
- Poster only before playing; no source attached → no video bytes.

## Tests Run
- `video-playback.test.ts` (2): one holder at a time, a stale release, pause all; reduced motion / saveData.
- `post-video.test.tsx` (13):
  - poster/`preload=none` and no src until 0.7 visible, then muted+inline play, and a pause on leaving
  - one at a time
  - an inactive slide never plays
  - a background tab pauses and resumes; pause-all
  - blocked autoplay → Putar video → plays
  - reduced motion waits for a tap, and needs another tap after scrolling away
  - mute toggle and 1:05
  - HLS through hls.js (destroyed on unmount) vs native
  - URL refresh → new instance with `startPosition: 12`
  - native controls without the overlay
  - `formatDuration` cases
- ESLint and tsc are clean for these files.

## Notes
- Paused videos don't resume by themselves when another video releases the claim or a sheet closes; tapping resumes. The spec only asks for the pauses.
- UAT: real autoplay and audio policy on iOS Safari and Android Chrome (jsdom stubs playback).
