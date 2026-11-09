# QA Report: TASK-191 — User path (Profil, Ikuti creator, done)

**Result:** PASS

- Profil: prefilled name and bio, read-only Telegram username (hidden when null), `updateMyProfileSchema` validation ("Masukkan nama tampilan." blocks Lanjut), a failed save keeps the input and shows an alert.
- Ikuti: reuses `fetchRecommendedCreators` (fetched once) and `FollowButton`; only server-confirmed follows are counted; loading, error with retry and empty states; Lewati and Selesai both call `completeOnboarding` once; a failure shows a toast and stays.
- Done screen: count text or the generic text; "Mulai menjelajah" links to `returnTo`. No Koin or purchase action in the path.
- Tests: `user-path.test.tsx` (11) and `onboarding.test.tsx` (4). `typecheck` and `lint` clean.
