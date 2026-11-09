# QA Report: TASK-175 — `FollowingView` and the `/following` page

**Result:** PASS

- Criteria checked: title, count (`id-ID` grouping), sort (Terakhir diikuti / Nama A–Z), Grid / Vertikal (2 or 1 columns), cards link to `/{slug}` with a 2-line clamped bio, separate-from-subscription copy, empty state with **Jelajahi** to `/discover`, skeleton, retryable error, logged-out redirect with `returnTo=/following`, stub removed.
- Per the confirmed decision there is no unfollow control on the cards (asserted in a test); the story criterion was updated by the Tech Lead.
- A shared `CreatorCard` (`components/user-area/creator-card.tsx`) was added; US-042 reuses it.
- Tests: `following-view.test.tsx` (5), `following/page.test.tsx` (2) pass. Full web suite, `typecheck`, `lint`, `prettier --check` clean.
