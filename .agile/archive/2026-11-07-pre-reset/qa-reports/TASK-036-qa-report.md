# QA Report: TASK-036 — R2 object storage seam, env vars, image body parsing and error mapping

**Story:** US-012
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Shared infrastructure in `apps/api/src/common/` (`object-storage.ts`, `r2-object-storage.ts`, `image-type.ts`); `OBJECT_STORAGE` provided + exported by the global `CommonModule`
- [x] Dependency pinned exactly: `aws4fetch` 1.0.20 (published 2024-08, zero deps, no install script)
- [x] New required env vars added to `envSchema` in the story that first uses them; placeholders in `vitest.config.ts`
- [x] External provider mocked in tests (`test/memory-storage.ts`, stubbed `fetch`)

### Security
- [x] Bucket private; path-style URL with each key segment encoded
- [x] R2 errors carry only the HTTP status (no URL, no signature): tested
- [x] Type detection by magic bytes only (JPEG/PNG/WebP); SVG/HTML/GIF/PDF/WAVE rejected
- [x] Image body parser capped at the largest limit (5 MiB) → 413 `FILE_TOO_LARGE`; unknown content type → 415 `UNSUPPORTED_FILE_TYPE`

### Code Quality
- [x] Retries capped at 2 (aws4fetch default is 10 with exponential backoff)
- [x] `shortcut:` comment for the whole-object buffering

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 4 | Reject unsupported types / oversized files | PASS (infrastructure) | Body-limit 413 + missing-parser 415 verified in `errors.spec.ts`; per-kind limits in TASK-037 |

## Tests Run

- [x] `errors.spec.ts`, `env.spec.ts`, `image-type.spec.ts`, `r2-object-storage.spec.ts`: PASS (63)
- [x] API typecheck + lint: PASS; prettier applied
- [x] Edge cases: truncated magic bytes, RIFF non-WebP, 404 get/delete, 5xx retry then throw, key encoding

## Issues

None. Fixed during dev: Nest's Fastify adapter wraps body-limit/media-type errors as `HttpException` 413/415, so the mapping lives in `HTTP_STATUS_CODES` (not the `FST_` path).

## Notes

- Plan deviation: `.github/workflows/ci.yml` unchanged. The test env comes from `vitest.config.ts`, and `pnpm check` needs no R2 vars otherwise.
