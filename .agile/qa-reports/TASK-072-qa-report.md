# QA Report: TASK-072 — Signed video playback URLs

**Story:** US-021
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `VideoProvider.createPlaybackUrl(uid, ttl) → VideoPlayback | null` added to the seam, both drivers and the test fake
- [x] Stream: reuses US-048's flow (video details → customer host from `thumbnail`, checked https + `*.cloudflarestream.com` → `POST /stream/:uid/token`). Factored into a private `signed()` shared with `getThumbnail`; the thumbnail tests are unchanged and pass
- [x] `MEDIA_ACCESS_TTL_SECONDS` (600–1800, default 1800, labeled TBD) in `envSchema` + `.env.example`
- [x] `shortcut:` comment: two Cloudflare calls per mint; use a signing key above ~10k tokens/day

### Plan deviation (accepted)
- No `CLOUDFLARE_STREAM_CUSTOMER_CODE` env var. US-048 (finished in parallel) already derives and validates the customer host from the video's own `thumbnail` URL, so the playback URL reuses that. One fewer required secret; the cost is one extra details call per mint

### Security
- [x] Playback tokens are minted with `downloadable: false` and `exp` = now + TTL; uploads already set `requireSignedURLs: true` (US-017)
- [x] A missing or not-ready video → null, no token minted
- [x] Errors carry the status only (token, URL and response body are never in messages); the account token never goes to the delivery host
- [x] Stub: playback is a short-lived storage download URL (TASK-071), dev only

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 5 | Video plays only through a provider-signed token, no download, configurable lifetime | PASS (seam) | Each mint is a new token; the endpoint re-checks access (TASK-073) |

## Tests Run

- [x] `vitest run src/common`: 174 passed (14 files)
- [x] api `tsc --noEmit`: PASS; ESLint + Prettier on the touched files: PASS
- [x] New tests: Stream playback token body (`exp`, `downloadable: false`), iframe URL + expiresAt; null for 404/unfinished; token failure by status only; stub playback null until ready, then a `video` download URL; env TTL bounds + default

## Issues

None.
