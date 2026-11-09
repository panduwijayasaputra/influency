# QA Report: TASK-067 — Studio cover API

**Story:** US-048
**Result:** PASS
**Tester:** qa-agent

## Code Review

- [x] `PostCoverController` (`ApprovedCreatorGuard`, uuid pipe):
  - PUT `cover` with `{ mediaId }`
  - PUT `cover/image` with raw bytes
  - DELETE `cover`
  - GET `cover/preview` (`private, no-store`, `nosniff`)
- [x] `PostCoverService`:
  - Owner + PREMIUM pre-check; the media must be READY on that post.
  - Post media is always blurred. Clear output only for uploads, and only with the setting on.
  - Undecodable input → 415.
- [x] Transaction boundary:
  - The preview `put` runs before the transaction.
  - Under `lockPost`, re-check PREMIUM and media READY, then swap the keys.
  - A failed transaction deletes the new key; after commit, the old key is deleted.
  - `lockPost` is now an exported function, with behaviour unchanged for existing callers.
- [x] `PostMediaService.remove` clears a cover that points at the deleted media in the same transaction, then deletes its preview. The RESTRICT FK makes it impossible for a path to skip this.

### Security / isolation

- [x] Foreign post, another post's media, foreign media and pending media all → 404. The video uid never appears in responses or logs.

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Post image, dedicated upload, or video thumbnail | PASS | All three tested |
| 4 | Changing the cover regenerates the preview | PASS | Old preview deleted; 3 concurrent changes leave exactly one preview object |
| 5 | Clear only when configured | PASS | A second app instance with the env set: upload → 640 px, media cover → ≤ 320 px |

## Tests Run

- [x] `post-cover.integration.spec.ts`: 22 passed. Posts + common: 286 passed

## Issues (if any)

None. Cover changes are allowed in any status (including ARCHIVED), as planned.
