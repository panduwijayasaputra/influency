# Technical Plan: US-020 — Server-Side Access Check

## Architecture Overview

One pure rule plus one thin service in a new `entitlements` module (the module name from handoff §4). US-021 (media access) and US-014 (post detail) will call the service. US-050 will add purchase, subscription and archive-grant sources to the same rule.

The rule returns one of three decisions, not a boolean, because callers need to tell them apart:

| Decision | Meaning | Later caller behaviour |
|----------|---------|------------------------|
| `full` | viewer may see the whole post (media included) | US-021 mints media URLs |
| `locked` | post exists publicly but is premium and not unlocked | US-014 shows the paywall preview; US-021 → 403 `FORBIDDEN` |
| `hidden` | viewer must not learn the post exists | 404 `NOT_FOUND` |

Rule, evaluated in this order (agreed with the user):

1. Viewer is ADMIN → `full` for every status and visibility (moderation, takedown).
2. Post is `REMOVED` → `hidden` (owner included).
3. Viewer owns the post (`creator_profiles.user_id = viewer`) → `full` for any other status (DRAFT, PROCESSING, PENDING_REVIEW, PUBLISHED, ARCHIVED).
4. Post is not `PUBLISHED`, or the creator is not public (`PUBLIC_CREATOR`: APPROVED profile + ACTIVE user, the same rule the public feed uses) → `hidden`.
5. `FREE` → `full`; `PREMIUM` → `locked`. US-050 inserts its paid sources here, before `locked`.

Trust boundary: the service takes only `postId` and the session's `userId | null`. Status, visibility, ownership and admin role are read from the DB on each call. Nothing comes from the client (`isPremium`, `unlocked`, etc. are never inputs). No rule depends on time yet. US-050 adds a `now` argument and must fill it from the server clock (or DB `now()`), never from a request value.

Not in this story: no endpoint (US-014/US-021 add them), no optional-session guard for public routes (the first caller adds it), no changes to the feed (`PublicPostsService` already applies steps 4–5 for listing).

## Dependencies

- None. Uses the existing `PrismaService`, `PUBLIC_CREATOR` (`apps/api/src/modules/creators/creator-profile.service.ts`) and the `user_roles` ADMIN row (same lookup as `AdminGuard`).

## Risks

- **A caller passes a client value as `userId`.** Mitigation: the JSDoc says `userId` must come from `req.authSession`. QA must check this in US-014/US-021.
- **The owner sees an archived post as `full` while the public sees `hidden`.** This is intended (AC 2). Callers must not cache owner responses publicly; they should use `no-store`, as the studio already does.
- **Admin `full` on everything.** This is broader than the literal AC. The user chose it on 2026-11-04 for moderation, and it is recorded here.
- **The story text says archived (`HIDDEN`).** The status was renamed `ARCHIVED` in US-047, and the story wording has been updated.

## Tasks

### TASK-062: Pure post access rule + unit tests

Create `apps/api/src/modules/entitlements/post-access.ts`:

```ts
import type { PostStatus, PostVisibility } from '../../generated/prisma/client.js'; // match the import path posts.service.ts uses for Prisma enums

export type PostAccess = 'full' | 'locked' | 'hidden';

export interface PostAccessFacts {
  status: PostStatus;
  visibility: PostVisibility;
  ownerUserId: string;
  /** Creator is APPROVED and their user ACTIVE (PUBLIC_CREATOR). */
  creatorPublic: boolean;
}

/** null = anonymous. Always built from the session and DB, never from request data. */
export type PostViewer = { userId: string; isAdmin: boolean } | null;

/** Single access rule for every post view (handoff §6.4). US-050 adds paid sources before 'locked'. */
export function decidePostAccess(post: PostAccessFacts, viewer: PostViewer): PostAccess
```

