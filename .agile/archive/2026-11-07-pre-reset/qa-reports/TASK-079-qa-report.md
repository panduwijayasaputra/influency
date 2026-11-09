# QA Report: TASK-079 — Verified Cloudflare Stream processing webhook

**Story:** US-049
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Thin `VideoWebhookController` (`POST /webhooks/video/cloudflare-stream`) in `PostsModule`; logic in `PostMediaService.handleVideoEvent` → the shared `refresh` (TASK-078). Pure signature check in `common/stream-webhook.ts`.
- [x] The external payload is validated with Zod (`{ uid }` only, `^[A-Za-z0-9]{1,64}$`), **after** the signature check.
- [x] `createApp` passes `rawBody: true` so the HMAC runs over the exact bytes. Full API suite (45 files, 547 tests) is green with it.

### Provider docs check
The plan was checked against https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/ (last updated 2026-09-30) and matches it: `Webhook-Signature: time=…,sig1=…`, hex HMAC-SHA256 of `<time>.<raw body>`, constant-time compare recommended, secret in `result.secret` of `PUT …/stream/webhook`, body field `uid`. Three gaps in the docs are recorded in `docs/video-processing.md`:
- no numeric replay window (we use ±300 s);
- the delivery `Content-Type` isn't stated (the handler expects JSON; other types → 403);
- retry behavior on non-2xx isn't documented (the poll and sweep are the fallback).

### Security
- [x] Off (404) without `CLOUDFLARE_STREAM_WEBHOOK_SECRET`; `.env.example` keeps it commented so no placeholder secret can enable it.
- [x] Bad, missing, stale, future or tampered signature → 403, row untouched. `timingSafeEqual` with a length guard (no throw on odd input).
- [x] The event body is never trusted for state: only `uid`, then `getStatus` from the provider. Duplicates, replays and out-of-order events can't regress a row (tested). Expired slots stay rejected even if the provider has the video.
- [x] Logs carry the media id and the resulting status only; never the uid, body, secret or signature.
- [x] The global CSRF guard still applies when a cookie is sent (tested); Stream sends no cookies.
- Note: the guideline "rate-limit webhook endpoints" isn't applied. Unsigned requests are refused after one HMAC with no DB access, and signed ones cost one indexed lookup plus one provider read. Acceptable for the MVP; add `@RateLimit` if abuse shows up.

### Financial Integrity
- N/A

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 4 | Readiness from a verified provider webhook; duplicate/replayed/out-of-order never regress; polling remains the fallback | PASS | Webhook → READY with duration/size; repeat → no write (`updatedAt` unchanged); READY/REJECTED rows untouched by contrary provider states; polling unchanged; webhook optional |

## Test Results

- `stream-webhook.spec.ts`: 13 passed (valid, tolerance edges, tampered body, wrong secret, stale/future, missing/empty/malformed header, short/non-hex signature)
- `video-webhook.integration.spec.ts`: 14 passed (off without secret; 403 cases leave the row alone; provider-state wins; duplicate no-op; no regression; error → REJECTED + delete; expired slot; unknown uid → 200; bad uid → 400; provider error → 500, row unchanged; non-JSON → 403; CSRF with a cookie)
- Full `@influency/api` suite: 547 passed. Lint and Prettier clean.
