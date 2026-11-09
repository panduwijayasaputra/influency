# QA Report: TASK-114 — CommentActionsMenu component

**Result:** PASS

## Review
- Built on Radix `DropdownMenu` (no new dependency): `role="menu"` / `menuitem`, arrow keys, Escape and focus return to the trigger come from Radix.
- Items follow the server flags only: Edit, Hapus, Sematkan / Lepas sematan. Pin is hidden for replies. No allowed action renders no trigger.
- Trigger is 44px, labelled per comment or reply, and disabled while a request runs. Pills use design tokens, not S07's raw hex. The content has `z-60`, above the sheet's `z-50`.
- After Edit, close auto-focus is cancelled so the editor can take focus; every other action returns focus to `···`.

## Tests
- `comment-actions-menu.test.tsx` (9 cases): no flags, author, owner, pinned, reply, aria attributes, Escape + focus return, callbacks, disabled.
- `pnpm check` passes.

## Notes
- Left/Right arrow keys do not move between the pills (Radix menus use Up/Down). Left as is for simplicity; Up/Down and Tab behaviour work.
