# QA Report: TASK-190 — Welcome route, stepper chrome and path choice

**Result:** PASS

- `/welcome` is standalone (added to `STANDALONE_PREFIXES`, test extended); a guest is sent to `/login?returnTo=%2Fwelcome`; `returnTo` always goes through `safeReturnTo` (`//evil.com` becomes `/`).
- `welcome` is reserved in `RESERVED_SLUGS` (the parametrised shared test covers it) and in CLAUDE.md. Not checked: an existing creator with slug `welcome` in a real DB (no `psql` here; the demo seed has none).
- Radio cards have `aria-checked` and arrow-key movement; Lanjut is `aria-disabled` until a choice and the click is ignored; the header shows "Langkah X dari Y" with correct `progressbar` values; creator choice pushes `/become-creator?from=welcome`.
- `lib/api/onboarding.ts` holds the dummy `saveMyProfile`/`completeOnboarding` (replaced in TASK-195/196). `updateMyProfileSchema` was added to shared early (needed by its type); its tests are in `auth.test.ts`.
- Tests: onboarding (4), welcome (2), app-chrome, shared 257. `typecheck` and `lint` clean.
