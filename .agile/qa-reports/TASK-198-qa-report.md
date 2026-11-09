# QA Report: TASK-198 — PostEditor form, validation and save flow

**Result:** PASS (2026-11-09)

## Checked
- Caption counter and limit, Gratis/Premium control, price 5–1,000 Koin (rejects 4, 1001, 2.5, abc, empty), helper text Rp25.000 / Rp20.000.
- Save sequence PATCH → offer → cover → publish in order; stops at the first failing step and keeps the form (test: COVER_SOURCE_UNAVAILABLE); MEDIA_PROCESSING mapped to a Bahasa message.
- Simpan draf saves without publishing; live posts show Simpan only, lock access, note the price applies to later purchases, never call publish.
- Web typecheck, lint, Prettier: pass.
- Web tests: 106 files / 768 tests pass (`pnpm --filter @influency/web exec vitest run`).
- Creator/user isolation: no new endpoints; every call uses existing studio endpoints that filter by `req.creatorProfileId`. Owner entry points are UX only (the studio guards decide).
- Financial integrity: the client only displays the price helper (≈Rp, 20% fee); the API owns the split and the offer validation.

## Issues found and fixed during QA
- Lint: `react-hooks/refs` (ref read during render for the price-changed note). Fixed by comparing with the post's offer prop.
- Test bug: one test did not stub the caption PATCH. Fixed.

## Notes
- The media-count text shows `n / POST_MEDIA_MAX_PER_POST`; the constant is 10 until US-059 sets it to 5.
- Media order is kept locally (`saveMediaOrder` is a documented dummy until US-059).
