# Technical Plan: US-009 — Muted Video Autoplay in PostCard

## Architecture Overview

Agreed with the user (2026-11-07):

- **HLS in `<video>`, not the Stream iframe.** For Cloudflare Stream, media-access returns a signed HLS manifest URL (`player: 'hls'`). The stub keeps a signed file URL (`player: 'video'`). The browser plays HLS natively in Safari/iOS and through **hls.js** elsewhere, loaded with a dynamic `import()` only when an HLS video first plays. Every video is then one `<video>` element we fully control: play, pause, muted, and whether autoplay was blocked. The `iframe` player goes away everywhere, including the post detail page.
- **Signed `posterUrl`.** VIDEO items in media-access gain `posterUrl`, minted in the same call after the same access check:
  - Stream: the thumbnail on the same signed token.
  - Stub: a generated frame stored privately and served from a signed storage URL.
  - VIDEO items also carry `durationSeconds` from the DB row, so the card can show m:ss without matching items by index.
- **One video at a time.** A small module store in `lib/video-playback.ts` holds the id of the single video allowed to play:
  - a video **claims** it when it becomes eligible (active slide, at least `AUTOPLAY_VISIBLE_RATIO` visible, tab visible)
  - every other video pauses
  - `pauseAllVideos()` clears it, and `BottomSheet` calls it when it opens. This covers the purchase, report and future comments sheets, and the US-013 viewer.
- **Lazy loading.**
  - Before media-access returns, the card shows the US-008 4:5 frame; the existing 200 px `useNearViewport` gate still decides when to fetch.
  - Each `<video>` then renders with `preload="none"` and the poster only. Its source (native `src`, or `hls.loadSource`) is attached the **first time it should play**, so no video bytes load for a video nobody has watched.
- **Tap-to-play mode** is used when any of these holds:
  - `prefers-reduced-motion: reduce`
  - `navigator.connection?.saveData`
  - `play()` rejects (autoplay blocked)

  In this mode the video shows the poster with a centred play button. Tapping it plays, then still follows the one-at-a-time and pause rules.
- **Locked premium** is unchanged: `LockedMedia` never renders a video and never calls media-access (US-008).

## Dependencies

- `hls.js` **1.7.3** (2026-09-11, Apache-2.0, no install script), exact pin in `apps/web/package.json`. Load it with `import('hls.js')`, so it is not in the initial bundle.
- No env changes. `AUTOPLAY_VISIBLE_RATIO = 0.6` is a labelled example constant; the spec says the threshold is not LOCKED.

## Risks

- **Stream HLS CORS / allowed origins.** hls.js fetches the manifest and segments with XHR. Stream allows any origin unless the video has `allowedOrigins` set, and we don't set it. If segments fail in the sandbox account, check that first. This can't be verified here (stub only), so it is a UAT note.
- **Token expiry mid-playback.** media-access refreshes URLs 60 s before expiry; the TTL is 10–30 min. When the URL of a playing video changes, `PostVideo` reattaches the new source and seeks back to `currentTime`, so the refresh doesn't restart it.
- **iOS** needs `muted` and `playsInline` set before `play()`. Set them as props and keep `muted` in sync through the ref, because React doesn't reflect `muted` as an attribute reliably.
- **jsdom has no media playback.** Tests stub `HTMLMediaElement.prototype.play/pause`, `matchMedia` and `IntersectionObserver`; real autoplay is UAT.

## Tasks

### TASK-024: Signed HLS playback and poster in media-access

Replace the Stream iframe with HLS, and add a poster and duration to VIDEO items.

1. **`apps/api/src/common/video-provider.ts`:** change `VideoPlayback` to `{ url: string; posterUrl: string | null; player: 'hls' | 'video'; expiresAt: Date }`, and update its doc comment (`hls` = HLS manifest, `video` = a file).
2. **`cloudflare-stream-video-provider.ts` `createPlaybackUrl`:** keep the single token mint (`{ exp, downloadable: false }`) and return:
   - `url: `${signed.base}/manifest/video.m3u8``
   - `posterUrl: `${signed.base}/thumbnails/thumbnail.jpg?fit=clip``
   - `player: 'hls'`

   Same `expiresAt`. Update the doc comment. The shortcut comment stays.
3. **`stub-video-provider.ts` `createPlaybackUrl`:**
   - Add `const THUMB_PREFIX = 'post-video-thumb/'`.
   - When ready: if `storage.head(THUMB_PREFIX + uid + '.jpg')` is null, `put` the `getThumbnail(uid)` JPEG there (`image/jpeg`).
   - Return the video download URL as `url` and `posterUrl` from `storage.createDownloadUrl(thumbKey, ttl)`, with `player: 'video'`.
   - In `delete(uid)`, also delete the thumbnail key (idempotent).
