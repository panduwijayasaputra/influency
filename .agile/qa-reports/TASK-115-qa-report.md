# QA Report: TASK-115 — Wire the menu and inline editor into CommentItem

**Result:** PASS

## Review
- The standalone Hapus button is replaced by `CommentActionsMenu`. Hapus still opens the existing confirm sheet and `remove()`; placeholder / count behaviour from US-015 is unchanged.
- Inline editor: prefilled, `n/500` counter, Simpan disabled for blank drafts, Simpan shows "Segera hadir" and keeps the draft (US-019 wires it), Batal restores the text and returns focus to `···`. The editor takes focus after the menu has closed (rAF), because the menu's focus trap would otherwise take it back.
- Pin shows "Segera hadir" (US-020). A deleted placeholder renders no menu, whatever flags it carries.

## Tests
- Existing delete tests now go through the menu. New `comment-thread.test.tsx` cases: no menu, edit flow, pin / unpin label, reply without pin, placeholder without menu. `comments-sheet.test.tsx`: Escape closes only the menu. Cancel of the delete sheet returns focus to `···`.
- `pnpm check` passes: shared 218, web 516, api 644.

## Notes
- Not checked in a browser at 375px against S07; the visual match is for UAT. jsdom cannot show the floating menu's z-order over the sheet.
