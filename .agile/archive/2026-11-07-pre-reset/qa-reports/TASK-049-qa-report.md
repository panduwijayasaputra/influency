# QA Report: TASK-049 — `VideoProvider` seam — Cloudflare Stream driver, stub driver, env and fixture

**Story:** US-017
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Seam in `common/` like `ObjectStorage`: `video-provider.ts` (interface + `VIDEO_PROVIDER` token), `cloudflare-stream-video-provider.ts`, `stub-video-provider.ts`, factory in `common.module.ts` (exported)
- [x] Env: `VIDEO_DRIVER` (default `stub`), `VIDEO_UPLOAD_TTL_SECONDS` (120–21600, default 1800), `CLOUDFLARE_STREAM_ACCOUNT_ID` / `CLOUDFLARE_STREAM_TOKEN` (handoff §9 names) required only for `stream`; `stub` rejected in production
- [x] Stream response bodies parsed with Zod before use
- [x] `.env.example` placeholders only; README documents both drivers

### Security
- [x] Every Stream upload is created with `requireSignedURLs: true` (AC4)
- [x] Errors carry the HTTP status only — no token, upload URL or response body (tested)
- [x] uid is `encodeURIComponent`-ed in API paths; stub keys are server-generated `post-video/<uuid>` (match the local storage key guard)
- [x] Stub bytes live in the private object storage; no read route exists for them
- [x] `video/*` body parser capped at `POST_VIDEO_MAX_BYTES`

### Creator / user isolation
- N/A (TASK-050)

### Financial Integrity
- N/A

### Code Quality
- [x] Two `shortcut:` comments on the stub (in-memory validation state; presigned PUT still valid after validation — dev only)
- Deviation from plan: `createFakeVideoProvider` has no `created` list (no test needed it); it adds a `set(uid, state, extra)` helper.

## Provider docs check

Verified against current Cloudflare docs (direct creator uploads, video details, delete): `direct_upload` → `result.uid` / `result.uploadURL`; browser POSTs multipart field `file`, basic uploads ≤ 200 MB; `status.state` ∈ pendingupload/downloading/queued/inprogress/ready/error (+ live-inprogress → mapped to processing); `duration` −1 while unknown; Bearer token. Not documented: `expiry` allowed range and the delete response for a missing uid — we bound TTL 120–21600 s (2 min – 6 h) and treat delete 404 as already gone.

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Adapter targeting private Stream | PASS | `CloudflareStreamVideoProvider` |
| 3 | Stub adapter + protected fixture | PASS | `StubVideoProvider` on private storage; `test/fixtures/sample.mp4` (4.5 KB) |
| 4 | Never public without signed token | PASS (driver) | `requireSignedURLs: true` |

## Tests Run

- [x] API: 344 passed (new: env video rules ×4 groups, Stream driver 13, stub driver 5, `detectVideoType` 9, dev-storage video PUT 1); typecheck + lint PASS; format PASS
