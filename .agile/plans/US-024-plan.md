# Technical Plan: US-024 — Follow API

## Architecture Overview

New table `creator_follows (id, user_id, creator_profile_id, created_at)` with `UNIQUE(user_id, creator_profile_id)` and an index on `creator_profile_id`.

API, in the `engagement` module next to likes (agreed, since the cached public profile stays cookie-less):

- `GET /creators/:slug/follow` (`OptionalSessionGuard`) → `{ following, followerCount }`
- `PUT /creators/:slug/follow` (`SessionGuard`, rate limited) → same shape, idempotent
- `DELETE /creators/:slug/follow` (`SessionGuard`, rate limited) → same shape, idempotent

All three use `cache-control: no-store`.

`followerCount` counts follows whose user has `status = 'ACTIVE'`. The public creator profile response does **not** change. This is the agreed deviation from the story wording, so that `getPublicCreator` keeps `'use cache'`.

Web: the creator page streams the follow state inside the existing `CreatorView` Suspense and passes it to a client `FollowProvider`. The provider feeds both the follower-count line in the header and the `FollowButton`.

## Dependencies

- A Prisma migration.

## Risks

- **Double click / races:** `upsert` on the unique key plus `deleteMany` make concurrent calls safe. No transaction is needed, because no money is involved.
- **Follow never touches entitlements.** The service imports nothing from entitlements or subscriptions. An integration test asserts that a premium post stays locked after following.

## Tasks

### TASK-138: Shared follow contract and migration

**Shared:**
- `packages/shared/src/creators.ts`: `followStateSchema = z.object({ following: z.boolean(), followerCount: z.int() })` and type `FollowState`.
- `packages/shared/src/errors.ts`: `CANNOT_FOLLOW_SELF` (400, "Kamu tidak bisa mengikuti profilmu sendiri."). Unknown or unapproved creators reuse `NOT_FOUND`.

**Prisma schema:**
- `model CreatorFollow { id uuidv7 @db.Uuid; userId @map("user_id") @db.Uuid; creatorProfileId @map("creator_profile_id") @db.Uuid; createdAt @map("created_at") @db.Timestamptz(3) @default(now()); user User @relation(onDelete: Cascade); creatorProfile CreatorProfile @relation(onDelete: Cascade); @@unique([userId, creatorProfileId]); @@index([creatorProfileId]); @@map("creator_follows") }`
- Back-relations on `User` and `CreatorProfile`.
- Migration `pnpm db:migrate --name creator_follows`, then `pnpm --filter @influency/api generate`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/creators.ts` | follow state schema |
| MODIFY | `packages/shared/src/errors.ts` | `CANNOT_FOLLOW_SELF` |
| MODIFY | `apps/api/prisma/schema.prisma` | `CreatorFollow` |
| CREATE | `apps/api/prisma/migrations/<ts>_creator_follows/` | migration |

**Testing:** the schema-conventions integration spec passes, and so does the shared schema parse test.

---

### TASK-139: Follow service and endpoints

**Service:** new `apps/api/src/modules/engagement/creator-follows.service.ts`, `CreatorFollowsService`.
- `private async creator(slug)`: `prisma.creatorProfile.findFirst({ where: { slug: slug.toLowerCase(), ...PUBLIC_CREATOR }, select: { id, userId } })`. If there is none, throw `DomainError('NOT_FOUND')`.
- `private count(creatorProfileId)`: `prisma.creatorFollow.count({ where: { creatorProfileId, user: { status: 'ACTIVE' } } })`.
- `state(slug, userId | null)`: `{ following: userId ? exists : false, followerCount }`.
- `follow(slug, userId)`:
  - if `creator.userId === userId`, throw `DomainError('CANNOT_FOLLOW_SELF')`
  - otherwise `prisma.creatorFollow.upsert({ where: { userId_creatorProfileId }, create, update: {} })`
  - return `state`
- `unfollow(slug, userId)`: `deleteMany({ userId, creatorProfileId })`, then return `state` (an unknown slug is still `NOT_FOUND`).

**Controller:** new `creator-follows.controller.ts`, `@Controller('creators')`.
- `GET :slug/follow` uses `OptionalSessionGuard`.
- `PUT` and `DELETE` use `@UseGuards(SessionGuard)` and `@RateLimit(FOLLOW_RATE_LIMIT)`, where `export const FOLLOW_RATE_LIMIT = { max: 60, timeWindow: '1 minute' }` follows the `POST_REPORT_RATE_LIMIT` pattern. Check how `RateLimitGuard` is applied there and copy it.
- Every handler sets `@Header('cache-control', 'no-store')`.
- Register both in `EngagementModule`. Confirm route precedence with `creator-profile.controller`'s `GET :slug`: different paths, no clash.

**Integration test:** `creator-follows.integration.spec.ts`. Copy the boot and fixtures pattern from `post-likes.integration.spec.ts`, with fixed ids `...000000290001-5`. Cases:
- a guest `GET` returns `{ following: false, followerCount }`
- a guest `PUT` returns 401
- `PUT` twice leaves one row, with `followerCount` 1 and `following` true
- `DELETE` twice returns 200 with `following` false and count 0
- following your own profile returns 400 `CANNOT_FOLLOW_SELF`
- an unknown or unapproved slug returns 404
- a mixed-case slug works
- a follower whose user is suspended is not counted
- a missing `Origin` header with the cookie returns 403 (CSRF)
- after following, `GET /creators/:slug/posts` still returns the premium post as `access: 'locked'`

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/engagement/creator-follows.service.ts` | rules |
| CREATE | `apps/api/src/modules/engagement/creator-follows.controller.ts` | endpoints |
| MODIFY | `apps/api/src/modules/engagement/engagement.module.ts` | register |
| CREATE | `apps/api/src/modules/engagement/creator-follows.integration.spec.ts` | tests |

