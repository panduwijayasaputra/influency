# QA Report: TASK-078 — Unified media refresh, limit checks, sweeper

**Story:** US-049
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Logic stays in `PostMediaService`; `MediaSweeper` is a thin timer provider in `PostsModule`. No controller changes.
- [x] One state path: `refresh(row, now)` is used by `complete`, `list` and `sweep` (and the TASK-079 webhook). `applyVideoStatus` is gone. Every transition is a conditional `updateMany` from PENDING_UPLOAD/PROCESSING, so READY and REJECTED are final and nothing regresses.
- [x] Both `shortcut:` debts at the top of the service are resolved and removed. The sweeper carries its own `shortcut:` (in-process timer until the Phase 5 worker).

### Security / isolation
- [x] Studio endpoints are still scoped by `creatorProfileId`. Deleting a foreign creator's failed item → 404, row kept (tested).
- [x] A REJECTED item may be removed on a live post (still under the post-row lock); READY items stay `POST_LOCKED` (tested). Viewer-facing queries (`media-access`, public feed counts, publish checks) all filter by status, so REJECTED rows never reach viewers.
- [x] The sweep is a system job that returns no data; logs carry the media id only, never the provider uid or URLs.

### Data integrity
- [x] **Bug fixed:** `reject` used to delete the bytes even when its conditional update lost. It now cleans up only when `count === 1`. Regression test: the row becomes READY between the sweep's provider read and its reject → no provider delete.
- [x] A provider error during the sweep leaves the row unchanged and the sweep continues (tested). Batch capped at 100 per run (tested). A second sweep is a no-op (tested).
- [x] DB CHECK `media_assets_rejection_reason_status` verified (a reason on a READY row is refused).

### Financial Integrity
- N/A

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Limits rejected server-side with a clear message | PASS | Video over the max duration → 422 `VIDEO_TOO_LONG`, over the max size → 413 `FILE_TOO_LARGE`, both deleted at the provider; exactly at the limits → READY. Image checks unchanged |
| 2 | Expired slots / stuck processing marked failed, not counted | PASS | Sweep + lazy list refresh → `UPLOAD_EXPIRED` / `PROCESSING_TIMEOUT`; failed rows don't block a new slot at the limit |
| 3 | Abandoned video uploads deleted from the provider | PASS | Expired video slot → provider delete without a status call |
| 4 | Webhook | — | TASK-079 |
| 5 | Studio shows failed uploads, remove/retry | API PASS | List returns REJECTED with `rejectionReason`; remove allowed in any status. UI in TASK-080 |

## Test Results

- New `media-cleanup.integration.spec.ts`: 16 passed. Stale rows use 1965 expiries (earlier than any expiry other specs store, e.g. `new Date(0)`) and the sweep a matching `now`, so the global sweep never touches parallel specs' rows on the shared test DB.
- New `media-sweeper.spec.ts` (fake timers): 4 passed (interval 0 = no timer, ticks until shutdown, overlap skipped, survives a failed sweep).
- Posts module integration specs: 129 passed (two assertions updated: rejected items are now listed with their reason).
- Lint + Prettier clean; API typecheck clean.
