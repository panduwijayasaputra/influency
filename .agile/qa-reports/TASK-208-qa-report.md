# QA Report: TASK-208 — Reorder endpoint + web wiring

**Result:** PASS (2026-11-09)

## Checked
- `PUT /api/v1/creators/me/posts/:postId/media/order` (`ApprovedCreatorGuard`, global CSRF, strict body `{ mediaIds: uuid[] }`): under the post-row lock (the same lock uploads and deletes take) and only while the post is a draft (`POST_LOCKED` otherwise); answers with the studio list in the new order, `no-store`.
- Validation (400 `VALIDATION_FAILED`, nothing changes): a missing visible item, a duplicate, an unknown id, another post's media id, an empty list, a malformed id, an extra key, a missing field. In-flight uploads the studio list hides may be left out and follow the listed items (so a client whose upload failed locally can still save).
- Isolation: another creator's post → 404 and its media untouched; unknown post → 404; guest 401; plain user 403 `CREATOR_NOT_APPROVED`; cross-site Origin → 403.
- The new order is what the studio list and the viewer (media-access) return afterwards; saving the same order twice is a no-op; a reorder racing an upload leaves unique positions and the creator's order for the ready items.
- Web: `saveMediaOrder` is a real `PUT` (the dummy is gone). The editor sends the order only for a changed draft, before the offer and the cover (so the cover follows the new first item); a failure stops before publish and the retry sends it again; never for a live post.
- Full `pnpm check`: format, lint, typecheck; shared 306, API 1132, web 883 tests pass.

## Notes
- Updates use one `update` per item (at most a handful per post) inside the transaction; a single SQL statement was not worth the extra code at this size.
