# QA Report: TASK-199 — PostEditor media strip

**Result:** PASS (2026-11-09)

## Checked
- `usePostMedia`: slot → storage PUT / provider multipart POST → complete; type and size checks before any call; limit refused client-side and by `MEDIA_LIMIT_REACHED`; failed uploads become removable REJECTED items; PROCESSING re-check every 5 s keeps the creator's order; locked mode only removes failed items.
- Editor: draft created once on the first add, then reused; move left/right (keyboard-reachable buttons, disabled at the ends), "Sampul" follows index 0, remove, failure reasons shown.
- Old `post-media`, `post-cover`, `post-offer-form`, `post-form` and their tests are removed; no remaining importers.
- Web typecheck, lint, Prettier: pass.
- Web tests: 106 files / 768 tests pass (`pnpm --filter @influency/web exec vitest run`).
- Creator/user isolation: no new endpoints; every call uses existing studio endpoints that filter by `req.creatorProfileId`. Owner entry points are UX only (the studio guards decide).
- Financial integrity: the client only displays the price helper (≈Rp, 20% fee); the API owns the split and the offer validation.
