# QA Report: TASK-074 — `PostMediaViewer` + studio preview + protection notes

**Story:** US-021
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Client component `apps/web/src/components/post-media-viewer.tsx`, reusable by US-014. The fetch goes through the same-origin `/api/v1` rewrite (session cookie first-party, no CORS), and the response is parsed with the shared `mediaAccessResponseSchema`
- [x] Fetch in an effect keyed by `[postId, version]`; retry and refresh bump `version` (satisfies the React Compiler lint rule against setState in effects; stale responses after unmount are ignored)
- [x] Plain `<img>` with the existing eslint-disable justification pattern (next/image would fetch and cache signed URLs)
- [x] Mounted on `/studio/posts/[postId]` as a "Pratinjau" section when the post has READY media; owner access via the same endpoint (`full` for the owner in any status except REMOVED)

### Security
- [x] URLs are fetched client-side after hydration only, so they never appear in SSR HTML; `cache: 'no-store'`; no `console.*`
- [x] Video: Stream `iframe`; stub `<video controlsList="nodownload" disablePictureInPicture>`; context menu blocked on images/video (UX deterrent only)
- [x] Watermark overlay (`pointer-events-none`, `select-none`, `aria-hidden`) shows only the pseudonymous tag; none for anonymous viewers
- [x] `docs/media-protection.md` documents what is enforced and the explicit limits (screen recording, URL reuse until expiry, no DRM, paused-video restart on refresh, rate-limit caveats)

### Financial Integrity
- N/A

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 3 | The page can request fresh URLs | PASS | Refetch 60 s before `expiresAt`; new URLs replace the old ones (test) |
| 4 | Signed URLs never in public page HTML | PASS | Client-only fetch; the public post page (US-014) reuses the component |
| 6 | Visible pseudonymous watermark; limits documented, not claimed | PASS | Overlay + `docs/media-protection.md` |

## Tests Run

- [x] `post-media-viewer.test.tsx`: 6 passed (renders img/iframe/no-download video + watermark; no watermark when null; 403/404 messages with no media; retry after 500; refresh timing + URL swap + timer cleared on unmount)
- [x] Full `pnpm check`: exit 0. Shared 176 (8 files), web 167 (28 files), api 487 (40 files)

## Issues

None.

## Notes

- Not checked in a real browser (Stream iframe playback needs real Stream credentials). UAT: with `VIDEO_DRIVER=stub` the video plays from local storage without seeking (dev route has no Range support).
