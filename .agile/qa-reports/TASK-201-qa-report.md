# QA Report: TASK-201 — Edit Profil page

**Result:** PASS (2026-11-09)

## Checked
- Current values shown (cover, avatar, name, bio with counter, category, plan price); the address `influency.com/{slug}` is plain text with a copy button (toast "Tautan disalin") and the note "Alamat profil tidak bisa diubah.".
- Price rules: whole number 10–5.000 Koin (LOCKED range from shared `PLAN_PRICE_MIN/MAX`); helper text uses the shared `subscriptionCreatorShareIdr` (Rp150.000 → Rp127.500); "Harga baru berlaku untuk langganan berikutnya."; 9, 5001, 12.5, abc and empty (when a plan exists) block saving.
- Partial save: only changed profile fields go in the PATCH; the plan PUT is sent only when the price changed and keeps the current `active` flag (the endpoint is strict `{ priceCoins, active }`). A failed plan PUT after a saved profile leaves only the price dirty and the retry sends only the plan.
- API validation issues map to their fields. Leaving: Batal asks first when dirty; `beforeunload` warns only while dirty.
- Web typecheck, lint, Prettier pass; web tests 108 files / 795 tests pass.
- Isolation/financial: no new API surface. The cache-expiry server action takes no arguments and derives the slug from the session, so it can only refresh the caller's own page. No money logic on the client.

## Changes beyond the plan
- `getPublicCreator` is tagged `creator:{slug}`; Edit Profil and image uploads call `refreshOwnPublicProfile` (server action, `updateTag`) so the cached public profile shows the new values at once.
- `getMyOwnPlan` throws on failure instead of reading as "no plan", and the page then shows a message instead of a form that could overwrite an existing plan.

## Known limitation
- The back arrow in the studio `PageHeader` is not guarded (Next.js App Router has no route-change blocking API). Only Batal and tab close ask for confirmation.
