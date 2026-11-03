# QA Report: TASK-046 — Post media API (upload slot, complete, list, owner preview, delete)

**Story:** US-016
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] In the `posts` module: thin `PostMediaController` (guard, Zod pipes, header mapping), logic in `PostMediaService`; Prisma only in the service
- [x] Body validated with shared `createMediaUploadSchema`; ids with `z.uuid()` pipes; standard `DomainError`s (`NOT_FOUND`, `MEDIA_LIMIT_REACHED`, `MEDIA_UPLOAD_MISSING`, `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`)
- [x] `shortcut:` comment for abandoned pending uploads (cleanup job, Phase 5)

### Security
- [x] `ApprovedCreatorGuard` on the controller; global CSRF guard covers POST/DELETE (cross-origin → 403)
- [x] Object keys server-generated (`post-media/<uuid>`); presigned URL returned only in the slot response (`no-store`), never logged (cleanup warnings log the key + error message only)
- [x] Size checked with `head` before any download; type from magic bytes; stored/served type is the detected one; preview sends `nosniff`, `private, no-store`
- [x] Expired slots cannot be completed (otherwise a late complete could exceed the per-post limit)

### Creator / user isolation
- [x] Slot: `SELECT … FOR UPDATE` on `posts` filtered by `id` AND `creator_profile_id`
- [x] complete/content/remove: `findFirst({ id: mediaId, post: { id: postId, creatorProfileId } })`; list: post owner check first
- [x] Tested: creator B on A's post for all 5 routes, and A's media id under B's own post → 404 identical to an unknown id; A's row and object unchanged

### Financial Integrity
- N/A (no money). Concurrency: per-post limit holds under 5 parallel slot requests (post row lock); `complete` uses a conditional `PENDING_UPLOAD → READY/REJECTED` update

### Code Quality
- [x] Mirrors `CreatorProfileService` patterns (best-effort object delete with warn log, `nosniff` streaming)

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Short-lived, scoped upload URL only to the post owner | PASS | URL for one server key + signed content type, expires after `UPLOAD_URL_TTL_SECONDS` (asserted ≈300 s); non-owners 404, non-creators 403, no session 401 |
| 2 | Allowed types/sizes by content, configurable | PASS | declared type/size validated (400); `complete` → 413 when real size > 10 MiB (no download), 415 for SVG/PDF/GIF bytes; JPEG/PNG/WebP accepted; detected type stored |
| 3 | Private storage, no permanent public URL | PASS | no public media route; owner preview via session-guarded API, `private, no-store` |
| 4 | Local dev adapter | PASS (TASK-044) | same flow works with `LocalObjectStorage` |

## Tests Run

- [x] Full API suite: PASS (28 files) on 3 consecutive runs; posts module 31 tests after the fix
- [x] API typecheck + lint: PASS
- [x] New: `apps/api/src/modules/posts/post-media.integration.spec.ts` (20 tests) — slot shape/TTL/no-store/no `objectKey`, validation paths, happy path + idempotent complete + list + preview headers, declared≠detected type, JPEG/WebP, SVG/PDF/GIF rejected (object deleted, REJECTED, hidden, re-complete 409, preview 404), oversized rejected without `get`, missing upload → 409 (stays pending), expired slot, per-post limit + expired slots don't count, 5 concurrent slots at 8 used → exactly 2 succeed, delete (+ second delete 404, storage failure still deletes the row), isolation, 400/401/403/CSRF

## Issues

None open.

### Found and fixed during QA (retry 1): upload URL replay after complete
**Severity:** major
**Type:** security / correctness
**File:** apps/api/src/modules/posts/post-media.service.ts
**Description:** A presigned upload URL stays valid until it expires (R2 URLs cannot be revoked). After `complete` marked the item READY, the creator could PUT different bytes with the same content type to the same key and the API would serve unchecked bytes (any size on R2). Found in a live smoke test (local driver through the Next proxy). Fix: `complete` writes the checked bytes to a new server-only key `post-media/<uuid>` (row `object_key` updated in the same conditional transition) and best-effort deletes the upload key; a lost race deletes the new key instead. Regression test: "moves checked bytes off the upload key, so a later PUT to the still-valid URL changes nothing". Live re-check: replayed PUT → content unchanged.

Also fixed during dev: the oversized-object test first declared `byteSize` over the max (rejected at the slot with 400); it now declares a valid size and uploads more bytes, like a lying client.

## Notes

- Live smoke test (local driver, existing `pnpm dev`): ~10 MiB PNG through the Next `/api/v1` rewrite → 204, complete READY, preview 200 with the full size, no cookie → 401, wrong content type on the upload URL → 403, SVG labelled PNG → 415. The Next proxy body-size risk from the plan did not materialise. Smoke-test post/media removed from the dev DB.

- `me.integration.spec.ts` (not touched by US-016) failed in two full parallel runs (once before this task's code existed) and passed in 4 others and alone: an existing flaky test under load, worth a separate look.
- Deleting media works for any post status; US-019 must restrict it for published/purchased posts.
