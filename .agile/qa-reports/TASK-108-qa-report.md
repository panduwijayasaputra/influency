# QA Report: TASK-108 — Shared CommentsSheet with locked state

**Result:** PASS

## Review
- **Guidelines:** client components only where interactive. Sheets use `BottomSheet`. Copy is in Bahasa Indonesia. No `any`. Files moved with `git mv`, and no import of the old paths remains (`tsc` is clean).
- **Security / isolation:** a locked post (`access === 'locked'`) never calls `GET /posts/:id/comments`, so no comment text, names or avatars are requested. The API still enforces the 403 for locked posts (unchanged), and the 403 fallback message is kept. The access decision stays server-side: `post.access` comes from the server, and the client only avoids a request that would be refused. Guest CTAs link to `loginHref(path)`, which is a same-origin relative path.
- **Financial:** no financial code. The purchase sheets are the existing demo (toast only, `DEMO_*`), with no wallet or ledger interaction.
- **Refactor safety:** `PostUnlockSheet` / `SubscribeSheet` keep the exact labels, so the existing post-card and profile-actions tests pass unchanged.

## Tests
- `comments-sheet.test.tsx` covers:
  - fetch only when open
  - 403 and error + retry
  - guest login link
  - tall size
  - locked, signed in: no fetch, both CTAs, no composer
  - Buka opens the unlock sheet over the comments sheet
  - locked guest: both CTAs link to login with `returnTo`, no fetch
- `post-comments.test.tsx` covers `onCountChange` (+1 on post, -1 on delete, none on failure).
- `pnpm check`: lint, typecheck, format and tests all pass (web 482, api 643, shared 212).

## Notes
- The viewer's sheet title uses the card's original `commentCount`, so the count shown inside the viewer may lag behind comments added in the card sheet in the same session. Cosmetic, left as is.
