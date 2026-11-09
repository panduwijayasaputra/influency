# QA Report: TASK-099 — PostCard detail mode

**Result:** PASS (2026-11-07)

- Reviewed against US-012 acceptance criteria and frontend.md: web only, no API/schema change, no premium URLs in SSR (locked posts never call media-access; tested), login return paths use `loginHref`, plain-text comments unchanged, 44 px targets kept.
- `pnpm --filter @influency/web` test (59 files, 448 tests), typecheck, lint and `prettier --check` all pass.
- New tests: detail mode (caption, Komentar anchor, guest return path, locked Buka without detail link, null `publishedAt`), post page (card, locked guest/signed-in, status notice, not found), composer (bottom offset for nav / guest / keyboard, sheet variant), `ScrollToComments`.
- Not covered by automation: real iOS keyboard offset and hash scroll after streaming — manual UAT.
