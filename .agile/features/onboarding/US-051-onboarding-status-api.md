# US-051: Onboarding Status & First-Login Redirect

**Status:** ready_for_uat
**Priority:** high
**Feature:** onboarding

## Description

As a new user, I want to see the welcome exactly once after my first login, so that returning visits go straight to what I opened.

## Acceptance Criteria

- [x] The server stores when the user finished or skipped onboarding. Users that existed before the migration count as done. `GET /auth/me` exposes `onboardingCompleted`.
- [x] `POST /me/onboarding/complete` (session + CSRF) marks it done. It is idempotent (repeating keeps the first timestamp) and only affects the caller. Submitting a creator application also marks it done.
- [x] After the Telegram login callback, a user who has not finished is redirected to `/welcome?returnTo=…` with the original `returnTo` kept and still validated as a same-origin relative path. A user who has finished goes to `returnTo` as today.
- [x] Visiting `/welcome` after finishing redirects to Beranda. The UI from US-048/US-049 uses these endpoints instead of dummy data.
- [x] Integration tests cover a new vs existing user, idempotency, isolation, the redirect with and without `returnTo`, and an unsafe `returnTo` being rejected.

## Tasks

### TASK-194: Onboarding flag, complete endpoint and post-login redirect
**Status:** done

### TASK-195: Wire the welcome UI to the onboarding API
**Status:** done
