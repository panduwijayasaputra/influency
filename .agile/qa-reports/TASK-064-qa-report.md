# QA Report: TASK-064 — Shared cover contract

**Story:** US-048
**Result:** PASS
**Tester:** qa-agent

## Code Review

- [x] `POST_COVER_MAX_BYTES` (5 MiB, TBD placeholder), `setPostCoverSchema` (strict `{ mediaId: uuid }`), `postCoverSchema`, `StudioPost.cover`, `PublicPost.previewUrl` in `packages/shared/src/posts.ts`
- [x] `COVER_REQUIRES_PREMIUM` / `COVER_SOURCE_UNAVAILABLE` (409, Bahasa messages) in `errors.ts`
- [x] The public schema's doc comment states it never carries media ids, keys or provider ids

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Cover sources | PASS (contract) | `{ mediaId }` for post media; upload is a raw-body route |

## Tests Run

- [x] shared: 173 passed (new: strict schema, cover/previewUrl parsing)

## Issues (if any)

None.