---

### TASK-140: Web: wire Ikuti, follower count and the unfollow toast

**Data:**
- `lib/api/creator-follow.ts`:
  - `getFollowState(slug)` is server only. It sends the cookie the way `current-user.ts` does, is uncached, and returns null on error.
  - `setFollow(slug, following)` is client side: `PUT` or `DELETE` on same-origin `/api/v1/creators/${slug}/follow` with `credentials: 'include'`, parsed with `followStateSchema`. It throws on non-OK.

**FollowButton:**
- New props `initialFollowing` and `onChange?(state: FollowState)`.
- Optimistic toggle, with the button disabled while the request is pending.
- On failure, roll back and show `toast('Gagal memperbarui. Coba lagi.')`.
- On unfollow success, show `toast('Berhenti mengikuti. Langganan tidak terpengaruh.')`. Follow success shows no toast.
- Remove "Segera hadir".

**Follower count on the profile:**
- New `app/(public)/[creatorSlug]/follow-state.tsx`, client. It has `FollowProvider({ initial: FollowState | null, children })` holding `{ following, followerCount }` in context, with:
  - `FollowerCount`: renders `${formatCompact(count)} pengikut` using `Intl.NumberFormat('id-ID', { notation: 'compact' })`, with the full number in `aria-label`, and nothing when the state is null
  - `ProfileFollowButton`: a `FollowButton` bound to the context
- `ProfileHeader` gets an optional `stats?: ReactNode` slot rendered under the `@slug` line.
- `CreatorView`:
  - fetches `getFollowState(creator.slug)` in parallel with the owner lookup
  - wraps the header in `FollowProvider`
  - passes `stats={<FollowerCount />}`
  - `ProfileActions` renders `ProfileFollowButton` for signed-in viewers
  - guests keep the login link and still see the count, since GET is public
- Fix the stale comment in `profile-actions.tsx` ("plan values are dummies until US-026"): change it to "until the purchases feature".

**Recommended cards:** `CreatorUntukmu` cards use `FollowButton` with `initialFollowing={false}`. Wiring them is automatic.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/creator-follow.ts` (+ `.test.ts`) | fetchers |
| MODIFY | `apps/web/src/components/follow-button.tsx` (+ test) | API wiring |
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/follow-state.tsx` (+ test) | provider, count |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/profile-header.tsx` | `stats` slot |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.tsx` (+ `page.test.tsx`) | streams state |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/profile-actions.tsx` (+ test) | bound button |

**Testing:**
- FollowButton:
  - an optimistic toggle is followed by the server state
  - a failure rolls back and shows the error toast
  - unfollow shows the "Langganan tidak terpengaruh" toast
  - the button is disabled while pending
- `FollowerCount` shows "1,2 rb pengikut" for 1200 and updates after a toggle in the provider.
- Page: a guest sees the count and an Ikuti login link, and the owner sees no Ikuti.