4. **`packages/shared/src/media-access.ts`:** the VIDEO variant becomes `{ id, kind: 'VIDEO', url, posterUrl: z.string().nullable(), player: z.enum(['hls', 'video']), durationSeconds: z.number().int().positive().nullable() }`. Update the doc comment. `iframe` is removed.
5. **`apps/api/src/modules/entitlements/media-access.service.ts` `mintAll`:** add `durationSeconds: true` to the select and return `{ id, kind: 'VIDEO', url, posterUrl, player, durationSeconds }`. Nothing else changes: minting stays after `decision === 'full'`, and the log line still holds ids only, never URLs.
6. **`docs/media-protection.md`:** note that Stream videos play as signed HLS (token = media-access TTL, `downloadable: false`), and the poster is minted on the same token after the same check and never public. The stub poster is a private storage object.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/common/video-provider.ts` | `VideoPlayback` posterUrl, `'hls' \| 'video'` |
| MODIFY | `apps/api/src/common/cloudflare-stream-video-provider.ts` | manifest + thumbnail URLs |
| MODIFY | `apps/api/src/common/stub-video-provider.ts` | stored, signed poster |
| MODIFY | `apps/api/src/modules/entitlements/media-access.service.ts` | posterUrl + durationSeconds |
| MODIFY | `packages/shared/src/media-access.ts` | schema |
| MODIFY | `docs/media-protection.md` | HLS + poster notes |
| MODIFY | specs + fixtures that use `player: 'iframe'` | `cloudflare-stream-video-provider.spec.ts`, `stub-video-provider.spec.ts`, `media-access.test.ts`, the media-access integration spec, `post-media-viewer.test.tsx` fixtures |

**Testing:**
- **Stream spec:** one token call; `url` ends with `/manifest/video.m3u8`, `posterUrl` is a thumbnail on the same token, `player: 'hls'`. The existing refusals (foreign host, http, no thumbnail) still mint nothing.
- **Stub spec:**
  - ready → `posterUrl` is a signed storage URL, and a second call doesn't `put` again
  - not ready → null
  - `delete` removes both keys
- **Shared:** `posterUrl`/`durationSeconds` accept null; `player: 'iframe'` is rejected.
- **Media-access integration:**
  - a full-access VIDEO item has `posterUrl`, `player` and `durationSeconds` from the row
  - locked → 403 and hidden → 404, with no posterUrl in the body
  - log lines hold no URL

---

### TASK-025: PostVideo player and single-playback store

Build the shared video element and the store that keeps one video playing at a time.

1. **`apps/web/src/lib/video-playback.ts`:**
   - `AUTOPLAY_VISIBLE_RATIO = 0.6`, commented "example value; spec §6.3 threshold not LOCKED".
   - Module state `active: string | null` with listeners.
   - `claimPlayback(id)`, `releasePlayback(id)` (clears only if active), `pauseAllVideos()` (clears) and `usePlaybackActive(id): boolean` (`useSyncExternalStore`, server snapshot false).
   - `prefersTapToPlay(): boolean` = `matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData === true`, guarded for a missing `matchMedia`/`connection`. Type `connection` locally; don't add lib types.
2. **`apps/web/src/components/post-video.tsx`** (client): `PostVideo({ item, active = true, nativeControls = false, className })`, where `item` is the VIDEO `MediaAccessItem`. A stable `id = useId()`.
   - **Visibility:**
     - an `IntersectionObserver` with threshold `AUTOPLAY_VISIBLE_RATIO` sets `visible`
     - `document.visibilitychange` sets `pageVisible`
   - **Eligibility:** `wants = active && visible && pageVisible && !tapMode && !userPaused`.
     - When `wants` turns true, call `claimPlayback(id)`. When it turns false, or on unmount, call `releasePlayback(id)`.
     - `playing = usePlaybackActive(id) && wants`, with tap mode handled below.
   - **Source attach, once:** on the first play, attach the source.
     - If `item.player === 'hls'` and `video.canPlayType('application/vnd.apple.mpegurl')`, set `video.src = url`.
     - Else, for HLS, call `const { default: Hls } = await import('hls.js')`. If `Hls.isSupported()`, create `new Hls()`, `loadSource(url)` and `attachMedia(video)`; else go to `failed`.
     - For `video` player, set `video.src = url`.
     - Destroy hls on unmount. When `item.url` changes after attaching (refresh), reattach and restore `currentTime` (and play if playing).
   - **Playing:**
     - When `playing` is true, call `video.play()`. If it rejects with `NotAllowedError`, set `tapMode = true` (autoplay blocked).
     - When `playing` is false, call `video.pause()`.
   - **Tap mode:**
     - Starts as `prefersTapToPlay()`, read in an effect after mount (not during render: SSR-safe).
     - A centred 56 px "Putar video" button over the poster. On tap, set `tapMode = false` and `userPaused = false`, and `claimPlayback(id)`.
     - From then on it follows the same pause rules, but stays out of autoplay: losing the claim or visibility pauses it, and it doesn't autoplay again without a tap. Implement this as `manual = true`: after a pause, `tapMode` turns back on.
   - **Tap on the playing video** toggles `userPaused`. `userPaused` resets when the video leaves the viewport.
   - **Element:** `<video muted={muted} playsInline preload="none" poster={item.posterUrl ?? undefined} loop disablePictureInPicture controlsList="nodownload" onContextMenu={preventDefault} controls={nativeControls}>`. `muted` starts true and is synced through the ref in an effect.
   - **Overlay (when `!nativeControls`):**
     - a bottom-right 44 px button with `aria-label` "Nyalakan suara" / "Matikan suara" (`VolumeX` / `Volume2`), which toggles `muted`
     - a bottom-left duration pill: `formatDuration(item.durationSeconds ?? video.duration)`, `bg-black/60 text-white`, hidden while unknown
   - **Failure:** on `error` (or hls `ERROR` with `fatal`), show "Video tidak dapat diputar." over the poster.
   - **`formatDuration(seconds)`:** m:ss, with whole minutes allowed past 59 (e.g. `75:03`). Export it from `post-video.tsx`, or put it in `lib/relative-time.ts` beside the other formatter.
3. **`apps/web/package.json`:** `"hls.js": "1.7.3"`, then `corepack pnpm install`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/video-playback.ts` | single-playback store, threshold, tap-mode preference |
| CREATE | `apps/web/src/lib/video-playback.test.ts` | store tests |
| CREATE | `apps/web/src/components/post-video.tsx` | the player |
| CREATE | `apps/web/src/components/post-video.test.tsx` | player tests |
| MODIFY | `apps/web/package.json`, `pnpm-lock.yaml` | hls.js |

