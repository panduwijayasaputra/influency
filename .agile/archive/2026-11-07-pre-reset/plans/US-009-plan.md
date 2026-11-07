# Technical Plan: US-009 — Current User & Role-Based Access

## Architecture Overview

Agreed with the user on 2026-11-03:

- **Roles are computed from the database on every request.** They are never stored on the session row or in the cookie, and never taken from Telegram claims. The session only identifies the user (`req.authSession.userId`).
  - `USER`: every account the `SessionGuard` lets through (active, live session).
  - `ADMIN`: a row in the new `user_roles` table. It is written only by the seed or by hand in the DB. No endpoint can grant it.
  - `CREATOR`: **derived**, never stored. It means the user's `creator_profiles.status = 'APPROVED'`. One source of truth: a pending, rejected or (later) suspended profile can never leave a stale role behind.
- **Minimal `creator_profiles` table now** (id, user_id UNIQUE, slug UNIQUE, status, timestamps), so the Studio check can be tested. US-010 adds bio/avatar, the slug rules (lowercase, allowed chars, reserved names) and the application flow. US-011 adds approve/reject.
- **API guards** live in `apps/api/src/common/`, next to `SessionGuard`. Both **extend `SessionGuard`**, so one decorator does the session check and the role check, and nobody can forget the session part:
  - `AdminGuard` → no session 401 `AUTH_REQUIRED`, not admin 403 `FORBIDDEN`.
  - `ApprovedCreatorGuard` → no session 401 `AUTH_REQUIRED`, no APPROVED profile 403 `CREATOR_NOT_APPROVED`. Sets `req.creatorProfileId` for later studio endpoints.
- **`GET /api/v1/auth/me`** (SessionGuard) → `{ id, displayName, roles }`. `roles` is in the fixed order `USER, CREATOR, ADMIN`. The shape is a Zod schema in `@influency/shared`, used by the web app too.
- **Web:**
  - A server-side `getCurrentUser()` (wrapped in React `cache`, forwards only the session cookie to the API).
  - `/studio` and `/admin` layouts that gate inside `<Suspense>`: no session → redirect to `/login?returnTo=/studio` (or `/admin`), wrong role → an access-denied message.
  - Placeholder `/studio` and `/admin` pages.
  - A site header with the user's name, Studio/Admin links by role, and the existing `LogoutButton`, or "Masuk" when logged out.
  - The web gates are UX only. **The API guards are the security boundary.**

## Dependencies

- None new. Uses existing Prisma, Zod, NestJS, Next 16, Testing Library.

## Risks

- **Slug case-insensitive uniqueness isn't enforced yet.** The table only has `UNIQUE(slug)`. Mitigation: only the seed writes slugs in US-009 (already lowercase). US-010 owns normalization and the `CHECK (slug = lower(slug))` / validation.
- **Guard inheritance and Nest DI.** Subclasses without their own constructor reuse `SessionGuard`'s injected `PrismaService`. Change its field from `private` to `protected`. The integration tests prove the DI wiring.
- **The root-layout header calls the API on every page.** Mitigation: the header's user part sits in `<Suspense>` (PPR hole under `cacheComponents`, static shell stays cacheable), `getCurrentUser` is deduped per request by `cache()`, and the header treats an API error as logged-out so a public page never crashes because of it.
- `shortcut:` web gates redirect to the section root (`/studio`, `/admin`), not the exact deep page, because layouts don't receive the pathname. Upgrade when deep studio pages exist and users complain.

## Tasks

### TASK-025: Schema: `user_roles` + minimal `creator_profiles`, shared `/auth/me` contract, seed

**Schema** (`apps/api/prisma/schema.prisma`, follow the conventions header):

```prisma
/// Roles granted explicitly in the DB/seed (handoff §5.3). USER is implicit; CREATOR is derived from
/// an APPROVED creator profile and never stored here.
enum GrantedRole {
  ADMIN

  @@map("granted_role")
}

model UserRole {
  id        String      @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId    String      @map("user_id") @db.Uuid
  role      GrantedRole
  createdAt DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
  user      User        @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@unique([userId, role])
  @@map("user_roles")
}

enum CreatorProfileStatus {
  PENDING_REVIEW
  APPROVED
  REJECTED

  @@map("creator_profile_status")
}

/// Creator identity. Minimal in US-009 (roles); US-010 adds bio/avatar, slug normalization and validation.
model CreatorProfile {
  id        String               @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId    String               @unique @map("user_id") @db.Uuid
  slug      String               @unique
  status    CreatorProfileStatus @default(PENDING_REVIEW)
  createdAt DateTime             @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime             @updatedAt @map("updated_at") @db.Timestamptz(3)
  user      User                 @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@map("creator_profiles")
}
```

