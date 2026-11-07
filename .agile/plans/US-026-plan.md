# Technical Plan: US-026 — Recommended Creators API

## Architecture Overview

`GET /creators/recommended` (agreed) in the `creators` module:
- `SessionGuard`, `cache-control: no-store`
- returns `{ creators: RecommendedCreator[] }` (TASK-136 contract)

Candidates are `PUBLIC_CREATOR` profiles where `userId != viewer` and the viewer has no follow. They are ranked by a placeholder in `recommended-order.ts`: follower count (active users) descending, then `createdAt` desc. The limit is `RECOMMENDED_CREATORS_LIMIT`.

**Route clash:** the static `/creators/recommended` path wins over `GET /creators/:slug` in Fastify, so a creator slugged `recommended` would lose its API. Add `'recommended'` to `RESERVED_SLUGS` in shared so it cannot be claimed.

## Dependencies

- `creator_follows` from TASK-138.

## Risks

- **Counting followers for every creator:** fine at MVP scale with Prisma `_count` and an `orderBy` on the relation count. Add a `shortcut:` comment that says to move to a cached count or materialized ranking past roughly 10k creators.
- **An existing creator already slugged `recommended`:** check the dev DB. The application slug validation only affects new applications.

## Tasks

### TASK-143: Recommended creators endpoint

**Shared:** add `'recommended'` to `RESERVED_SLUGS` (`packages/shared/src/creators.ts`) and update the shared slug test.

**Order** (new `apps/api/src/modules/creators/recommended-order.ts`):
- `RECOMMENDED_ORDER = [{ follows: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }]`, with a PLACEHOLDER comment pointing to feature.md.
- Ordering by `_count` counts every follow, but the response count is active-only. Document that the order counts all follows and the displayed count is the active one, so a suspended follower may slightly inflate a creator's rank. Acceptable for a placeholder.

**Service** (`CreatorProfileService`, or a small new `RecommendedCreatorsService` in the creators module; prefer the existing service):
- `recommended(userId)`: `prisma.creatorProfile.findMany({ where: { ...PUBLIC_CREATOR, userId: { not: userId }, follows: { none: { userId } } }, orderBy: RECOMMENDED_ORDER, take: RECOMMENDED_CREATORS_LIMIT, select: { slug, displayName, avatarKey, bannerKey, _count: { select: { follows: { where: { user: { status: 'ACTIVE' } } } } } } })`
- Map with `imageUrl`.

**Controller:** add `@Get('recommended')` with `@UseGuards(SessionGuard)` to `CreatorProfileController`, declared **before** `@Get(':slug')`.

**Integration test:** `recommended-creators.integration.spec.ts`, with fixed ids `...000000310001+`. Cases:
- a guest gets 401
- the viewer's own profile, followed creators, unapproved creators and creators with a suspended user are excluded
- order: 3 followers before 1 follower, and a tie goes to the newest creator first
- the limit is 15 with 17 candidates
- only public fields come back (`Object.keys` equality)
- `GET /creators/:slug` for a normal slug still works

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/creators.ts` (+ test) | reserve slug |
| CREATE | `apps/api/src/modules/creators/recommended-order.ts` | placeholder order |
| MODIFY | `apps/api/src/modules/creators/creator-profile.service.ts` | `recommended` |
| MODIFY | `apps/api/src/modules/creators/creator-profile.controller.ts` | route |
| CREATE | `apps/api/src/modules/creators/recommended-creators.integration.spec.ts` | tests |

---

### TASK-144: Web: read the recommendations API

- Replace the body of `fetchRecommendedCreators()` with a same-origin `GET /${API_PREFIX}/creators/recommended` with `credentials: 'include'`, parsed with `recommendedCreatorListSchema`.
- Drop `ownSlug` from it and from `HomeFeed`, and from `app/page.tsx` if nothing else uses it.
- Delete `DEMO_RECOMMENDED_SLUGS`.
- A card followed in this session stays as "Diikuti" until the next load. FollowButton keeps its own state, and the list is fetched once per mount, so this needs no change. Add a test.
- Update `codebase-map.md` with the route and the `creator_follows` table.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/lib/api/recommended-creators.ts` (+ test) | real API |
| MODIFY | `apps/web/src/components/home-feed/home-feed.tsx` (+ test) | drop ownSlug |
| MODIFY | `apps/web/src/app/page.tsx` (+ test) | drop own-slug lookup |
| MODIFY | `apps/web/src/lib/demo.ts` | remove demo slugs |
| MODIFY | `.agile/guidelines/codebase-map.md` | routes/tables |

**Testing:**
- The source parses the list and returns `[]` when the API answers with an error, so the block hides.
- After following a card, it still shows "Diikuti" with no refetch.
