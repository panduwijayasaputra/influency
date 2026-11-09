# Technical Plan: US-052 — Update My Profile API

## Architecture Overview

`PATCH /me/profile` lives in the auth module, next to `GET /auth/me`, which owns `MeResponse`.

- The body is validated by the shared `updateMyProfileSchema` (a strict object, from TASK-191), so unknown and privileged keys get 400.
- It updates only `users.display_name` and `users.bio` for `req.authSession.userId`, and returns `AuthService.me(userId)`.
- The creator profile's `display_name` is a separate column and is not touched.
- The web `saveMyProfile()` swaps from the dummy to this call.

## Dependencies

- TASK-191 (`updateMyProfileSchema`, the Profil step).

## Risks

- **Schema shape:** `updateMyProfileSchema` requires both fields. That fits the onboarding form (it always sends both). A future Edit Profil that sends one field would need `.partial()`; don't add it now.
- **Database limit:** `users.bio` already has CHECK ≤ 500 (US-043). The display name has no DB limit, and Zod enforces 60 at the trust boundary.

## Tasks

### TASK-196: `PATCH /me/profile` and wire the Profil step

- `auth/me-profile.controller.ts`: `@Controller('me/profile')` with `@Patch() @UseGuards(SessionGuard)`.
  - Body goes through `new ZodValidationPipe(updateMyProfileSchema)`, the same pattern as other controllers. `cache-control: no-store`.
  - It calls `AuthService.updateProfile(userId, input)`.
- `AuthService.updateProfile(userId, { displayName, bio })` runs `prisma.user.update({ where: { id: userId }, data: { displayName, bio: bio || null } })` and then `return this.me(userId)`.
- Register the controller in `auth.module.ts`.
- Rate limit: none (it's a low-risk self-edit; other self-edits don't have one). Add one only if `backend.md` requires it for mutations, using `@RateLimit` per handler (not class-level, a lesson from US-044).
- Web `lib/api/onboarding.ts` `saveMyProfile(input)`:
  - `fetch('/api/v1/me/profile', { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body })` with the same CSRF handling as other mutations.
  - Throw on `!res.ok`, and parse with `meResponseSchema`.
  - Remove the DUMMY marker (the file should then have none).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/auth/me-profile.controller.ts` (+ `me-profile.integration.spec.ts`) | endpoint |
| MODIFY | `apps/api/src/modules/auth/auth.service.ts`, `auth.module.ts` | updateProfile |
| MODIFY | `apps/web/src/lib/api/onboarding.ts` (+ test) | real call |

**Testing (integration):**
- 401 for a guest.
- A valid update returns the `MeResponse` with the new name and bio, and a later `/auth/me` matches.
- The input is trimmed.
- `bio: ''` stores null.
- An empty name, 61 characters or a 501-character bio → 400 `VALIDATION_FAILED` with the field path.
- `{ displayName, bio, roles: ['ADMIN'] }` and `{ ..., username: 'x' }` → 400 (strict), and the DB is unchanged.
- An approved creator updating their name leaves `creator_profiles.display_name` unchanged.
- User A's update does not change user B.
- CSRF: a missing header is rejected.
- Web `onboarding.test.ts`: PATCHes with the JSON body, parses the response, throws on 400.