**Testing** (stub `HTMLMediaElement.prototype.play`/`pause`/`canPlayType`, `matchMedia`, a controllable `IntersectionObserver`, `document.visibilityState`, and `vi.mock('hls.js')`):
- **Store:** claim A, then B → A inactive; `releasePlayback(A)` while B is active leaves B; `pauseAllVideos` clears.
- **Visibility:** below the ratio → no `play`, and no `src` attached (lazy); at or above it → `play` called once, muted and playsInline set; leaving the viewport → `pause`.
- **Two videos:** the second becomes visible → the first pauses.
- **Inactive slide** (`active={false}`) never plays.
- **Background tab:** a `visibilitychange` to hidden pauses it.
- **Autoplay blocked:** `play` rejecting with `NotAllowedError` shows "Putar video", and tapping plays.
- **Tap mode up front:** reduced motion or saveData → "Putar video", and no `play` until tapped.
- **Mute toggle:** the label goes "Nyalakan suara" → "Matikan suara" and `muted` flips. The duration pill shows `1:05` for 65 s.
- **Sources:** HLS without native support → the mocked `Hls.loadSource` gets the url; native HLS → `src` set and hls.js not imported.
- **Refresh:** a URL change while playing keeps `currentTime`.
- **Formatting:** `formatDuration` gives 0:05, 1:05 and 75:03.

---

### TASK-026: Wire autoplay into PostCard, sheets and the post page

Connect the player to the carousel, the bottom sheets and the detail page.

1. **`components/post-media-viewer.tsx` `MediaItemView`:**
   - Take an optional `active?: boolean` and `nativeControls?: boolean`.
   - Render `<PostVideo item active nativeControls className>` for VIDEO.
   - Remove the iframe branch and the old `<video>`.
   - `PostMediaViewer` (the detail page list) passes `nativeControls` so seeking still works there. Muted autoplay applies there too (Option B), and US-012 restyles it later.
2. **`components/post-card/post-media.tsx` `AccessibleMedia`:** pass `active={i === index}` to `MediaItemView`, so only the current slide plays and a slide change pauses the old one. Images ignore it.
3. **`components/ui/bottom-sheet.tsx`:** add `useEffect(() => { if (open) pauseAllVideos(); }, [open])`. This covers the purchase, report and future comments sheets.
4. **Docs:** in `.agile/guidelines/frontend.md` (media section), say that video goes through `PostVideo`, there is one playing video (`claimPlayback`), every overlay that should pause media calls `pauseAllVideos()` (BottomSheet already does, and the US-013 viewer must too), and there is no iframe.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/components/post-media-viewer.tsx` | use PostVideo, drop iframe |
| MODIFY | `apps/web/src/components/post-media-viewer.test.tsx` | `hls`/`video` fixtures |
| MODIFY | `apps/web/src/components/post-card/post-media.tsx` | active slide |
| MODIFY | `apps/web/src/components/post-card/post-card.test.tsx` | video carousel case |
| MODIFY | `apps/web/src/components/ui/bottom-sheet.tsx` (+ test) | pause on open |
| MODIFY | `.agile/guidelines/frontend.md` | playback rules |

**Testing:**
- **PostCard:** a carousel of [video, image]: slide 1 plays; `scroll` to slide 2 → `pause` is called, and the image slide renders. A locked premium video post still makes no media-access call and renders no `<video>` (regression from US-008).
- **BottomSheet:** opening it calls `pauseAllVideos` (spy on the module, or claim a fake id and assert it is cleared).
- **PostMediaViewer:** a VIDEO item renders `<video>` with native controls and the poster; there is no iframe; the watermark is still shown.
- `pnpm check` passes.
- Manual UAT (no browser here): on iOS Safari and Android Chrome at 320–430 px, check:
  - muted autoplay at about 60 % visible
  - swiping pauses
  - opening the purchase sheet pauses
  - the background tab pauses
  - reduced motion shows the play button
  - the Network tab shows no segments before a video plays