Add `roles UserRole[]` and `creatorProfile CreatorProfile?` to `User`. Create the migration with `pnpm db:migrate --name roles_and_creator_profiles`. Never edit applied migrations. Then run `pnpm --filter @influency/api generate`. `schema-conventions.integration.spec.ts` must still pass.

**Shared** (`packages/shared/src/auth.ts`, already exported from `index.ts`):

```ts
/** Roles returned by GET /auth/me, in this fixed order. USER is implicit, CREATOR derived, ADMIN granted. */
export const ROLES = ['USER', 'CREATOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const meResponseSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  roles: z.array(z.enum(ROLES)),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
```

**Seed:**
- `prisma/seed/demo-ids.ts`: add `DEMO_CREATOR_PROFILE_IDS = { claudia: '0190a000-0000-7000-8000-000000000101', creatorB: '0190a000-0000-7000-8000-000000000102' }`.
- New `prisma/seed/roles.ts` → `seedRoles(prisma)`:
  - `userRole.upsert` where `userId_role: { userId: DEMO_USER_IDS.admin, role: 'ADMIN' }`.
  - `creatorProfile.upsert` by fixed id: Claudia `slug: 'claudiandreya'` and Creator B `slug: 'creatorb'` (handoff §15.5), both `status: 'APPROVED'`. The `update` sets slug + status.
- Append `{ name: 'roles and creator profiles', run: seedRoles }` to `seedSteps` (after demo users).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | `GrantedRole`, `UserRole`, `CreatorProfileStatus`, `CreatorProfile`, User relations |
| CREATE | `apps/api/prisma/migrations/<ts>_roles_and_creator_profiles/migration.sql` | generated migration |
| MODIFY | `packages/shared/src/auth.ts` | `ROLES`, `Role`, `meResponseSchema`, `MeResponse` |
| MODIFY | `packages/shared/src/constants.test.ts` or CREATE `packages/shared/src/auth.test.ts` | schema test |
| MODIFY | `apps/api/prisma/seed/demo-ids.ts` | `DEMO_CREATOR_PROFILE_IDS` |
| CREATE | `apps/api/prisma/seed/roles.ts` | `seedRoles` |
| MODIFY | `apps/api/prisma/seed/seed.ts` | register step |
| MODIFY | `apps/api/prisma/seed/seed.spec.ts` (the existing seed spec) | assert roles + profiles |

**Testing:**
- Shared: `meResponseSchema` accepts `{ id, displayName, roles: ['USER','ADMIN'] }` and rejects an unknown role (`'SUPERUSER'`) or a missing `roles`.
- Seed spec (run seed twice): exactly one `user_roles` row, `(admin, ADMIN)`. Claudia/Creator B profiles are `APPROVED` with slugs `claudiandreya`/`creatorb`. Subscriber A/B and Admin have no profile.
- Integration: inserting a second `(userId, 'ADMIN')` row throws a unique violation. A second profile for the same user or a duplicate slug throws.

---

### TASK-026: API: `AdminGuard`, `ApprovedCreatorGuard`, `GET /auth/me`

**`apps/api/src/common/session.guard.ts`:** change `private readonly prisma` to `protected readonly prisma` (no other change).

**`apps/api/src/common/role.guards.ts`:**

```ts
declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `ApprovedCreatorGuard`: the caller's APPROVED creator profile id. */
    creatorProfileId?: string;
  }
}

/** Live session (401 AUTH_REQUIRED) + ADMIN row in user_roles, read now from the DB (403 FORBIDDEN). */
@Injectable()
export class AdminGuard extends SessionGuard {
  override async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await super.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const role = await this.prisma.userRole.findUnique({
      where: { userId_role: { userId: req.authSession!.userId, role: 'ADMIN' } },
      select: { id: true },
    });
    if (!role) throw new DomainError('FORBIDDEN');
    return true;
  }
}

/** Live session (401) + APPROVED creator profile (403 CREATOR_NOT_APPROVED); sets req.creatorProfileId. */
@Injectable()
export class ApprovedCreatorGuard extends SessionGuard { /* same shape: creatorProfile.findFirst({ where: { userId, status: 'APPROVED' }, select: { id: true } }) */ }
```

Register both in `CommonModule` `providers` and `exports` (next to `SessionGuard`). Use them as `@UseGuards(AdminGuard)` / `@UseGuards(ApprovedCreatorGuard)` on their own, **not** together with `SessionGuard`.

