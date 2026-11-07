# QA Report: TASK-104 — MediaViewer shell, slides, gestures

**Result:** PASS (2026-11-07)

- Reviewed against US-013 acceptance criteria and frontend.md: web only; locked media never opens the viewer or calls media-access; viewer is a labelled modal Radix dialog (focus trap, Escape, X "Tutup layar penuh" 44 px), swipe-down close ignores videos/buttons, motion off under reduced motion, videos use native controls, watermark via MediaItemView, other videos pause on open, comments sheet sits outside the drag frame.
- `pnpm check` (format, lint, typecheck, tests for shared 212, web 473, api 643) passes.
- Tests: like-button hooks, media-viewer (dialog, counter, start index, swipe, reduced motion, focus return, failure/locked), viewer-actions, viewer-comments (lazy fetch, 403, retry, guest), bottom-sheet className, PostCard viewer (open at slide, video button, like sync, locked), Grid tile viewer.
- Not automated: real swipe feel, iOS safe areas, scroll position after close, video sound — manual UAT.
- Note: a second Claude session wrote part of this story concurrently (viewer shell, grid wiring); reconciled and verified here.
