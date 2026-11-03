# Technical Plan: US-010 — Apply to Become a Creator

## Architecture Overview

A logged-in user applies at `/become-creator` with display name, slug, optional bio/category and acceptance of the creator agreement + content policy. The API stores the application on the existing `creator_profiles` row (one row per user, `UNIQUE(user_id)`), status `PENDING_REVIEW`.

Decisions agreed with the user (2026-11-03):

- **Slug rules:** trimmed, lowercased, 3–30 chars of `a-z 0-9 _ -`, starting and ending with a letter/digit (`^[a-z0-9](?:[a-z0-9_-]{1,28})[a-z0-9]$`). No dots, so file-like paths (`robots.txt`, `favicon.ico`) can never be slugs.
- **Reserved slugs:** the locked list (`login, wallet, studio, admin, auth, api, discover, subscriptions, library, terms, privacy, help`) **plus `become-creator`** (a real top-level route added here). Kept in `packages/shared` (`RESERVED_SLUGS`) so US-013 routing can reuse it.
- **Case-insensitive uniqueness:** slugs are stored normalized; `CHECK (slug = lower(slug))` + existing `UNIQUE(slug)` makes case variants impossible at DB level. A second `CHECK` enforces the character pattern. The reserved list is app-level only.
- **One application per user.** PENDING_REVIEW or APPROVED → 409 `CREATOR_APPLICATION_EXISTS`. **REJECTED → resubmit** updates the same row back to PENDING_REVIEW with the new data (US-011 owns review history if it needs it).
- **Category:** optional free text ≤ 50 chars (no business list yet; handoff §9.6 warns against assuming accepted categories).
- **Agreement:** `acceptAgreement: true` is required; the row stores `agreement_version` (shared constant `CREATOR_AGREEMENT_VERSION`, a labeled placeholder — legal text is TBD) and `agreement_accepted_at` (server time).
- Not in scope: avatar/banner (US-012), reviewer/rejection reason/approve (US-011), slug rename policy (TBD), public creator page (US-013).

## Dependencies

- No new npm packages. shadcn `input`, `textarea`, `label` components are generated via the shadcn CLI (they only use the already-installed `radix-ui`).

## Risks

- **Concurrent applications** (same user twice, or two users on the same slug). Mitigation: rely on DB unique constraints; on Prisma `P2002` re-query instead of parsing adapter error metadata (`@prisma/adapter-pg` changes the `meta` shape). Covered by a concurrency test.
- **Existing rows and NOT NULL columns.** The migration must backfill the two seeded profiles before setting NOT NULL. Mitigation: hand-edited migration (`--create-only`), verified by `pnpm db:reset` + seed test.
- **Reserved names drift.** A new top-level route added later must also be added to `RESERVED_SLUGS`. Mitigation: comment on the constant; US-013 is the next consumer.

## Tasks

### TASK-028: Shared slug rules, application schemas and error codes

Create `packages/shared/src/creators.ts` and export it from `packages/shared/src/index.ts` (`export * from './creators.js';`).

```ts
/** Top-level route segments that can never be creator slugs. Add every new top-level web route here. */
export const RESERVED_SLUGS = ['login','wallet','studio','admin','auth','api','discover','subscriptions','library','terms','privacy','help','become-creator'] as const;

/** 3–30 chars, a-z 0-9 _ -, starts and ends with a letter/digit. Mirrored by a DB CHECK (TASK-029). */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;

/** Placeholder until the Creator Agreement + Content Policy are written (handoff §9.6, TBD). */
export const CREATOR_AGREEMENT_VERSION = 'placeholder-2026-11';

export const slugSchema = z.string().trim().toLowerCase()
  .regex(SLUG_PATTERN, 'Gunakan 3–30 huruf kecil, angka, _ atau -, diawali dan diakhiri huruf atau angka.')
  .refine((s) => !(RESERVED_SLUGS as readonly string[]).includes(s), 'Alamat ini dipakai oleh sistem. Pilih alamat lain.');

export const creatorApplicationSchema = z.object({
  displayName: z.string().trim().min(1, 'Nama tampilan wajib diisi.').max(60),
  slug: slugSchema,
  bio: z.string().trim().max(500).optional(),      // '' after trim → treat as absent in the service
  category: z.string().trim().max(50).optional(),
  acceptAgreement: z.literal(true, 'Anda harus menyetujui Perjanjian Kreator dan Kebijakan Konten.'),
});
export type CreatorApplicationInput = z.infer<typeof creatorApplicationSchema>;

export const CREATOR_APPLICATION_STATUSES = ['PENDING_REVIEW','APPROVED','REJECTED'] as const;
export const creatorApplicationResponseSchema = z.object({
  status: z.enum(CREATOR_APPLICATION_STATUSES),
  displayName: z.string(),
  slug: z.string(),
  bio: z.string().nullable(),
  category: z.string().nullable(),
  submittedAt: z.string(), // ISO; = updated_at of the row
});
export type CreatorApplicationResponse = z.infer<typeof creatorApplicationResponseSchema>;
```

