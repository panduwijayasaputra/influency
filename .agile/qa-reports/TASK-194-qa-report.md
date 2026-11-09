# QA Report: TASK-194 — Onboarding flag, complete endpoint and post-login redirect

**Result:** PASS

- `users.onboarding_completed_at` (migration `20261109040000_user_onboarding`) is backfilled with `now()` for existing users; the seed gives demo users a value on create and never resets it. `GET /auth/me` returns `onboardingCompleted`.
- `POST /me/onboarding/complete`: 401 for a guest, 204 + `no-store`, idempotent (the stored instant is unchanged on a repeat, compared as raw epoch ms), only the caller's row, 403 without the web `Origin`. Written with the DB clock (`now()`), not a JS Date.
- Login (Telegram callback and dev login): a user who has not finished goes to `/welcome` (plus `?returnTo=…` when it is not `/`); one who has goes to `returnTo`. `returnTo` was already validated at login start, and unsafe values still become `/`. Applying as a creator (first submit and resubmit after a rejection) also marks onboarding done.
- Existing specs were updated on purpose: new Telegram users now land on `/welcome` (8 assertions in `auth.integration.spec.ts`), the returning-user test marks the user done first, and `me.integration.spec.ts` expects the new field. Web fixtures got `onboardingCompleted`.
- New: `onboarding.integration.spec.ts` (7), dev-login redirect case, seed case, completed-user callback case. Auth, creators and seed specs pass; API/web `typecheck` and `lint` clean.
- UAT note: to see the welcome again with a demo user run `UPDATE users SET onboarding_completed_at = NULL WHERE display_name = 'Subscriber A';` and use dev login.
