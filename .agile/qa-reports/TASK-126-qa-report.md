# QA Report: TASK-126 — Wire the sheet's Edit action

**Result:** PASS

## Review
- `Simpan` now calls `onEdit`; the editor closes only on success and focus returns to the `···` trigger. On failure the editor and draft stay, the API message shows in a `role="alert"`, and Simpan is enabled again; typing clears the message. Simpan is disabled while saving or for an empty draft.
- `applyEdit` merges only `body` and `editedAt` into the top-level comment or the matching reply; replies, `replyCount`, `pinned`, `canPin` are kept.
- The PATCH does not use the composer's shared error line. No permission is decided on the client.

## Tests
- `comment-thread.test.tsx` (save trims and closes, retry after failure, Batal), `post-comments.test.tsx` (PATCH body, Diedit, API error, network error, `applyEdit` cases). The old "Simpan = Segera hadir" assertion was replaced.
- `pnpm check` passes (format, lint, typecheck; shared 221, web 533, api 688).

## Notes
- Not checked in a browser at 375px; the editor error line's look is for UAT.
