# QA Report: TASK-112 — Thread rendering in PostComments

**Result:** PASS

## Review
- **Deleted comments never leak text:** `CommentItem` returns only "Komentar dihapus" when `deleted`, ignoring `body`, `author` and `avatarUrl` (tested with real-looking values). A deleted parent with no replies renders nothing.
- **Local delete:** a parent that has replies becomes the placeholder (text dropped, pin cleared, `canDelete` false), and a plain comment or a reply is removed. A reply removal lowers the parent's `replyCount`. `onCountChange(-1)` is unchanged.
- **Plain text only:** comment bodies are still rendered as React text, never as HTML.
- **Layout:** the name uses `truncate`, the body uses `wrap-break-word`, and the avatar and text columns use `min-w-0`. jsdom cannot measure layout, so this is checked by class only.
- **Accessibility:** the replies toggle has `aria-expanded` and `aria-controls`. Action targets are at least 44px high, and the time is in a `<time>` element.
- **Unchanged:** composer, inline errors, load more, delete confirm, keyboard inset.

## Tests
- `comment-thread.test.tsx` covers: today's API shape, initials versus avatar image, pinned, edited and not-edited, collapsed and expanded replies, a deleted parent with and without replies, like state, Balas for a guest, a signed-in user and a viewer who cannot comment, and long names.
- `post-comments.test.tsx` adds the three thread delete cases.
- Fix during QA: `PostComments` now needs the root `Toaster` (it is mounted in the root layout). Tests that render it directly, including `page.test.tsx`, wrap it in `Toaster`.
- `pnpm check` passes: shared 217, web 502, api 643.

## Notes
- Not checked in a browser at 375px against the S05 artboard. The visual match (spacing, colours) is for UAT.
