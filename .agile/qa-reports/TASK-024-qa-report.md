# QA Report: TASK-024: Signed HLS playback and poster in media-access

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- `VideoPlayback` is now `{ url, posterUrl, player: 'hls' | 'video', expiresAt }`. The iframe player is gone, from the API and from the shared schema.
- **Stream:** a single token mint (`{ exp, downloadable: false }`) covers both `/manifest/video.m3u8` and `/thumbnails/thumbnail.jpg?fit=clip`. Still one details call and one token call per video.
- **Stub:**
  - `ready` is checked first.
  - The generated JPEG is stored once at `post-video-thumb/{uid}.jpg` (`head` before `put`) and signed with the same TTL.
  - `delete` also removes the poster. The local storage delete is idempotent.
- **Shared schema:** VIDEO gains `posterUrl` (nullable) and `durationSeconds` (positive int, nullable). Its doc comment is updated.
- **Media access:** `mintAll` adds `durationSeconds` to the select and returns `posterUrl`/`durationSeconds`.
- **Docs:** `docs/media-protection.md` covers HLS, the signed poster on the same token, and the stub's private poster.

### Security
- Posters are minted only inside `mintAll`, which runs only after `decision === 'full'`. A locked or hidden response contains no `fake://` or `memory://` URL (asserted).
- The authorization log line is unchanged: ids, decision and count only, never URLs.
- Stream tokens stay non-downloadable. Posters are never public URLs.

## Acceptance Criteria Verification
- **Lazy, thumbnail-first loading:** the server now supplies a poster for every playable video. The client side is TASK-025.
- **Locked premium never gets video:** unchanged. 403 with no URLs, poster included.

## Tests Run
- **Stream spec:** the manifest and poster use the same token; the token body is `{ exp, downloadable: false }`; there are exactly 2 fetches. The foreign-host, http and no-thumbnail refusals still mint nothing.
- **Stub spec:** not ready → null with no poster stored. Ready → signed video and poster URLs; the second call doesn't `put` again. `delete` removes both keys.
- **Shared:** a null poster and duration are accepted, `iframe` is rejected, and a player is still required. Shared: 212 green.
- **Media-access integration:** VIDEO has `player: 'hls'`, `durationSeconds: 65` (from the row) and a `fake://poster/` URL. The 403 bodies contain no `fake://`.
- API: 5 files / 59 tests green; typecheck clean.

## Notes
- Web still references `player === 'iframe'`. TASK-026 replaces it. The full `pnpm check` runs after TASK-026.
- UAT: Stream HLS CORS on the sandbox account can't be tested here (stub only).
