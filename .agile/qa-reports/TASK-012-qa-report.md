# QA Report: TASK-012 — Telegram username on auth identities and `/auth/me`

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] Schema change ships with migration `20261107063826_auth_identity_username` (`ALTER TABLE auth_identities ADD COLUMN username TEXT`). `schema-conventions.integration.spec.ts` passes.
- [x] The claim name `preferred_username` (`profile` scope, already requested as `openid profile`) is checked against https://core.telegram.org/bots/telegram-login#available-scopes.
- [x] Shared `meResponseSchema` has `username: z.string().nullable()`. The web fixtures are updated to match.

### Security
- [x] Identity is still matched only by `(provider, provider_sub)`. The username is never used for lookup, and the existing "never matches by name or username" test passes.
- [x] The username is validated as `^[A-Za-z0-9_]{1,64}$`. A malformed or non-string value is dropped (`.catch(undefined)`) and never fails login. It is not logged, and the web renders it as text.
- [x] `/auth/me` still derives roles from the DB. The username comes from the DB row, not from the session.

### Code Quality
- [x] The username is refreshed on each login only when it changed (one `update`). A `null` claim clears it, so a removed Telegram username doesn't linger.
- [x] The concurrent first-login P2002 path is unchanged.

## Acceptance Criteria Verification
- [x] `/auth/me` returns the real Telegram username for the drawer's "@username" line, or `null`.

## Tests Run
- `auth.integration.spec.ts`: the username is stored, refreshed (`ana_01` → `ana_new` → `null`) with the same user id, and a malformed username logs in with `null`.
- `me.integration.spec.ts`: `username: null` without an identity, and the identity's username when present.
- `telegram-oidc.client.spec.ts`: a valid username is kept; a malformed one and a non-string are dropped.
- `auth.test.ts` (shared): accepts a string or `null` and rejects a missing `username`.
- `pnpm check` green: shared 206, web 320, api 623.

## Notes
- Pre-existing flake, not caused by this task: `admin-moderation.integration.spec.ts` › "lists posts with open reports, oldest first" failed 1 run in 3 when run alone.
  - Cause: reports created in the same millisecond tie on `createdAt`, and `moderation.service.ts:67` orders by `createdAt` alone.
  - Fix later by adding an `id` tiebreak (as line 137 already does).
