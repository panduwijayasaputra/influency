# Technical Plan: US-051 — Onboarding Status & First-Login Redirect

## Architecture Overview

- **Data:** a new nullable `users.onboarding_completed_at timestamptz`. The migration backfills `now()` for every existing user, so only users created afterwards see the welcome.
- **Seed:** `seedUsers` sets the column for demo users.
- **Redirect:** decided in the API, where the login is completed.
  - `AuthService.completeLogin` and `devLogin` (same rule, per the decision) map the stored `returnTo` through `postLoginLocation(userId, returnTo)`.
  - It returns `/welcome?returnTo=<enc>` when the user has not completed onboarding (omitting the query when `returnTo === '/'`), and `returnTo` otherwise.
  - `returnTo` is still validated by `safeReturnTo` before storage (unchanged) and again on `/welcome`.
- **Endpoint:** `POST /me/onboarding/complete` (`SessionGuard`, CSRF guard is global).
  - It runs `updateMany({ where: { id, onboardingCompletedAt: null }, data: { onboardingCompletedAt: now() } })`, which is idempotent and keeps the first timestamp. It returns 204.
- **Apply:** `CreatorsService.apply` sets the same column (`null`-guarded) in the same request, so a creator applicant from `/welcome` is not sent back there.
- **`/auth/me`:** exposes `onboardingCompleted: boolean`.
- **Web:** `/welcome` redirects a completed user to `returnTo`, and `completeOnboarding()` calls the endpoint.

## Dependencies

- TASK-190 and TASK-191 (the UI to swap).

## Risks

- **Clock:** an ORM write of a JS `Date` is shifted −7 h in this environment (known quirk). Mitigation: write the timestamp with DB `now()`:
  - `$executeRaw\`UPDATE users SET onboarding_completed_at = now() WHERE id = ${id}::uuid AND onboarding_completed_at IS NULL\``
  - or `dbNow` passed to Prisma, matching existing code; the dev picks the existing pattern from `common/db-time.ts`.
- **Many specs build `MeResponse` fixtures**, so adding `onboardingCompleted` breaks typecheck in web tests. Mitigation: update fixtures with the same bulk edit used for `bio`/`creatorSlug` in US-043.
- **`auth.integration.spec.ts` asserts the callback `Location` header for new users**, so it now becomes `/welcome?...`. Update those assertions deliberately; they are the new behaviour.
- **UAT on demo users needs the flag cleared:** `UPDATE users SET onboarding_completed_at = NULL WHERE display_name = 'Subscriber A';`. Document this in the QA report.

## Tasks

### TASK-194: Onboarding flag, complete endpoint and post-login redirect

- `prisma/schema.prisma` `User`: `onboardingCompletedAt DateTime? @map("onboarding_completed_at") @db.Timestamptz(3)`.
  - Migration `20261109040000_user_onboarding`: `ALTER TABLE users ADD COLUMN onboarding_completed_at timestamptz(3); UPDATE users SET onboarding_completed_at = now();`.
  - Run `pnpm --filter @influency/api generate`.
