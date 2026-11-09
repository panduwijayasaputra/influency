# US-016: Comment Actions Menu (edit, delete, pin)

**Status:** ready_for_uat
**Priority:** high
**Feature:** comments

## Description

As a comment author or post creator, I want a menu on each comment with the actions I'm allowed, so that I can fix, remove or highlight comments.

## Acceptance Criteria

- [ ] A `···` menu on each comment lists only the actions the viewer may take, driven by per-comment permission flags from the server (never computed from client-side role guesses):
  - **Edit** for the author
  - **Hapus** for the author, the post's creator, or an admin
  - **Sematkan / Lepas sematan** for the post's creator, on top-level comments only
  - Viewers with no allowed action see no menu.
- [ ] **Edit** opens an inline editor in the sheet with Simpan / Batal and the 500-character counter. The draft is kept if saving fails.
- [ ] **Hapus** asks for confirmation first. On success:
  - the comment becomes "Komentar dihapus" if it has replies, or disappears if it has none
  - the count updates
- [ ] Hapus works today through the existing delete API. Edit and pin show a "Segera hadir" toast until US-019 and US-020 wire them.
- [ ] The menu follows S07-Comments-Moderation, and it is keyboard and screen-reader accessible (menu role, focus return on close).

## Tasks

### TASK-113: canEdit and canPin flags (shared schema + API)
**Status:** done

### TASK-114: CommentActionsMenu component
**Status:** done

### TASK-115: Wire the menu and inline editor into CommentItem
**Status:** done
