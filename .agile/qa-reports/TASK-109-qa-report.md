# QA Report: TASK-109 — PostCard opens the comments sheet

**Result:** PASS

## Review
- Komentar is a `<button aria-haspopup="dialog">` in feed mode, so there is no navigation. In `detail` mode it stays a `#komentar` link, since the page has the inline section.
- `CommentsSheet` mounts on first open only, so a feed of cards does not mount a dialog per card. Radix `BottomSheet` pauses video on open (US-009) and restores focus on close.
- The count is a local copy of `post.commentCount`, adjusted by `onCountChange`. The server's count remains the source on reload.
- Guests can open the sheet on free posts. The writing rules stay server-side and in `PostComments`.

## Tests
- `post-card.test.tsx` covers:
  - opening the sheet without a link
  - Escape closes and the card remains
  - posting bumps the card count and the sheet title
  - locked premium: locked state with no comments fetch
  - guest reads comments and gets "Masuk untuk berkomentar"
  - detail mode keeps the `#komentar` link
- `pnpm check` passes.

## Notes
- Not browser-tested at a real phone width (keyboard inset behaviour comes from the existing `BottomSheet`, covered by its own tests). Worth checking during UAT.