**`GET /auth/me`** in `apps/api/src/modules/auth/auth.controller.ts`:

```ts
/** Current user and roles, read from the DB on every call (never from Telegram claims). */
@Get('me')
@UseGuards(SessionGuard)
@Header('cache-control', 'no-store')
me(@Req() req: FastifyRequest): Promise<MeResponse> {
  return this.auth.me(req.authSession!.userId);
}
```

`AuthService.me(userId)`: run one query `user.findUniqueOrThrow({ where: { id }, select: { id, displayName, roles: { select: { role: true } }, creatorProfile: { select: { status: true } } } })`. Then build `roles` = `['USER']`, plus `'CREATOR'` if `creatorProfile?.status === 'APPROVED'`, plus `'ADMIN'` if a role row is `ADMIN`. Keep the `ROLES` order.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/common/session.guard.ts` | `prisma` → `protected` |
| CREATE | `apps/api/src/common/role.guards.ts` | `AdminGuard`, `ApprovedCreatorGuard` |
| MODIFY | `apps/api/src/common/common.module.ts` | provide + export the guards |
| MODIFY | `apps/api/src/modules/auth/auth.controller.ts` | `GET me` |
| MODIFY | `apps/api/src/modules/auth/auth.service.ts` | `me(userId)` |
| CREATE | `apps/api/src/common/role.guards.integration.spec.ts` | guard tests (probe controller, like `session.guard.integration.spec.ts`) |
| CREATE | `apps/api/src/modules/auth/me.integration.spec.ts` | `/auth/me` tests |

**Testing** (integration, real Postgres, fixed ids outside `DEMO_USER_IDS` like `0190a000-0000-7000-8000-0000000b00xx`, cleaned up in `afterAll`. Assert error bodies with `errorResponseSchema`):
- Guards (probe controller: `GET /test-roles/admin` with `AdminGuard`, `GET /test-roles/studio` with `ApprovedCreatorGuard` returning `{ creatorProfileId }`). Users: plain, admin (no profile), approved creator, pending creator, rejected creator, suspended user with an ADMIN row.
  - No cookie → both 401 `AUTH_REQUIRED`.
  - Plain user → admin 403 `FORBIDDEN`, studio 403 `CREATOR_NOT_APPROVED`.
  - Pending and rejected creators → studio 403 `CREATOR_NOT_APPROVED`.
  - Approved creator → studio 200 with its profile id. The same user on admin → 403 `FORBIDDEN`.
  - Admin → admin 200. The same admin on studio → 403 `CREATOR_NOT_APPROVED`.
  - Suspended user with an ADMIN row → 401 `AUTH_REQUIRED`.
  - **Read on every request:** delete the admin's role row → the next request with the same cookie gets 403. Set the pending profile to `APPROVED` → the next studio request gets 200.
- `/auth/me`:
  - No cookie or a revoked session → 401 `AUTH_REQUIRED`.
  - Plain user → `{ id, displayName, roles: ['USER'] }`, which passes `meResponseSchema`.
  - A user with an approved profile + an ADMIN row → `roles: ['USER','CREATOR','ADMIN']`.
  - Pending profile → `['USER']`.
  - Response has `cache-control: no-store`.
  - Change the role row in the DB → the same cookie sees the new roles straight away.
- The existing auth/logout/session specs stay green.

---

### TASK-027: Web: `getCurrentUser`, `/studio` + `/admin` gates, site header

**`apps/web/src/lib/api/origin.ts`:** `export const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';` Make `apps/web/next.config.ts` import it, so there is one default instead of two.

**`apps/web/src/lib/api/current-user.ts`:**

```ts
/** Server only. The logged-in user from GET /auth/me, or null when logged out. Deduped per request. */
export const getCurrentUser = cache(async (): Promise<MeResponse | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const res = await fetch(`${API_ORIGIN}/${API_PREFIX}/auth/me`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` }, // forward only the session cookie
    cache: 'no-store',
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /auth/me failed: ${res.status}`);
  return meResponseSchema.parse(await res.json());
});
```

**`apps/web/src/components/access-denied.tsx`:** `AccessDenied({ message })`. Renders an `<h1>` "Akses ditolak", the message, and a `Link` "Kembali ke beranda" → `/`. Mobile-first, existing `Button`/`cn` only.

**`apps/web/src/app/studio/layout.tsx`** (delete `.gitkeep`):
- The layout returns `<Suspense fallback={<p className="…">Memuat…</p>}><StudioGate>{children}</StudioGate></Suspense>`. Under `cacheComponents`, `cookies()` must be read inside Suspense. Check the Next 16 docs in `node_modules/next/dist/docs/`.
- Export `async function StudioGate({ children })`:
  - `null` → `redirect(loginHref('/studio'))`.
  - Roles without `'CREATOR'` → `<AccessDenied message={ERRORS.CREATOR_NOT_APPROVED.message} />`.
  - Otherwise `children`.
