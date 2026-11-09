# Technical Plan: US-011 — Admin Reviews Creator Applications

## Architecture Overview

Admins review PENDING_REVIEW rows of `creator_profiles` (US-010: one row per user; a REJECTED user resubmits on the same row). Endpoints follow handoff §11 (`POST /admin/creators/:id/approve|reject`) plus a list endpoint, all behind `AdminGuard`.

Decisions agreed with the user (2026-11-03):

- **Decision history:** new append-only table `creator_application_reviews` (profile, reviewer, decision, reason, `created_at` = decision time), written **in the same transaction** as the status change. Keeps every decision, including those before a resubmit. The app never updates/deletes rows; DB-level immutability and a general audit log are US-043.
- **Rejection reason is shown to the applicant** on `/become-creator` (latest review's reason, only while status is REJECTED). Admin UI tells the admin the reason is visible to the applicant.
- **State rule:** approve/reject only from `PENDING_REVIEW`, enforced by `updateMany({ where: { id, status: 'PENDING_REVIEW' } })` inside the transaction. The row lock taken by the UPDATE serializes concurrent decisions; the loser sees `count = 0` → 409 `CREATOR_APPLICATION_NOT_PENDING`. Unknown id → 404 `NOT_FOUND`.
- **Studio access:** roles are derived from the DB per request (US-009), so APPROVED immediately makes `ApprovedCreatorGuard` pass and `/auth/me` return `CREATOR` — no session work.
- Not in scope: revoking/suspending an approved creator, notifying the applicant (US-035/036), audit log + search (US-043), pagination of the list, blocking an admin from approving their own application (admins are trusted; revisit with US-043).

## Dependencies

- No new packages. Uses existing `AdminGuard`, `ZodValidationPipe`, `DomainError`, shadcn `Button`/`Textarea`/`Label`.

## Risks

- **Double decision** (two admins, double-click, approve vs reject race). Mitigation: conditional `updateMany` in a transaction + concurrency test (exactly one success).
- **Applicant resubmits while an admin decides.** US-010 resubmit only updates rows in `REJECTED`, decisions only rows in `PENDING_REVIEW`, so the two never overlap.
- **Rejection reason is user-facing text written by admins.** Rendered as plain text by React (no HTML), max 500 chars.

## Tasks

### TASK-032: Review history table, shared admin contracts, demo pending application

**Prisma** (`apps/api/prisma/schema.prisma`):

```prisma
enum CreatorReviewDecision {
  APPROVED
  REJECTED

  @@map("creator_review_decision")
}

/// Append-only decision log for creator applications (US-011). Never updated or deleted by the app.
model CreatorApplicationReview {
  id               String                @id @default(dbgenerated("uuidv7()")) @db.Uuid
  creatorProfileId String                @map("creator_profile_id") @db.Uuid
  reviewerId       String                @map("reviewer_id") @db.Uuid
  decision         CreatorReviewDecision
  reason           String?
  createdAt        DateTime              @default(now()) @map("created_at") @db.Timestamptz(3)
  creatorProfile   CreatorProfile        @relation(fields: [creatorProfileId], references: [id], onDelete: Restrict)
  reviewer         User                  @relation("CreatorApplicationReviewer", fields: [reviewerId], references: [id], onDelete: Restrict)

  @@index([creatorProfileId, createdAt])
  @@map("creator_application_reviews")
}
```

Add back-relations: `CreatorProfile.reviews CreatorApplicationReview[]`, `User.creatorApplicationReviews CreatorApplicationReview[] @relation("CreatorApplicationReviewer")`. No `updated_at` (append-only) — if `schema-conventions.integration.spec.ts` demands `updated_at` on every table, add an explicit allow-list entry for this table there rather than adding the column.

Migration: `pnpm --filter @influency/api exec prisma migrate dev --create-only --name creator_application_reviews`, then append to the generated SQL:

```sql
-- A rejection always carries a reason; an approval never does.
ALTER TABLE "creator_application_reviews" ADD CONSTRAINT "creator_application_reviews_reason"
  CHECK (("decision" = 'REJECTED') = ("reason" IS NOT NULL));
```

Then `pnpm db:migrate` and `pnpm --filter @influency/api generate`.

**Shared** (`packages/shared/src/creators.ts`):

```ts
/** Body of POST /admin/creators/:id/reject. Shown to the applicant. */
export const rejectCreatorApplicationSchema = z.object({
  reason: z.string().trim().min(1, 'Alasan penolakan wajib diisi.').max(500, 'Alasan maksimal 500 karakter.'),
});
export type RejectCreatorApplicationInput = z.infer<typeof rejectCreatorApplicationSchema>;

/** One pending application in GET /admin/creators/applications. */
export const adminCreatorApplicationSchema = z.object({
  id: z.string(),               // creator_profiles.id
  displayName: z.string(),
  slug: z.string(),
  bio: z.string().nullable(),
  category: z.string().nullable(),
  applicantName: z.string(),    // users.display_name
  submittedAt: z.string(),      // ISO, = updated_at
});
export type AdminCreatorApplication = z.infer<typeof adminCreatorApplicationSchema>;
export const adminCreatorApplicationListSchema = z.object({ applications: z.array(adminCreatorApplicationSchema) });

/** Response of approve/reject. */
export const creatorReviewResultSchema = z.object({ id: z.string(), status: z.enum(CREATOR_APPLICATION_STATUSES) });
export type CreatorReviewResult = z.infer<typeof creatorReviewResultSchema>;
```

Extend `creatorApplicationResponseSchema` with `rejectionReason: z.string().nullable()` (non-null only when status is REJECTED).

`packages/shared/src/errors.ts`: add `CREATOR_APPLICATION_NOT_PENDING: { status: 409, message: 'Pengajuan ini sudah diputuskan.' }`.

**Seed:** add `DEMO_CREATOR_PROFILE_IDS.subscriberB = '0190a000-0000-7000-8000-000000000103'` in `apps/api/src/common/demo-ids.ts`. In `apps/api/prisma/seed/roles.ts`, add a PENDING_REVIEW application for Subscriber B (slug `subscriberb`, displayName `'Subscriber B'`, example bio/category) via `upsert` with `update: {}` — create-only, so re-seeding never undoes an admin's decision. Assert it in `seed.integration.spec.ts`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | `CreatorReviewDecision`, `CreatorApplicationReview`, back-relations |
| CREATE | `apps/api/prisma/migrations/<ts>_creator_application_reviews/migration.sql` | Table + reason CHECK |
| MODIFY | `packages/shared/src/creators.ts` | Reject/list/result schemas, `rejectionReason` |
| MODIFY | `packages/shared/src/creators.test.ts` | Schema tests |
| MODIFY | `packages/shared/src/errors.ts` | `CREATOR_APPLICATION_NOT_PENDING` |
| MODIFY | `apps/api/src/common/demo-ids.ts` | `subscriberB` profile id |
| MODIFY | `apps/api/prisma/seed/roles.ts` | Pending demo application |
| MODIFY | `apps/api/prisma/seed/seed.integration.spec.ts` | Assert pending application; re-seed keeps status |
| CREATE | `apps/api/src/common/creator-application-reviews-schema.integration.spec.ts` | DB constraint tests |

**Testing:**
- Shared: reason trimmed; empty/whitespace and 501 chars rejected; `creatorApplicationResponseSchema` accepts `rejectionReason: null`.
- DB (real Postgres, own fixed ids, cleanup): REJECTED without reason → CHECK violation; APPROVED with reason → violation; valid rows insert; deleting a profile with reviews is restricted.
- Seed: Subscriber B profile is PENDING_REVIEW; after manually setting it APPROVED, re-running the seed keeps APPROVED.

---

### TASK-033: Admin review API (`GET /admin/creators/applications`, approve, reject) + rejection reason for applicants

New module `apps/api/src/modules/admin/` (`admin.module.ts`, `admin-creators.controller.ts`, `admin-creators.service.ts`), imported in `app.module.ts`. Later admin features add their own controllers to this module.

**Controller** — `@Controller('admin/creators')`, `@UseGuards(AdminGuard)` on the class (includes session check; don't add `SessionGuard`). Reviewer id = `req.authSession!.userId`.

- `GET applications` → `@Header('cache-control', 'no-store')`, returns `{ applications: AdminCreatorApplication[] }`.
- `POST :id/approve` → `@HttpCode(200)`, `@Param('id', new ZodValidationPipe(z.uuid())) id` → `CreatorReviewResult`.
- `POST :id/reject` → `@HttpCode(200)`, same id pipe, `@Body(new ZodValidationPipe(rejectCreatorApplicationSchema)) body` → `CreatorReviewResult`.

**Service:**

```text
listPending():
  creatorProfile.findMany({ where: { status: 'PENDING_REVIEW' }, orderBy: { updatedAt: 'asc' },
                            include: { user: { select: { displayName: true } } } })
  → map to AdminCreatorApplication (applicantName = user.displayName, submittedAt = updatedAt ISO)
  // shortcut: no pagination; add cursor paging when the pending queue can exceed ~100.

decide(profileId, reviewerId, decision: 'APPROVED' | 'REJECTED', reason: string | null):
  prisma.$transaction(async (tx) => {
    { count } = tx.creatorProfile.updateMany({ where: { id: profileId, status: 'PENDING_REVIEW' },
                                                data: { status: decision } })
    if count === 0:
      exists = tx.creatorProfile.findUnique({ where: { id: profileId }, select: { id: true } })
      throw DomainError(exists ? 'CREATOR_APPLICATION_NOT_PENDING' : 'NOT_FOUND')
    tx.creatorApplicationReview.create({ data: { creatorProfileId: profileId, reviewerId, decision, reason } })
  })
  return { id: profileId, status: decision }
```

`approve` = `decide(id, reviewerId, 'APPROVED', null)`; `reject` = `decide(id, reviewerId, 'REJECTED', body.reason)`. The UPDATE's row lock serializes concurrent decisions (READ COMMITTED re-checks the `status` predicate after the lock), so only one succeeds. Note: `updated_at` changes on decision; that's fine for the pending list since decided rows leave it.

**Applicant side** (`apps/api/src/modules/creators/creators.service.ts`): `findMine` and `apply`'s returned row include `reviews: { orderBy: { createdAt: 'desc' }, take: 1, select: { reason: true } }`; `toResponse` sets `rejectionReason = status === 'REJECTED' ? reviews[0]?.reason ?? null : null`. After a resubmit the status is PENDING_REVIEW, so the old reason is hidden.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/admin/admin.module.ts` | Module |
| CREATE | `apps/api/src/modules/admin/admin-creators.controller.ts` | List / approve / reject |
| CREATE | `apps/api/src/modules/admin/admin-creators.service.ts` | Queries + transactional decision |
| CREATE | `apps/api/src/modules/admin/admin-creators.integration.spec.ts` | Integration tests |
| MODIFY | `apps/api/src/app.module.ts` | Import `AdminModule` |
| MODIFY | `apps/api/src/modules/creators/creators.service.ts` | `rejectionReason` in response |
| MODIFY | `apps/api/src/modules/creators/creators.integration.spec.ts` | Reason visible only while REJECTED |

**Testing (`admin-creators.integration.spec.ts`, real app via `createApp` + `inject`, own fixed ids for an admin user (+ `user_roles` ADMIN), a normal user, and applicant users with PENDING_REVIEW profiles using `profileFields()`; session tokens like `me.integration.spec.ts`; `origin: WEB_ORIGIN` on POSTs; cleanup reviews → profiles → roles → sessions → users in `afterAll`):**
- No cookie → 401 `AUTH_REQUIRED`; non-admin (incl. an approved creator) → 403 `FORBIDDEN` on list, approve and reject; no review row written, status unchanged.
- List returns only PENDING_REVIEW, oldest first, with `applicantName`, `slug`, `bio`, `category`; no APPROVED/REJECTED rows; `cache-control: no-store`.
- Approve → 200 `{ id, status: 'APPROVED' }`; one review row with `reviewerId` = admin, `decision` APPROVED, `reason` null, `createdAt` set; then the applicant's `GET /auth/me` includes `CREATOR` and an `ApprovedCreatorGuard` endpoint/probe passes.
- Reject with reason `'  Foto profil tidak jelas  '` → 200 REJECTED; review row has trimmed reason + reviewer; applicant `GET /creators/me/application` shows `rejectionReason`.
- Reject with empty/missing reason → 400 `VALIDATION_FAILED` (path `reason`), status unchanged.
- Approve/reject an already decided application → 409 `CREATOR_APPLICATION_NOT_PENDING`, no new review row.
- Unknown uuid → 404 `NOT_FOUND`; non-uuid id → 400 `VALIDATION_FAILED`.
- **Concurrency:** 5 parallel approves on one application → exactly one 200, four 409; exactly one review row. Parallel approve + reject → exactly one succeeds, final status matches the single review row.
- Rejected applicant resubmits (US-010 flow) → PENDING_REVIEW, `rejectionReason` null, appears in the list again; reviews table still holds the earlier rejection.
- Missing `Origin` with cookie on approve → 403 `FORBIDDEN` (CSRF).

---

### TASK-034: `/admin/creators` review page + rejection reason on `/become-creator`

**Data helper** `apps/web/src/lib/api/admin-creator-applications.ts`: `getPendingCreatorApplications()` — server only, same pattern as `creator-application.ts` (forward only the session cookie, `cache: 'no-store'`), `GET /api/v1/admin/creators/applications`, parse with `adminCreatorApplicationListSchema`, return the array.

**Page** `apps/web/src/app/admin/creators/page.tsx` (already gated by `admin/layout.tsx` → `AdminGate`): server component, list inside `<Suspense>` (cacheComponents). Heading "Pengajuan Kreator". Empty → "Tidak ada pengajuan yang menunggu." Otherwise one card per application: display name, `influency.com/{slug}`, applicant name, category, bio (plain text, `whitespace-pre-line`), submitted date (`id-ID` locale), and `<CreatorApplicationActions id=… />`.

**Client component** `apps/web/src/app/admin/creators/creator-application-actions.tsx` (`"use client"`):

- "Setujui" button → `fetch('/api/v1/admin/creators/${id}/approve', { method: 'POST', credentials: 'include' })`.
- "Tolak" button reveals a labeled textarea "Alasan penolakan (terlihat oleh pemohon)" + "Kirim penolakan"; validate with `rejectCreatorApplicationSchema.safeParse` before sending `POST …/reject` with JSON `{ reason }`.
- Buttons disabled while pending. On success → `router.refresh()` (card disappears). On error parse with `errorResponseSchema`: `VALIDATION_FAILED` → field error on reason; `CREATOR_APPLICATION_NOT_PENDING` → show the message and `router.refresh()`; other → inline message with `role="alert"`.
- `aria-invalid` / `aria-describedby` on the textarea, mobile-first (~375px).

**Admin home** `apps/web/src/app/admin/page.tsx`: add a link "Pengajuan Kreator" → `/admin/creators`.

**Applicant view** `apps/web/src/app/(subscriber)/become-creator/become-creator.tsx`: when REJECTED and `application.rejectionReason` is set, show "Alasan: {rejectionReason}" under the "Pengajuan sebelumnya ditolak…" text (plain text). Update any test fixtures of `CreatorApplicationResponse` to include `rejectionReason`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/admin-creator-applications.ts` | `getPendingCreatorApplications()` |
| CREATE | `apps/web/src/app/admin/creators/page.tsx` | Pending list |
| CREATE | `apps/web/src/app/admin/creators/creator-application-actions.tsx` | Approve / reject client actions |
| CREATE | `apps/web/src/app/admin/creators/creator-application-actions.test.tsx` | Action tests |
| CREATE | `apps/web/src/app/admin/creators/page.test.tsx` | List rendering tests (mock helper) |
| MODIFY | `apps/web/src/app/admin/page.tsx` | Link to `/admin/creators` |
| MODIFY | `apps/web/src/app/(subscriber)/become-creator/become-creator.tsx` | Show rejection reason |
| MODIFY | `apps/web/src/app/(subscriber)/become-creator/become-creator.test.tsx` | Reason shown when REJECTED |
| MODIFY | other web tests with `CreatorApplicationResponse` fixtures | Add `rejectionReason` |

**Testing (Vitest + Testing Library, `fetch` + `next/navigation` mocked):**
- Page: empty state; renders each application's name, slug URL, applicant, bio.
- Actions: approve POSTs to the right URL and calls `router.refresh()`; reject with empty reason shows the error without fetching; reject sends `{ reason }`; `CREATOR_APPLICATION_NOT_PENDING` shows the message and refreshes; buttons disabled while pending.
- Become-creator: REJECTED with reason shows "Alasan: …"; PENDING_REVIEW shows no reason.
