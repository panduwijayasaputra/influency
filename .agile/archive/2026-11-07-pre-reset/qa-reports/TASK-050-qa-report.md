# QA Report: TASK-050 — Video branch in the post media API

**Story:** US-017
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Same controller/routes; `PostMediaService` branches on `kind` (`mediaKindOf(contentType)`); `VideoProvider` injected via `VIDEO_PROVIDER`
- [x] Domain errors only (`MEDIA_UPLOAD_MISSING`, `VIDEO_PROCESSING_FAILED`, `MEDIA_LIMIT_REACHED`, `NOT_FOUND`)
- [x] Conditional `updateMany` transitions (`PENDING_UPLOAD → PROCESSING → READY`, `→ REJECTED`), so concurrent complete/list/delete can't overwrite each other
- [x] `shortcut:` comment for videos stuck in PROCESSING (sweeper/webhook with the worker)

### Security
- [x] `StudioMedia` never carries `videoUid` / `objectKey` (tested); the uid only appears inside Stream's one-time upload URL, and playback needs a signed token anyway
- [x] Video `content` route → 404 (no owner playback until US-021)
- [x] Logs name the media id, not the uid or any URL; provider errors carry the status only

### Creator / user isolation
- [x] Every path still goes through `findOwned` (media id + post id + creator profile) or the `FOR UPDATE` owner query; the list sync runs only after the post-owner check. B on A's video (complete, cross-post complete, list, content, delete) → 404 identical to an unknown id; row and provider untouched (tested)

### Financial Integrity
- N/A

### Code Quality
- [x] Provider slot is created inside the post-row lock (after the limit check) so a refused slot never creates a provider video; the transaction gets a 15 s timeout for that call; if the transaction fails after the provider call, the provider video is deleted best-effort
- Deviation from plan (simpler, same safety): `complete` treats a provider `null` (video unknown) like `error` → REJECTED + `VIDEO_PROCESSING_FAILED`; only `pending_upload` gives `MEDIA_UPLOAD_MISSING`. Stream creates the video record at slot time, so `null` means it was deleted. The image spec keeps its default (stub) video provider — it never calls it.

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Creator uploads video through the adapter | PASS | slot returns provider upload (POST multipart / stub PUT) |
| 2 | Processing status until ready | PASS | `complete` → PROCESSING; `list` re-checks and flips to READY with duration/size |
| 4 | No public originals | PASS | no uid in responses, no video content route |

## Tests Run

- [x] New `post-media-video.integration.spec.ts` — 11 tests: slot shape/TTL/no uid; type/size validation; pending → 409, processing → PROCESSING, list → READY (duration, size), idempotent complete; straight to READY; provider error on complete (422, REJECTED, deleted) and while PROCESSING (dropped from list); provider down → list 200, row unchanged; video content 404; delete + failing provider delete; PROCESSING counts toward the limit; creator isolation; DB CHECK `media_assets_storage_ref` both directions
- [x] API 355 passed; typecheck + lint + format PASS