- Add the `shortcut:` comment about the section-root returnTo.

**`apps/web/src/app/studio/page.tsx`:** placeholder `<h1>Studio</h1>` + "Kelola konten dan penghasilanmu di sini." (filled in by later stories).

**`apps/web/src/app/admin/layout.tsx` + `page.tsx`:** same as studio. The gate needs `'ADMIN'`, otherwise it shows `ERRORS.FORBIDDEN.message`. `loginHref('/admin')`. Placeholder `<h1>Admin</h1>`.

**`apps/web/src/components/site-header.tsx`** (server component), mounted at the top of `<body>` in `apps/web/src/app/layout.tsx`:
- `<header>` with a `Link` `APP_NAME` → `/` and `<Suspense fallback={null}><UserMenu /></Suspense>`.
- Export `async function UserMenu()`:
  - `const user = await getCurrentUser().catch(() => null);` (an API outage must not break public pages).
  - Logged out → `Link` "Masuk" → `/login`.
  - Logged in → display name, `Link` "Studio" if `CREATOR`, `Link` "Admin" if `ADMIN`, and `<LogoutButton />`.
- Remove the "Not mounted yet" comment from `logout-button.tsx`.
- It must fit on one line at ~375px. Truncate a long display name (`truncate max-w-[10rem]`).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/origin.ts` | single `API_ORIGIN` default |
| MODIFY | `apps/web/next.config.ts` | import `API_ORIGIN` |
| CREATE | `apps/web/src/lib/api/current-user.ts` | `getCurrentUser` |
| CREATE | `apps/web/src/lib/api/current-user.test.ts` | unit tests |
| CREATE | `apps/web/src/components/access-denied.tsx` | denied message |
| CREATE | `apps/web/src/app/studio/layout.tsx`, `page.tsx` | creator gate + placeholder |
| CREATE | `apps/web/src/app/admin/layout.tsx`, `page.tsx` | admin gate + placeholder |
| CREATE | `apps/web/src/app/studio/layout.test.tsx`, `apps/web/src/app/admin/layout.test.tsx` | gate tests |
| DELETE | `apps/web/src/app/studio/.gitkeep`, `apps/web/src/app/admin/.gitkeep` | replaced by real files |
| CREATE | `apps/web/src/components/site-header.tsx` | header + `UserMenu` |
| CREATE | `apps/web/src/components/site-header.test.tsx` | `UserMenu` tests |
| MODIFY | `apps/web/src/app/layout.tsx` | mount `SiteHeader` |
| MODIFY | `apps/web/src/components/logout-button.tsx` | drop the stale comment |

**Testing** (Vitest + Testing Library. Mock `next/headers` `cookies`, `next/navigation` `redirect` (make it throw like Next does), global `fetch`, and `@/lib/api/current-user` in the component tests. Render async server components with `render(await StudioGate({ children: … }))`):
- `getCurrentUser`:
  - No cookie → `null`, and `fetch` is never called.
  - With a cookie → it calls `${API_ORIGIN}/api/v1/auth/me` with exactly `cookie: influency_session=<token>` and `cache: 'no-store'`.
  - 200 → parsed user.
  - 401 → `null`.
  - 500 → throws.
  - A malformed body (unknown role) → throws.
- `StudioGate`:
  - `null` → `redirect('/login?returnTo=%2Fstudio')`.
  - `['USER']` and `['USER','ADMIN']` → "Profil kreator belum disetujui." and no children.
  - `['USER','CREATOR']` → children.
- `AdminGate`:
  - `null` → `redirect('/login?returnTo=%2Fadmin')`.
  - `['USER','CREATOR']` → "Anda tidak memiliki akses.".
  - `['USER','ADMIN']` → children.
- `UserMenu`:
  - `null` → "Masuk" link to `/login`.
  - `getCurrentUser` rejects → "Masuk" (no throw).
  - USER → name + "Keluar", no Studio/Admin links.
  - CREATOR+ADMIN → both links.
- The existing home/login/logout tests stay green.
- Manual check (QA report), with `pnpm db:seed` and a real login (or a session row inserted for a demo user):
  - Logged out, `/studio` → `/login?returnTo=/studio`.
  - Subscriber → `/studio` shows "Profil kreator belum disetujui.", `/admin` shows "Anda tidak memiliki akses.".
  - Header shows the name and logout works.