Check the Zod 4.6 signature for `z.literal(value, message)`; use `{ error: '...' }` if that is the 4.x form.

Add to `ERRORS` in `packages/shared/src/errors.ts`:

- `SLUG_TAKEN: { status: 409, message: 'Alamat ini sudah dipakai. Pilih alamat lain.' }`
- `CREATOR_APPLICATION_EXISTS: { status: 409, message: 'Anda sudah memiliki pengajuan kreator.' }`

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `packages/shared/src/creators.ts` | Slug rules, reserved list, application schemas, agreement version |
| CREATE | `packages/shared/src/creators.test.ts` | Unit tests |
| MODIFY | `packages/shared/src/index.ts` | Export creators |
| MODIFY | `packages/shared/src/errors.ts` | `SLUG_TAKEN`, `CREATOR_APPLICATION_EXISTS` |

**Testing (`creators.test.ts`):**
- `slugSchema.parse('  ClaudiAndreya ')` → `'claudiandreya'`.
- Accepts `abc`, `a_b-c`, `user123`, a 30-char slug. Rejects `ab` (too short), 31 chars, `-abc`, `abc_`, `a.b`, `a b`, `ab!c`, `éclair`.
- Every entry of `RESERVED_SLUGS` is rejected, including in uppercase (`ADMIN`, `Become-Creator`), with the reserved message.
- `creatorApplicationSchema`: missing/false `acceptAgreement` fails; empty displayName fails; bio > 500 / category > 50 fail; minimal valid object passes.

---

### TASK-029: Creator profile application columns, constraints and seed

Extend `CreatorProfile` in `apps/api/prisma/schema.prisma` (update the `///` doc comment: "US-010 adds application fields + slug constraints"):

```prisma
displayName         String    @map("display_name")
bio                 String?
category            String?
agreementVersion    String    @map("agreement_version")
agreementAcceptedAt DateTime  @map("agreement_accepted_at") @db.Timestamptz(3)
```

Create the migration with `pnpm --filter @influency/api exec prisma migrate dev --create-only --name creator_applications`, then hand-edit the SQL so existing rows are backfilled:

```sql
ALTER TABLE "creator_profiles"
  ADD COLUMN "display_name" TEXT, ADD COLUMN "bio" TEXT, ADD COLUMN "category" TEXT,
  ADD COLUMN "agreement_version" TEXT, ADD COLUMN "agreement_accepted_at" TIMESTAMPTZ(3);
UPDATE "creator_profiles" cp SET "display_name" = u."display_name", "agreement_version" = 'placeholder-2026-11',
  "agreement_accepted_at" = cp."created_at" FROM "users" u WHERE u."id" = cp."user_id";
ALTER TABLE "creator_profiles" ALTER COLUMN "display_name" SET NOT NULL,
  ALTER COLUMN "agreement_version" SET NOT NULL, ALTER COLUMN "agreement_accepted_at" SET NOT NULL;
-- Slugs are stored normalized, so UNIQUE(slug) is case-insensitive uniqueness.
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_slug_lowercase" CHECK ("slug" = lower("slug"));
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_slug_format" CHECK ("slug" ~ '^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$');
```

Then `pnpm db:migrate` (applies it) and `pnpm --filter @influency/api generate`.

Seed (`apps/api/prisma/seed/roles.ts`): add `displayName` (`'Claudia Andreya'`, `'Creator B'`), `bio`, `category` (example text), `agreementVersion: CREATOR_AGREEMENT_VERSION`, `agreementAcceptedAt: new Date()` in `create`; in `update` set `displayName`/`bio`/`category` only (keep idempotent). No pending demo application (US-011 can add one).

Fix every existing place that creates `creatorProfile` rows, since the new columns are required: grep `creatorProfile.create` / `createMany` across `apps/api/src` and `apps/api/test` (e.g. `role.guards.integration.spec.ts`, `me.integration.spec.ts`, `roles-schema.integration.spec.ts`) and add `displayName`, `agreementVersion`, `agreementAcceptedAt`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | New CreatorProfile columns |
| CREATE | `apps/api/prisma/migrations/<ts>_creator_applications/migration.sql` | Columns + backfill + CHECKs |
| MODIFY | `apps/api/prisma/seed/roles.ts` | Seed new fields |
| MODIFY | `apps/api/prisma/seed/seed.integration.spec.ts` | Assert seeded displayName |
| MODIFY | existing specs that create `creatorProfile` rows | Supply required fields |
| CREATE | `apps/api/src/common/creator-profiles-schema.integration.spec.ts` | DB constraint tests |

