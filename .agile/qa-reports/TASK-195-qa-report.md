# QA Report: TASK-195 — Wire the welcome UI to the onboarding API

**Result:** PASS

- `completeOnboarding()` now POSTs `/api/v1/me/onboarding/complete` with credentials and throws on a non-OK status (the user path already shows a toast and stays on failure). `saveMyProfile` is still the dummy until TASK-196.
- `/welcome` redirects a user who has finished to `returnTo` (`/` when unsafe), so it can't loop and is shown once.
- Tests: `onboarding.test.ts` (2), `welcome.test.tsx` (3). `typecheck` and `lint` clean.
