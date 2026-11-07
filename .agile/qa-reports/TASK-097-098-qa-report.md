# QA Report: TASK-097, TASK-098 (US-011 Postingan and Grid Tabs)

**Result:** PASS

- Reviewed against the plan and acceptance criteria: Postingan/Grid tabs (Radix, announced, `?tab=grid` survives reload), PostCards newest first, 3-column Grid (video duration, locked tiles show preview + lock and never call media-access, tiles link to post detail until US-013), Media + Akses filters combine with "Tidak ada yang cocok" + hint, empty and error messages shown without tabs and without breaking the header.
- Security: no API change. Locked tiles use only the server-generated preview; accessible tiles get URLs only from the access-checked media-access call in the browser; an SSR test asserts no media URLs in the grid markup.
- `pnpm check` passes (format, lint, typecheck, api 643 tests, web 441 tests).
- Known shortcut: one media-access call per accessible tile (60/min limit) and full-size originals, noted in code.
- Not checked: visual match to design artboards and real-device behavior (UAT).