**Testing (`creator-profiles-schema.integration.spec.ts`, real Postgres, own fixed user ids, cleanup in `afterAll`):**
- Insert with slug `Claudia` → rejected (lowercase CHECK).
- Insert with slug `a.b` / `-ab` → rejected (format CHECK).
- Insert `dupslug` for user 1, then `dupslug` for user 2 → unique violation.
- Second profile for the same user → unique violation.
- `schema-conventions.integration.spec.ts` still passes (Timestamptz(3), snake_case).

---

### TASK-030: Creator application API (`POST /creators/apply`, `GET /creators/me/application`)

New module `apps/api/src/modules/creators/` (`creators.module.ts`, `creators.controller.ts`, `creators.service.ts`), imported in `app.module.ts`. Follow `auth` for structure and `me.integration.spec.ts` for tests.

**Controller** (`@Controller('creators')`, both routes `@UseGuards(SessionGuard)`, read `req.authSession!.userId`):

- `POST apply` — `@Body(new ZodValidationPipe(creatorApplicationSchema)) body: CreatorApplicationInput` → `service.apply(userId, body)` → `201` with `CreatorApplicationResponse`.
- `GET me/application` — `service.findMine(userId)` → `200` `{ application: CreatorApplicationResponse | null }` with `cache-control: no-store`. (Path `me/application` is two segments deep, so it never collides with the future public `GET /creators/:slug`.)

Reserved-name and format errors come from the pipe as 400 `VALIDATION_FAILED` with `details.issues[].path = ['slug']` and the Bahasa message from TASK-028.

**Service `apply(userId, input)`:**

```text
data = { displayName, slug, bio: bio || null, category: category || null,
         agreementVersion: CREATOR_AGREEMENT_VERSION, agreementAcceptedAt: new Date(),
         status: 'PENDING_REVIEW' }
existing = findUnique({ where: { userId }, select: { status } })
if existing && existing.status !== 'REJECTED' → throw DomainError('CREATOR_APPLICATION_EXISTS')
await assertSlugFree(userId, slug)       // common case; races fall through to P2002 below
try:
  if !existing: create({ data: { userId, ...data } })
  else:         r = updateMany({ where: { userId, status: 'REJECTED' }, data })
                if r.count === 0 → throw DomainError('CREATOR_APPLICATION_EXISTS')  // raced with another submit
catch e (Prisma.PrismaClientKnownRequestError && e.code === 'P2002'):
  await assertSlugFree(userId, slug)     // slug now owned by someone else → SLUG_TAKEN
  throw DomainError('CREATOR_APPLICATION_EXISTS')  // otherwise the user_id unique fired
return toResponse(findUniqueOrThrow({ where: { userId } }))
```

`assertSlugFree(userId, slug)`: `findUnique({ where: { slug }, select: { userId: true } })`; owned by another user → `DomainError('SLUG_TAKEN', { field: 'slug' })`. Don't parse `e.meta.target` — its shape depends on the driver adapter. A REJECTED user resubmitting their **own** old slug is allowed (the row is theirs).

Map the row to the response with a small `toResponse(row)` (`submittedAt: row.updatedAt.toISOString()`). Never return `userId`/`id` beyond what the schema lists.

