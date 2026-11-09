# QA Report: TASK-069 — Studio "Sampul" UI

**Story:** US-048
**Result:** PASS
**Tester:** qa-agent

## Code Review

- [x] `post-cover.tsx` (client component):
  - Shows the preview `img`, or the "Belum ada sampul…" text.
  - "Unggah sampul" sends a raw PUT with the file's own type. The client type/size checks are UX only.
  - "Hapus sampul" button.
  - `aria-live` status; `router.refresh()` after success.
- [x] `post-media.tsx`: "Jadikan sampul" on READY items of premium posts (also when locked); a "Sampul" label marks the current cover. The page renders `PostCover` for PREMIUM posts
- [x] Labeled controls, Bahasa copy, mobile-first sizes

## Tests Run

- [x] `post-cover.test.tsx` (7), `post-media.test.tsx` (+3). Web: 161 passed

## Issues (if any)

None.
