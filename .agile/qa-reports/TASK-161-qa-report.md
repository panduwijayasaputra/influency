# QA Report: TASK-161 — Kirim Tip sheet and entry points

**Result:** PASS

## Checked against the acceptance criteria

- **Entry points:** Kirim Tip appears on the post card, in the full-screen viewer and on the creator profile only when the server says so (`viewer.canTip` on a post, `subscription.viewer.canTip` on the profile). Guests have no `viewer`, so they never see it; the API rule excludes free posts, unpublished posts, locked posts and the viewer's own posts.
- **Sheet:** creator avatar/initials, name and @username; presets 5 / 10 / 25 / 50 / 100 with 10 selected; custom whole-number field limited to 1–1,000 (`tipRequestSchema` is the single source); balance; the note "Tip adalah ucapan terima kasih. Tip tidak membuka konten, dan Influency tidak memotong biaya tip."; "Perlu konfirmasi · usulan desain" label.
- **States:** invalid amount (0, 1,001, 2.5, text) disables Kirim with an inline message; short balance (local or reported by the server) → "Isi Koin · kurang N Koin" with a return path; sending → disabled with `aria-busy` and a ref guard against a double click; success → sheet closes with a toast; error → Bahasa message and "Coba lagi".
- **Idempotency-Key:** one per opening, same on a retry of the same amount, new when the amount changes (a different payload).
- **API change (additive):** `viewerOf` now returns `canTip = published && PREMIUM && access full && not owner`. This is an interim rule (admins also pass); the code carries a `shortcut:` comment and US-039 narrows it to paid access. The server remains the source of truth, nothing is computed in the browser.
- Dummy phase: `sendTip` is the dummy in `lib/api/purchases.ts`; the toast reads "Demo: … tidak ada Koin yang terpotong."

## Tests

`tip-sheet.test.tsx` (amount bounds, presets, double click, post vs profile target, key handling, shortfall, API error), `profile-actions.test.tsx` (profile entry for eligible viewers, never for guests), `post-card.test.tsx`, `viewer-actions.test.tsx`, `media-viewer.test.tsx` (sheet opens; hidden without `canTip`), API `public-posts.integration.spec.ts` (owner never, locked never, accessible premium yes) and `post-likes.integration.spec.ts`, shared `posts.test.ts`. `pnpm check` green: shared 248, API 871, web 656.

## Notes

- Behaviour change: the full-screen viewer used to show Kirim Tip to everyone (it toasted "Segera hadir"); it is now hidden when the viewer may not tip, including guests.
