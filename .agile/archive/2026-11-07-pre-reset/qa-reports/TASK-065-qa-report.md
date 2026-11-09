# QA Report: TASK-065 — Schema, env setting and preview generator

**Story:** US-048
**Result:** PASS
**Tester:** qa-agent

## Code Review

- [x] Migration `20261104120000_post_covers`: `cover_media_id` (FK RESTRICT + index), `preview_key` UNIQUE, CHECK `posts_cover_has_preview`. The SQL was diffed from the migrated dev DB; naming the `PostMedia` relation produced no SQL change
- [x] `PREMIUM_COVER_CLEAR_ALLOWED` follows the `POST_MODERATION_REQUIRED` pattern (default false) and has a TBD line in `.env.example`
- [x] `PreviewGenerator` (`common/`, global provider): `.rotate()`; then a 32 px sample → 320 px + blur σ4 → WebP q40. Clear mode: 640 px, never enlarged. `limitInputPixels` 40 MP. sharp strips metadata by default. Constants are named placeholders
- [x] `sharp@0.35.5` (published 2026-09-27) pinned exactly; `allowBuilds: sharp: false` (prebuilt binaries); works on Windows; the lockfile includes `@img/sharp-linux-x64` for CI

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 2 | A separate transformed file; the original can't be recovered | PASS | 1 px checkerboard and flat-gray previews differ by < 4 mean; preview stddev < 10; EXIF/ICC/XMP absent |
| 5 | Configurable, defaults to blurred-only | PASS | Env default false; clear mode applies only to dedicated uploads (TASK-067) |

## Tests Run

- [x] `preview-generator.spec.ts` (6), `env.spec.ts` (+1), schema-conventions spec: all pass

## Issues (if any)

None. Generation runs in the request path, noted as a `shortcut:` in `PostCoverService`.
