# QA Report: TASK-006 — Report form and comment-delete confirm as sheets, share toast, guidelines

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] No `window.confirm`/`alert` remains outside `/admin` (grep clean).
- [x] `frontend.md` has the BottomSheet/useToast rule. `codebase-map.md` lists the new components and the `--bottom-nav-height` contract.

### Security
- [x] The API still enforces reporting and comment deletion. The UI only changed its container. Comment bodies are still plain text.

### Code Quality
- [x] Laporkan, focus: after success the trigger unmounts. `onCloseAutoFocus` therefore moves focus to the "Laporan terkirim." paragraph instead of dropping it on `<body>`.
- [x] Laporkan, closing: it clears the error but keeps the reason and note, so an accidental swipe loses no input.

## Acceptance Criteria Verification
- [x] The ad-hoc sheets and dialogs on user-facing pages (report form, delete confirm) use `BottomSheet`. The copy-link confirmation is a toast.

## Tests Run
- `report-post-button.test.tsx`: 6 tests.
  - login link
  - hidden when the viewer can't report
  - validation
  - success → sheet closes, toast shows, focus moves to the status paragraph
  - API error shown inside the sheet
  - Batal → focus back on Laporkan
- `post-comments.test.tsx`: delete now goes through the sheet. New case: Batal sends no DELETE.
- New `share-button.test.tsx`: clipboard → toast; native share → no toast.
- Full `pnpm test` green (shared, api, web).

## Notes
- Known, pre-existing: after a comment is deleted, its Hapus button unmounts and focus falls to `<body>`. It behaved the same with `window.confirm`.
- Environment: twice during `pnpm check`, api integration files failed under parallel load ("Failed to resolve entry for @influency/shared" / import errors), with a different set of files each time.
  - The api suite passes on its own and on a full `pnpm test` rerun.
  - It is unrelated to US-002, which has no api or shared changes.