`findMine(userId)`: `findUnique({ where: { userId } })` → `toResponse` or `null`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/creators/creators.module.ts` | Module |
| CREATE | `apps/api/src/modules/creators/creators.controller.ts` | `POST /creators/apply`, `GET /creators/me/application` |
| CREATE | `apps/api/src/modules/creators/creators.service.ts` | Apply / findMine rules |
| CREATE | `apps/api/src/modules/creators/creators.integration.spec.ts` | Integration tests |
| MODIFY | `apps/api/src/app.module.ts` | Import `CreatorsModule` |

**Testing (`creators.integration.spec.ts`, real app via `createApp`/`inject`, own fixed user ids + session tokens like `me.integration.spec.ts`; send `origin: WEB_ORIGIN` on POSTs with the cookie because of `CsrfGuard`; clean up profiles, sessions, users in `afterAll`):**
- No cookie → 401 `AUTH_REQUIRED` (both routes).
- Valid apply → 201, status `PENDING_REVIEW`, slug normalized (`'  MyCreator '` → `mycreator`), DB row has `agreementVersion` + `agreementAcceptedAt`; `GET me/application` returns it.
- `GET me/application` with no application → `{ application: null }`.
- Reserved slug (`admin`, `Become-Creator`) → 400 `VALIDATION_FAILED`, issue path `slug`.
- Invalid chars (`a.b`), too short → 400.
- `acceptAgreement` missing/false → 400.
- Slug taken by a seeded/other profile, in different case (`CLAUDIANDREYA`) → 409 `SLUG_TAKEN`.
- Second apply while PENDING_REVIEW → 409 `CREATOR_APPLICATION_EXISTS`; same for an APPROVED user.
- REJECTED user resubmits (new slug, and own old slug) → 201, status back to `PENDING_REVIEW`, fields replaced.
- **Concurrency:** 5 parallel applies from one user → exactly one 201, rest 409 `CREATOR_APPLICATION_EXISTS`, one row. Two users applying for the same slug in parallel → one 201, one 409 `SLUG_TAKEN`.
- Missing `Origin` with cookie → 403 `FORBIDDEN` (CSRF guard still applies).

---

### TASK-031: `/become-creator` page and application form

**Data helper** `apps/web/src/lib/api/creator-application.ts`: `getMyCreatorApplication()` — server only, same pattern as `current-user.ts` (forward only the session cookie, `cache: 'no-store'`), `GET /api/v1/creators/me/application`, parse with `z.object({ application: creatorApplicationResponseSchema.nullable() })`; 401 → `null`.

**Page** `apps/web/src/app/(subscriber)/become-creator/page.tsx`: server component; body inside `<Suspense>` (cacheComponents), like the studio layout/gate. Gate component `BecomeCreator`:

- `getCurrentUser()` null → `redirect(loginHref('/become-creator'))`.
- application `PENDING_REVIEW` → notice "Pengajuan Anda sedang ditinjau." + submitted slug `influency.com/{slug}`.
- `APPROVED` → "Anda sudah menjadi kreator." + link to `/studio`.
- `REJECTED` → short "Pengajuan sebelumnya ditolak. Anda dapat mengajukan kembali." + the form prefilled with previous values.
- none → form.

**Form** `apps/web/src/app/(subscriber)/become-creator/creator-application-form.tsx` (`"use client"`):

- Fields: Nama tampilan, Alamat halaman (slug, with live preview `influency.com/{normalized slug}`), Bio (textarea), Kategori, checkbox "Saya menyetujui Perjanjian Kreator dan Kebijakan Konten" (no links yet — documents are TBD; add a muted note "Dokumen kebijakan sedang disiapkan.").
- On submit: `creatorApplicationSchema.safeParse(values)`; show the first issue per field next to it. If valid, `fetch('/api/v1/creators/apply', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body })`, button disabled while pending.
- Errors: parse with `errorResponseSchema`; branch on `error.code`: `VALIDATION_FAILED` → map `details.issues` by path[0] to fields; `SLUG_TAKEN` → slug field error with `error.message`; `CREATOR_APPLICATION_EXISTS` / other → form-level message. On 201 → `router.refresh()` (page re-renders as pending).
- Labeled controls, `aria-invalid` + `aria-describedby` for field errors, mobile-first (~375px).

Generate shadcn `input`, `textarea`, `label` (`pnpm --filter @influency/web exec shadcn add input textarea label`); checkbox stays a native `<input type="checkbox">`.

**Header:** in `apps/web/src/components/site-header.tsx` `UserMenu`, show a ghost "Jadi Kreator" link to `/become-creator` when the user lacks the `CREATOR` role.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/creator-application.ts` | `getMyCreatorApplication()` |
| CREATE | `apps/web/src/app/(subscriber)/become-creator/page.tsx` | Page + status-based rendering |
| CREATE | `apps/web/src/app/(subscriber)/become-creator/creator-application-form.tsx` | Client form |
| CREATE | `apps/web/src/app/(subscriber)/become-creator/creator-application-form.test.tsx` | Form tests |
| CREATE | `apps/web/src/app/(subscriber)/become-creator/page.test.tsx` | Gate/status tests (mock the two API helpers, like `studio-gate.test.tsx`) |
| CREATE | `apps/web/src/components/ui/{input,textarea,label}.tsx` | shadcn components |
| MODIFY | `apps/web/src/components/site-header.tsx` | "Jadi Kreator" link |
| MODIFY | site-header test (if present) | Link shown for non-creators only |

**Testing (Vitest + Testing Library, `fetch` mocked):**
- Page: logged out → redirect to `/login?returnTo=%2Fbecome-creator` (match `loginHref` output); pending → notice, no form; approved → Studio link; rejected → form prefilled; none → empty form.
- Form: slug preview lowercases (`MyName` → `influency.com/myname`); reserved slug shows the reserved message without calling fetch; unchecked agreement blocks submit; API `SLUG_TAKEN` shows the message on the slug field; `VALIDATION_FAILED` issues map to fields; success calls `router.refresh()`; button disabled while pending.
- Header: "Jadi Kreator" visible for USER, hidden for CREATOR.
