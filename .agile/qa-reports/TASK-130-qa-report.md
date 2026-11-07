# QA Report: TASK-130 — Wire the sheet's Sematkan / Lepas sematan action

**Result:** PASS

## Review
- `PostComments.pin(id, next)` calls PUT / DELETE `/pin` through the existing `run()` (inline error with the API message on failure, nothing changes locally) and toasts "Komentar disematkan" / "Sematan dilepas". `applyPin` puts the target first with `pinned: true` and clears every other pin; an unpin keeps the order.
- `onPin(id, pin)` is a required `CommentRowProps` member; `CommentItem` passes `!pinned`. The "Segera hadir" toast is gone from comment-item (the editor's Simpan was wired by US-019).

## Tests
- `post-comments.test.tsx` (pinning): PUT, move to top, label and "Lepas sematan" in the menu; pinning a second comment leaves one label; DELETE removes the label; a 403 keeps the list and shows the message; no pin item without `canPin`. `comment-thread.test.tsx`: the menu calls `onPin` with the right flag.
- `pnpm check` passes: shared 224, web 538, api 705.

## Notes
- Not tried in a browser; the pinned label position and the menu over the sheet are for UAT. Unpinning leaves the comment where it is until the next load.