- `prisma/seed/users.ts`: demo users are upserted with `onboardingCompletedAt` set on create and kept on update (don't null it on re-seed).
- Shared `auth.ts`: `meResponseSchema` gains `onboardingCompleted: z.boolean()`. Update `auth.test.ts`.
- `auth.service.ts`:
  - `me()` selects `onboardingCompletedAt` and returns `onboardingCompleted: user.onboardingCompletedAt !== null`.
  - Add `private async postLoginLocation(userId: string, returnTo: string): Promise<string>`. It reads the flag and returns `returnTo` when done; otherwise `'/welcome'`, plus `'?returnTo=' + encodeURIComponent(returnTo)` when `returnTo !== '/'`.
  - `completeLogin` returns `{ ok: true, sessionToken, returnTo: await this.postLoginLocation(userId, returnTo) }`.
  - `devLogin` returns `{ sessionToken, location }` (or the controller calls a public `postLoginLocation`). The controller redirects to it instead of `safeReturnTo(returnTo)`.
  - Keep the controller's existing `safeReturnTo` on input.
- `auth/onboarding.controller.ts`: `@Controller('me/onboarding')` with `@Post('complete') @UseGuards(SessionGuard) @HttpCode(204)`. It calls `AuthService.completeOnboarding(userId)`, which is the null-guarded DB-time update, with `cache-control: no-store`. Register it in `auth.module.ts`.
- `creators.service.ts` `apply`: after a successful create or resubmit, run the same null-guarded update for `userId`. Inject nothing new: use `this.prisma` with the same raw `now()` statement. Extract the statement as `markOnboardingCompleted(prisma, userId)` in `apps/api/src/common/onboarding.ts`, used by both services.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | column |
| CREATE | `apps/api/prisma/migrations/20261109040000_user_onboarding/migration.sql` | add + backfill |
| MODIFY | `apps/api/prisma/seed/users.ts` | demo users done |
| MODIFY | `packages/shared/src/auth.ts` (+ test) | `onboardingCompleted` |
| CREATE | `apps/api/src/common/onboarding.ts` | `markOnboardingCompleted` |
| MODIFY | `apps/api/src/modules/auth/auth.service.ts`, `auth.controller.ts`, `auth.module.ts` | me, redirect, dev login |
| CREATE | `apps/api/src/modules/auth/onboarding.controller.ts` (+ `onboarding.integration.spec.ts`) | complete endpoint |
| MODIFY | `apps/api/src/modules/creators/creators.service.ts` | apply marks done |
| MODIFY | web test fixtures with `MeResponse` | new field |

**Testing (integration, real Postgres, Fastify inject):**
- `onboarding.integration.spec.ts`:
  - 401 for a guest.
  - A fresh user has `onboardingCompleted: false` in `/auth/me`; after POST it is `true` (204).
  - A second POST is 204 and the stored timestamp is unchanged (compare the raw DB value).
  - User A completing does not change user B.
  - POST without a CSRF header is rejected (the global guard; mirror an existing CSRF assertion).
- `auth.integration.spec.ts`:
  - A brand-new Telegram user with `returnTo=/claudia` → `Location: /welcome?returnTo=%2Fclaudia`.
  - A new user with no `returnTo` → `/welcome`.
  - An existing completed user → `/claudia`.
  - An unsafe `returnTo` (`//evil.com`) at start → the new user goes to `/welcome` with no query.
- `dev-login.integration.spec.ts`: a seeded demo user goes to `returnTo`. After nulling the flag, it goes to `/welcome?returnTo=…`.
- `creators` apply spec: after apply, `/auth/me.onboardingCompleted` is `true`.
- `me.integration.spec.ts`: the new field.
- `seed.integration.spec.ts`: demo users are completed, and a re-seed does not reset the flag.

---

### TASK-195: Wire the welcome UI to the onboarding API

- `lib/api/onboarding.ts`: `completeOnboarding()` becomes `fetch('/api/v1/me/onboarding/complete', { method: 'POST', credentials: 'include' })`. Throw on `!res.ok`.
  - The web fetch wrapper adds the CSRF header if the app uses one; check how `setFollow` and `setSaved` send mutations and copy exactly.
  - Remove the DUMMY marker for this function.
- `app/(subscriber)/welcome/welcome.tsx`: after the session check, `if (user.onboardingCompleted) redirect(returnTo)`. `returnTo` comes from `safeReturnTo`, and `/welcome` itself can't loop because the redirect only happens when completed.
- The user path's done CTA is already `returnTo`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/lib/api/onboarding.ts` (+ `onboarding.test.ts`) | real call |
| MODIFY | `apps/web/src/app/(subscriber)/welcome/welcome.tsx` (+ test) | done → redirect |

**Testing:**
- `onboarding.test.ts`: POSTs to the right URL with credentials; throws on 500.
- `welcome.test.tsx`: a completed user redirects to `returnTo` (and to `/` when it's unsafe); an incomplete user sees the choice.