The body follows steps 1–5 in the Architecture Overview, one `if` per step. No classes or options.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/entitlements/post-access.ts` | `decidePostAccess`, `PostAccess`, `PostAccessFacts`, `PostViewer` |
| CREATE | `apps/api/src/modules/entitlements/post-access.spec.ts` | table-driven unit tests |

**Testing** (`it.each` table, plain Vitest, no DB):
- Anonymous viewer and another user: PUBLISHED FREE → `full`, PUBLISHED PREMIUM → `locked`.
- Anonymous viewer: DRAFT, PROCESSING, PENDING_REVIEW, ARCHIVED, REMOVED → `hidden`, for both FREE and PREMIUM.
- Owner: DRAFT, PENDING_REVIEW, ARCHIVED, PUBLISHED PREMIUM → `full`. Owner of a REMOVED post → `hidden`.
- Admin (not owner): REMOVED, DRAFT, PUBLISHED PREMIUM → `full`.
- `creatorPublic: false`: PUBLISHED FREE for anonymous → `hidden`, for the owner → `full`.
- Premium-denied case: a logged-in non-owner on PUBLISHED PREMIUM → `locked`, never `full`.

---

### TASK-063: PostAccessService in EntitlementsModule + integration test

Create `apps/api/src/modules/entitlements/post-access.service.ts`:

```ts
@Injectable()
export class PostAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** userId must be req.authSession?.userId (or null): never a client-supplied value. */
  async check(postId: string, userId: string | null): Promise<PostAccess>
}
```

- Run one `prisma.post.findUnique({ where: { id: postId }, select: { status, visibility, creatorProfile: { select: { userId, status, user: { select: { status } } } } } })`. If no row is found, return `'hidden'`.
- `creatorPublic = creatorProfile.status === PUBLIC_CREATOR.status && creatorProfile.user.status === PUBLIC_CREATOR.user.status`. Read the values from `PUBLIC_CREATOR` so the feed and this check cannot drift apart.
- Admin: only when `userId` is set, `prisma.userRole.findUnique({ where: { userId_role: { userId, role: 'ADMIN' } }, select: { id: true } })`. Run it in parallel with the post query using `Promise.all`.
- Return `decidePostAccess(facts, userId ? { userId, isAdmin } : null)`.
- Callers validate the uuid format (`ParseUUIDPipe`), so this service doesn't.

Create `apps/api/src/modules/entitlements/entitlements.module.ts`: `@Module({ providers: [PostAccessService], exports: [PostAccessService] })`. Add `EntitlementsModule` to the `AppModule` imports. US-014 and US-021 will import it where they need it.

Update `.agile/guidelines/codebase-map.md`:
- Add an `entitlements` row to API Modules.
- Add a Patterns bullet: "Every post view goes through `PostAccessService.check(postId, req.authSession?.userId ?? null)` → `full | locked | hidden`. Never re-implement the rule, and never pass client flags."
- Add `23` (post-access) to the fixed-id ranges list.
- Mark US-020 in the feature backlog table.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/entitlements/post-access.service.ts` | loads facts from the DB, calls `decidePostAccess` |
| CREATE | `apps/api/src/modules/entitlements/entitlements.module.ts` | provides + exports `PostAccessService` |
| MODIFY | `apps/api/src/app.module.ts` | import `EntitlementsModule` |
| CREATE | `apps/api/src/modules/entitlements/post-access.service.integration.spec.ts` | real-Postgres checks |
| MODIFY | `.agile/guidelines/codebase-map.md` | module, pattern, id range |

**Testing** (`post-access.service.integration.spec.ts`; boot with `createApp({ logger: false })` and `app.get(PostAccessService)`; seed rows with `createTestPrisma()` + `profileFields()`; fixed ids in range `0190a000-0000-7000-8000-00000023xxxx`; clean up in `afterAll`, as in `public-posts.integration.spec.ts`):
- Unknown post id → `hidden`.
- PUBLISHED FREE: anonymous → `full`. PUBLISHED PREMIUM: anonymous and another user → `locked`.
- DRAFT and ARCHIVED: owner → `full`, anonymous → `hidden`.
- REMOVED: owner → `hidden`, a user with an ADMIN `user_roles` row → `full`.
- Creator with a SUSPENDED user: PUBLISHED FREE for anonymous → `hidden`.
- Run `pnpm check` from the root.
