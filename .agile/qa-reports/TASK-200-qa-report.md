# QA Report: TASK-200 — Entry points and the drafts list

**Result:** PASS (2026-11-09)

## Checked
- Owner sees "Post Baru" (also on an empty profile) and an "Edit" menu item on every card linking to `/studio/posts/{id}`; a non-owner sees neither (`creator-posts.test.tsx`). `PostCard` shows Edit only with `editHref`.
- `/studio` and `/studio/posts` restyled; status labels kept.
- `PostStatusActions` no longer offers Publikasikan for drafts (the editor saves first, then publishes); test updated.
- Web typecheck, lint, Prettier: pass.
- Web tests: 106 files / 768 tests pass (`pnpm --filter @influency/web exec vitest run`).
- Creator/user isolation: no new endpoints; every call uses existing studio endpoints that filter by `req.creatorProfileId`. Owner entry points are UX only (the studio guards decide).
- Financial integrity: the client only displays the price helper (≈Rp, 20% fee); the API owns the split and the offer validation.
