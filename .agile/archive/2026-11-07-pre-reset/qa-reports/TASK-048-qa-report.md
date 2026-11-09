# QA Report: TASK-048 — Video schema, migrations and shared media contract

**Story:** US-017
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Two migrations: `20261103102759_media_video_enums` (enum values only — Postgres can't use a new enum value in the transaction that adds it) and `20261103103500_media_video_columns` (nullable `object_key`, `video_uid` UNIQUE, `duration_seconds`, CHECKs `media_assets_storage_ref` + `media_assets_duration_seconds`). The second was generated with `prisma migrate diff` because `migrate dev` refuses non-interactive runs when it shows a warning; content is identical to what `migrate dev` produces. No applied migration edited.
- [x] Schema conventions spec passes (snake_case, integer columns)
- [x] Shared limits are labelled TBD placeholders; size message derived from the constants; new `VIDEO_PROCESSING_FAILED` (422) with Bahasa message

### Security
- [x] Request schema still only accepts `contentType` + positive integer `byteSize`; per-kind max (image 10 MiB, video 200 MiB); unknown keys stripped
- [x] `studioMediaSchema` has no `videoUid` / `objectKey`

### Creator / user isolation
- N/A (TASK-050)

### Financial Integrity
- N/A

### Code Quality
- [x] Image paths in `PostMediaService` use `row.objectKey!` — guaranteed by the new CHECK; TASK-050 restructures by kind
- Note: Prisma emitted `ADD VALUE 'PROCESSING'` without `BEFORE 'READY'`; enum order has no meaning in code or queries.

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 2 | Processing status | PASS (data) | `PROCESSING` status exists |
| 4 | No public originals | PASS (contract) | provider uid never in the response schema |

## Tests Run

- [x] Shared 141 passed (new: video types/max, video max+1 on `byteSize`, `video/avi` rejected, `mediaKindOf`, PUT and POST+`formField` upload responses); lint PASS
- [x] API typecheck + lint PASS; `src/modules/posts` 31 passed; schema-conventions 4 passed
- [x] Web 120 passed (fixtures gained `durationSeconds: null`, new format message)
- [ ] CHECK constraint violation test — deferred to TASK-050's integration spec (planned there)
