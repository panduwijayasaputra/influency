# QA Report: TASK-089 — Admin moderation queue and post actions

**Story:** US-042
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `AdminModerationController` (thin, `AdminGuard` on the class) + `ModerationService` in the `admin` module
- [x] `:action` param validated with `z.enum(MODERATION_POST_ACTIONS)`; body strict (`moderationActionInputSchema`)
- [x] `lockAnyPost` added next to `lockPost` (same `SELECT … FOR UPDATE` pattern); `lockPost` unchanged

### Security
- [x] Admin only (401/403 tested). Admin id from the session
- [x] Action notes are internal: stored, never returned to users, not logged

### Creator / user isolation
- [x] Admin-wide by design; no creator/user endpoint exposes reports or actions

### Financial Integrity
- [x] One transaction: post-row lock → status check after the lock → status update → append-only action row → open reports resolved by that action
- [x] Remove keeps `post_offers`, `media_assets` (and stored bytes), `post_likes` and earlier actions byte-for-byte (tested). Nothing outside `posts.status` changes

### Code Quality
- [x] Queue: 3 queries total (groupBy, posts with newest 5 open reports, reason groupBy), no N+1; shortcut comment on the 50-item limit

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 2 | Admins see reported posts in a queue and can dismiss, hide or remove them | PASS | Queue ordering, grouping, reasons; dismiss/hide/unhide/remove with status rules |
| 4 | Moderation actions never change financial history | PASS | Snapshot test before/after remove |

## Tests Run

- [x] `admin-moderation.integration.spec.ts`: 14 passed (covers TASK-089 and TASK-090)
- [x] Typecheck + lint + Prettier: clean
- [x] Edge cases: hide → public 404 / owner 200 / creator publish-archive-restore 409; unhide keeps `publishedAt`; unhide on a first-publish PENDING_REVIEW post → 409; hide on ARCHIVED/PENDING_REVIEW → 409; remove twice → 409; owner can't see a removed post, admin can; two parallel hides → one 200 + one 409 + one action; report racing dismiss → each report open or resolved by that action

## Notes

- Hidden/removed premium covers: the preview route already requires PUBLISHED, but a blurred preview fetched earlier may stay in browser/CDN caches (`immutable`, 1 year). Only the deliberately public blurred preview is affected, never originals.
- The queue also lists removed or held posts that still have open reports, so an admin can close them.
