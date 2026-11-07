# Technical Plan: US-042 — Report Content & Moderation Queue

## Architecture Overview

Agreed with the user (2026-11-04):

- **Report:** a logged-in user reports a PUBLISHED post they can see (`full` or `locked`, so premium previews too), never their own. Reports are rows in `post_reports`, one open report per (post, reporter). Re-reporting while open is idempotent.
- **Queue:** `GET /admin/moderation` lists posts with ≥ 1 open report, grouped per post.
- **Post actions** (admin, under the post-row lock, one transaction, resolve all open reports of the post):
  - `dismiss` — status unchanged.
  - `hide` — PUBLISHED → **PENDING_REVIEW** (reused, no enum change). The public loses it (existing `decidePostAccess`), the owner still sees it, and the creator has no transition out of PENDING_REVIEW (publish needs DRAFT, archive needs PUBLISHED, restore needs ARCHIVED).
  - `unhide` — PENDING_REVIEW → PUBLISHED, only when the latest moderation action on the post is HIDE. That keeps first-publish review (`POST_MODERATION_REQUIRED`) separate.
  - `remove` — any non-REMOVED status → **REMOVED** (terminal). It's already hidden from everyone but admins.
- **Suspend:** one account-level action for users and creators: `users.status` ACTIVE ⇄ SUSPENDED. Existing behavior does the rest: `SessionGuard` only accepts ACTIVE users (login and every session blocked), and `PUBLIC_CREATOR` hides a suspended creator's page, feed, posts and images. Admins can't suspend themselves or another admin. The UI is the moderation queue only ("Tangguhkan kreator" / "Pulihkan akun"). The API takes any user id.
- **Audit trail:** append-only `moderation_actions` (admin, action, target post or user, note, time). Reports point at the action that resolved them. US-043 can fold this into the general audit log later.
- **Finance:** moderation never deletes or edits posts' offers, media, likes, or (later) purchases, entitlements, or ledger rows. It only changes `posts.status` / `users.status` and inserts moderation rows. Bytes stay in storage. Refunds for removed paid content follow the TBD refund policy (US-041), not this story.

Out of scope: reporting comments (US-052 not built), appeals, notifying the creator or reporter, a user search page, audit-log search (US-043), deleting stored media.

## Dependencies

- None new. Reuses `SessionGuard`, `RateLimitGuard`/`@RateLimit`, `AdminGuard`, `PostAccessService`, `ZodValidationPipe`, `DomainError`, the `lockPost` pattern.

## Risks

- **Hide reuses PENDING_REVIEW**, so the studio shows the moderation-queue wording. Mitigation: change the studio notice to a neutral "Sedang ditinjau admin; tidak terlihat publik." that fits both cases. `unhide` checks the latest action is HIDE, so first-publish reviews can't be approved by accident.
- **Report spam / brigading.** Mitigation: rate limit (TBD placeholder 10/hour per user), partial UNIQUE one open report per reporter per post, reporter must have a session.
- **Concurrent admin actions** on the same post (two admins). Mitigation: post-row `FOR UPDATE`, conditional status checks after the lock, and report resolution in the same transaction. The loser gets 409 `POST_STATUS_CONFLICT` (or resolves nothing on dismiss).
- **Suspended creator with paying subscribers/buyers** (later stories): their access goes away while the creator is hidden. That's intended moderation behavior. Refunds are TBD (US-041).

## Tasks

### TASK-087: Shared contracts, schema and migration for reports and moderation actions

**Shared (`packages/shared/src/moderation.ts`, export from `index.ts`):**

```ts
// TBD placeholder list (content policy, handoff §12.4); labels live in the web app.
export const POST_REPORT_REASONS = ['SPAM', 'SEXUAL_CONTENT', 'VIOLENCE', 'HARASSMENT', 'ILLEGAL', 'COPYRIGHT', 'OTHER'] as const;
export type PostReportReason = (typeof POST_REPORT_REASONS)[number];
export const MODERATION_NOTE_MAX_LENGTH = 500;

export const createPostReportSchema = z.strictObject({
  reason: z.enum(POST_REPORT_REASONS),
  note: z.string().trim().max(MODERATION_NOTE_MAX_LENGTH).optional(), // '' → undefined
}).refine((r) => r.reason !== 'OTHER' || !!r.note, { path: ['note'], message: 'Wajib diisi untuk alasan Lainnya.' });
export const postReportResponseSchema = z.object({ reported: z.literal(true) });

export const MODERATION_POST_ACTIONS = ['dismiss', 'hide', 'unhide', 'remove'] as const;
export const moderationActionInputSchema = z.strictObject({
  note: z.string().trim().max(MODERATION_NOTE_MAX_LENGTH).optional(),
});

export const moderationQueueItemSchema = z.object({
  post: z.object({ id: z.uuid(), status: z.enum(POST_STATUSES), visibility: z.enum(POST_VISIBILITIES), caption: z.string() }),
  creator: z.object({ userId: z.uuid(), slug: z.string(), displayName: z.string(), userStatus: z.enum(['ACTIVE', 'SUSPENDED']) }),
  openReportCount: z.number().int(),
  reasons: z.array(z.object({ reason: z.enum(POST_REPORT_REASONS), count: z.number().int() })), // desc by count
  reports: z.array(z.object({ reason: z.enum(POST_REPORT_REASONS), note: z.string().nullable(), reporterDisplayName: z.string(), createdAt: z.iso.datetime() })), // newest 5
  firstReportedAt: z.iso.datetime(),
});
export const moderationQueueSchema = z.object({ items: z.array(moderationQueueItemSchema) });
export const moderationPostResultSchema = z.object({ postId: z.uuid(), status: z.enum(POST_STATUSES), resolvedReports: z.number().int() });
export const moderationUserResultSchema = z.object({ userId: z.uuid(), status: z.enum(['ACTIVE', 'SUSPENDED']) });
export const MODERATION_QUEUE_LIMIT = 50;
```

Export the inferred types too (`CreatePostReportInput`, `ModerationQueueItem`, `ModerationQueue`, `ModerationPostResult`, `ModerationUserResult`).

**Error codes (`errors.ts`):**
- `CANNOT_REPORT_OWN_POST` 403 "Anda tidak dapat melaporkan postingan sendiri."
- `USER_STATUS_CONFLICT` 409 "Status akun tidak memungkinkan tindakan ini."
- `CANNOT_SUSPEND_ADMIN` 409 "Akun admin tidak dapat ditangguhkan."

Reuse `POST_NOT_AVAILABLE`, `POST_STATUS_CONFLICT`, `NOT_FOUND`, `RATE_LIMITED`.

**Prisma (`apps/api/prisma/schema.prisma`) + migration `20261104160000_moderation`:**

```prisma
enum PostReportReason { SPAM SEXUAL_CONTENT VIOLENCE HARASSMENT ILLEGAL COPYRIGHT OTHER  @@map("post_report_reason") }
enum ModerationActionType { DISMISS HIDE UNHIDE REMOVE SUSPEND_USER UNSUSPEND_USER  @@map("moderation_action_type") }

/// Append-only (US-042): one row per admin moderation decision. Never updated or deleted.
model ModerationAction {
  id           String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  adminId      String   @map("admin_id") @db.Uuid          // FK users RESTRICT
  action       ModerationActionType
  postId       String?  @map("post_id") @db.Uuid           // FK posts RESTRICT
  targetUserId String?  @map("target_user_id") @db.Uuid    // FK users RESTRICT
  note         String?
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  @@index([postId, createdAt])
  @@index([targetUserId, createdAt])
  @@map("moderation_actions")
}

/// A user's report on a post (US-042). Open while resolved_by_action_id is null; resolved once, never deleted.
model PostReport {
  id                 String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  postId             String   @map("post_id") @db.Uuid       // FK posts RESTRICT
  reporterId         String   @map("reporter_id") @db.Uuid   // FK users RESTRICT
  reason             PostReportReason
  note               String?
  resolvedByActionId String?  @map("resolved_by_action_id") @db.Uuid  // FK moderation_actions RESTRICT
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  @@index([postId, createdAt])
  @@map("post_reports")
}
```

Add back-relations on `User` (named relations: `adminModerationActions`, `targetModerationActions`, `postReports`) and `Post`.

Migration SQL extras (hand-written after `prisma migrate dev --create-only`):
- `CREATE UNIQUE INDEX post_reports_one_open ON post_reports (post_id, reporter_id) WHERE resolved_by_action_id IS NULL;`
- `CREATE INDEX post_reports_open ON post_reports (created_at) WHERE resolved_by_action_id IS NULL;` (queue scan)
- CHECK `post_reports_note_length`: `note IS NULL OR char_length(note) <= 500`; same `moderation_actions_note_length`.
- CHECK `post_reports_other_has_note`: `reason <> 'OTHER' OR note IS NOT NULL`.
- CHECK `moderation_actions_target`: post actions (DISMISS/HIDE/UNHIDE/REMOVE) have `post_id NOT NULL AND target_user_id IS NULL`; user actions (SUSPEND_USER/UNSUSPEND_USER) the reverse.

**Seed (`apps/api/prisma/seed/`):** one open report by subscriberA on one of Claudia's published seeded posts (fixed id, `upsert`, create-only) so the queue isn't empty in a demo. Skip it if no seeded published post exists.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `packages/shared/src/moderation.ts` | Reasons, schemas, types, limits |
| CREATE | `packages/shared/src/moderation.test.ts` | Schema tests |
| MODIFY | `packages/shared/src/index.ts` | Export |
| MODIFY | `packages/shared/src/errors.ts` | 3 new codes |
| MODIFY | `apps/api/prisma/schema.prisma` | Enums, 2 models, relations |
| CREATE | `apps/api/prisma/migrations/20261104160000_moderation/migration.sql` | Tables + partial unique + CHECKs |
| MODIFY | `apps/api/prisma/seed/*` | Demo open report |

**Testing:**
- Shared: valid report; unknown reason → fail; OTHER without note (or whitespace-only note) → fail; note > 500 → fail; extra key → fail.
- DB (integration, raw insert): second open report same (post, reporter) → unique violation; allowed again after the first is resolved; OTHER with null note → CHECK violation; HIDE action with `target_user_id` set → CHECK violation.

---

### TASK-088: Report a post — `POST /api/v1/posts/:id/report`

In the `engagement` module: `PostReportsController` + `PostReportsService`.

- Guards: `@UseGuards(SessionGuard, RateLimitGuard)`, `@RateLimit(POST_REPORT_RATE_LIMIT)` with `export const POST_REPORT_RATE_LIMIT = { max: 10, timeWindow: '1 hour' }; // TBD placeholder`. `@HttpCode(200)`, `cache-control: no-store`. Param `ParseUUIDPipe`. Body `ZodValidationPipe(createPostReportSchema)`.
- `report(postId, userId, input): Promise<PostReportResponse>`:
  1. `access = await postAccess.check(postId, userId)`. `hidden` → 404 `NOT_FOUND`.
  2. Load `post.status` + owner `creatorProfile.userId`. Owner → 403 `CANNOT_REPORT_OWN_POST`. An admin reporting is fine; no special case.
  3. `status !== 'PUBLISHED'` → 404 `POST_NOT_AVAILABLE` (the owner/admin-visible draft and archive cases).
  4. `prisma.postReport.createMany({ data: [{ postId, reporterId: userId, reason, note: note || null }], skipDuplicates: true })`. ON CONFLICT DO NOTHING hits the partial unique, so a repeat open report is a no-op and keeps the first reason.
  5. Return `{ reported: true }`.
- Never log the note at info level (user free text). Log `{ postId, reason }` only.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/engagement/post-reports.controller.ts` | Route |
| CREATE | `apps/api/src/modules/engagement/post-reports.service.ts` | Rule + insert |
| MODIFY | `apps/api/src/modules/engagement/engagement.module.ts` | Register |
| CREATE | `apps/api/src/modules/engagement/post-reports.integration.spec.ts` | Tests |

**Testing (Fastify inject, real Postgres):**
- Logged-out → 401. Malformed id → 400. Unknown post → 404.
- FREE published post by another user → 200 + one open row with reason/note.
- Locked PREMIUM published post → 200.
- Own post → 403 `CANNOT_REPORT_OWN_POST`.
- Draft / archived / removed / PENDING_REVIEW of someone else → 404 `NOT_FOUND` (hidden). Suspended creator's post → 404.
- Same user twice (different reason) → both 200, one open row, first reason kept. Two concurrent requests → one row.
- After the report is resolved, reporting again → new open row.
- OTHER without note → 400. Extra field → 400.
- 11th report in the window → 429 `RATE_LIMITED`.

---

### TASK-089: Admin moderation queue and post actions

In the `admin` module: `AdminModerationController` (`@Controller('admin/moderation')`, `@UseGuards(AdminGuard)`) + `ModerationService`.

**Lock helper:** add to `apps/api/src/modules/posts/posts.service.ts`, next to `lockPost`:
```ts
/** Admin variant: locks any post row by id (SELECT … FOR UPDATE); NOT_FOUND when unknown. */
export async function lockAnyPost(tx: Prisma.TransactionClient, id: string): Promise<{ status: PostStatus }>
```
Same SQL as `lockPost` without the creator filter. Don't change `lockPost`.

**`GET /admin/moderation`** (`no-store`) → `ModerationQueue`:
- Posts with ≥ 1 open report (`resolvedByActionId: null`), ordered by the oldest open report first, max `MODERATION_QUEUE_LIMIT`.
- Per item: post (id, status, visibility, caption), creator (userId, slug, displayName, user status), `openReportCount`, `reasons` (groupBy reason over open reports, desc by count), newest 5 open `reports` with reporter display name, `firstReportedAt`.
- Implementation: one `postReport.groupBy({ by: ['postId'], where: open, _count, _min: { createdAt }, orderBy: { _min: { createdAt: 'asc' } }, take: 50 })`, then a `findMany` of those posts with includes plus one reason `groupBy` by `[postId, reason]`. No N+1 per post beyond these queries. Removed and held posts with open reports still show, so the admin can resolve them.

**`POST /admin/moderation/posts/:id/{dismiss|hide|unhide|remove}`** (`@HttpCode(200)`, body `moderationActionInputSchema`, param uuid pipe) → `ModerationPostResult`.

`act(postId, adminId, action, note)` runs everything in one `prisma.$transaction`:
1. `const { status } = await lockAnyPost(tx, postId)`.
2. Transition (checked after the lock):
   - `dismiss`: no status change, any status.
   - `hide`: requires `PUBLISHED` → `PENDING_REVIEW`.
   - `unhide`: requires `PENDING_REVIEW` **and** the latest `moderation_actions` row for the post (by `created_at desc, id desc`) has action `HIDE` → `PUBLISHED` (`published_at` unchanged).
   - `remove`: any status except `REMOVED` → `REMOVED`.
   - Otherwise → 409 `POST_STATUS_CONFLICT`.
3. `tx.post.update({ where: { id }, data: { status } })` when it changes. Nothing else on the post, its media, offers, cover, likes or comments is touched.
4. `action = tx.moderationAction.create({ adminId, action: DISMISS|HIDE|UNHIDE|REMOVE, postId, note })`.
5. `resolved = tx.postReport.updateMany({ where: { postId, resolvedByActionId: null }, data: { resolvedByActionId: action.id } })`. This runs for every action, unhide included.
6. Return `{ postId, status: newStatus, resolvedReports: resolved.count }`.

Log `{ adminId, postId, action }` at info.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/admin/admin-moderation.controller.ts` | Queue + post actions (+ user actions from TASK-090) |
| CREATE | `apps/api/src/modules/admin/moderation.service.ts` | Queue query, `act` |
| MODIFY | `apps/api/src/modules/admin/admin.module.ts` | Register |
| MODIFY | `apps/api/src/modules/posts/posts.service.ts` | `lockAnyPost` |
| CREATE | `apps/api/src/modules/admin/admin-moderation.integration.spec.ts` | Tests |

**Testing:**
- Non-admin → 403, logged-out → 401 (queue and actions).
- Queue: only posts with open reports. Grouping, counts, reasons and ordering are correct. Resolved reports are excluded. `no-store`.
- dismiss → status unchanged, all open reports resolved, action row; the post drops off the queue.
- hide on PUBLISHED → PENDING_REVIEW. Public detail/feed → 404 / absent. Owner detail still works. Creator `publish`/`archive`/`restore` → 409.
- unhide after hide → PUBLISHED, `publishedAt` unchanged. Unhide on a `POST_MODERATION_REQUIRED` PENDING_REVIEW post (no HIDE action) → 409. Unhide on PUBLISHED → 409.
- remove from PUBLISHED / ARCHIVED / PENDING_REVIEW → REMOVED. Owner detail → 404. Admin detail still `full`. Remove again → 409.
- **Financial/history invariant:** after remove, `post_offers` rows, `media_assets` rows (+ object still in storage), `post_likes` and earlier `moderation_actions` are unchanged (row counts + content).
- **Concurrency:** two parallel `hide` on one PUBLISHED post → exactly one 200, one 409, one HIDE action. Parallel `report` + `dismiss` leave no report half-resolved (every report is either resolved by the action or open).
- Unknown post → 404, malformed → 400, extra body key → 400, note > 500 → 400.

---

### TASK-090: Admin suspend / unsuspend a user or creator

New `AdminUsersController` (`@Controller('admin/users')`, `@UseGuards(AdminGuard)`) in the `admin` module, using `ModerationService`.

- `POST /admin/users/:id/suspend` and `POST /admin/users/:id/unsuspend` (`@HttpCode(200)`, body `moderationActionInputSchema`) → `ModerationUserResult`.
- `setUserStatus(targetUserId, adminId, to: 'SUSPENDED' | 'ACTIVE', note)`, one transaction:
  1. Suspend only: `targetUserId === adminId` or the target has the ADMIN `user_roles` row → 409 `CANNOT_SUSPEND_ADMIN`.
  2. Conditional update: `tx.user.updateMany({ where: { id, status: from }, data: { status: to } })`. If count is 0: unknown user → 404 `NOT_FOUND`, else → 409 `USER_STATUS_CONFLICT`. This avoids a lost race between two admins.
  3. `tx.moderationAction.create({ adminId, action: SUSPEND_USER | UNSUSPEND_USER, targetUserId, note })`.
- No other changes. Sessions aren't revoked (`SessionGuard` already rejects non-ACTIVE users, and unsuspend makes them valid again until they expire). Creator profile, posts, offers and any wallet/ledger rows are untouched.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/admin/admin-users.controller.ts` | Suspend routes |
| MODIFY | `apps/api/src/modules/admin/moderation.service.ts` | `setUserStatus` |
| MODIFY | `apps/api/src/modules/admin/admin.module.ts` | Register |
| CREATE | `apps/api/src/modules/admin/admin-users.integration.spec.ts` | Tests |

**Testing:**
- Non-admin → 403. Suspend a subscriber → 200; their existing session gets 401 on `/auth/me`; dev login / any `SessionGuard` route → 401.
- Suspend a creator → public `/creators/:slug`, feed and post detail → 404. Studio → 401. Their posts' statuses are unchanged.
- Suspend twice → 409 `USER_STATUS_CONFLICT`. Unsuspend an ACTIVE user → 409. Unknown → 404.
- Suspend self / another admin → 409 `CANNOT_SUSPEND_ADMIN`.
- Unsuspend → old session works again and the creator page is back.
- One action row per success, none on failure. Parallel suspends → one 200, one 409.

---

### TASK-091: Web — "Laporkan" on the post detail page

- `apps/web/src/components/report-post-button.tsx` (client component, used on `/{creatorSlug}/posts/{postId}`):
  - Logged-out viewer: a link "Laporkan" → `loginHref(currentPath)`.
  - Logged-in, non-owner, post PUBLISHED: a "Laporkan" button that opens an inline form (no modal library). Radio group of reasons with Indonesian labels (`SPAM: 'Spam'`, `SEXUAL_CONTENT: 'Konten seksual'`, `VIOLENCE: 'Kekerasan'`, `HARASSMENT: 'Pelecehan atau kebencian'`, `ILLEGAL: 'Kegiatan ilegal'`, `COPYRIGHT: 'Pelanggaran hak cipta'`, `OTHER: 'Lainnya'`), an optional `Textarea` (required for Lainnya, maxLength 500), and Kirim / Batal buttons.
  - `fetch('/api/v1/posts/:id/report', { method: 'POST', credentials: 'include', ... })`. On success it shows "Terima kasih, laporan Anda akan ditinjau." and hides the form. On an API error it shows the API `message` (covers 429, 403 and 404).
  - Hidden for the owner and for non-PUBLISHED posts. Decide from the existing `PublicPostDetail` (`status`, `viewer`) plus the current user (`getCurrentUser`) vs owner. If the page has no owner info, add `viewer.isOwner: boolean` to `PublicPostDetail.viewer` in shared + `PublicPostsService` (computed from the session, never the client). Prefer whatever the page already uses for the owner/admin draft label.
- Labels in `apps/web/src/lib/report-reasons.ts` (`Record<PostReportReason, string>`) so the admin page reuses them.
- Accessibility: a `fieldset`/`legend` for the reasons, labelled textarea, and focus moves to the form when it opens and to the status message after submit (`role="status"`).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/report-post-button.tsx` | Report UI |
| CREATE | `apps/web/src/components/report-post-button.test.tsx` | Tests |
| CREATE | `apps/web/src/lib/report-reasons.ts` | Labels |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.tsx` | Render it |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.test.tsx` | Visible/hidden cases |
| MODIFY (only if needed) | `packages/shared/src/posts.ts`, `apps/api/src/modules/posts/public-posts.service.ts` (+ spec) | `viewer.isOwner` |

**Testing (Vitest + Testing Library):**
- Logged-out → login link with returnTo. Owner → no button. Non-published → no button.
- Choosing Lainnya without a note blocks submit. Success → thank-you message and correct request body. API error message is shown.

---

### TASK-092: Web — `/admin/moderation` queue page + studio wording

- `apps/web/src/lib/api/admin-moderation.ts`: `getModerationQueue()` (server fetch with the session cookie, same pattern as `admin-creator-applications.ts`, `moderationQueueSchema.parse`).
- `apps/web/src/app/admin/moderation/page.tsx` (server, behind the existing admin layout gate). Title "Moderasi Konten". Empty state "Tidak ada laporan terbuka." Each item shows:
  - Creator name + `@slug` (+ "Ditangguhkan" badge), post status label (reuse `apps/web/src/app/studio/posts/labels.ts`), Gratis/Premium, caption first line, "n laporan" + reason summary (labels from `report-reasons.ts`), the newest reports (reason, note, reporter, date).
  - A "Lihat postingan" link to `/{slug}/posts/{id}` (admins get `full` access).
- `apps/web/src/app/admin/moderation/moderation-actions.tsx` (client, like `creator-application-actions.tsx`): an optional "Catatan" input plus buttons that show only when valid for the status:
  - Abaikan (always)
  - Sembunyikan (PUBLISHED)
  - Tampilkan lagi (PENDING_REVIEW)
  - Hapus (≠ REMOVED, with a `confirm()`)
  - Tangguhkan kreator (user ACTIVE, with `confirm()`) / Pulihkan akun (SUSPENDED)
  - Each calls the API, then `router.refresh()`. API errors are shown inline.
- `apps/web/src/app/admin/page.tsx`: add the link "Moderasi Konten" next to "Pengajuan Kreator".
- Studio wording, `apps/web/src/app/studio/posts/[postId]/post-status-actions.tsx`: PENDING_REVIEW notice → "Sedang ditinjau admin; tidak terlihat publik." Add a REMOVED notice "Dihapus oleh admin karena melanggar aturan. Tidak terlihat publik." (no actions).
- Update `.agile/guidelines/codebase-map.md` (new models, endpoints, routes, shared exports).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/admin-moderation.ts` | Fetch queue |
| CREATE | `apps/web/src/app/admin/moderation/page.tsx` | Queue page |
| CREATE | `apps/web/src/app/admin/moderation/moderation-actions.tsx` | Actions |
| CREATE | `apps/web/src/app/admin/moderation/moderation-actions.test.tsx` | Tests |
| CREATE | `apps/web/src/app/admin/moderation/page.test.tsx` | Render/empty state |
| MODIFY | `apps/web/src/app/admin/page.tsx` | Link |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/post-status-actions.tsx` (+ test) | Notices |
| MODIFY | `.agile/guidelines/codebase-map.md` | Keep in sync |

**Testing:**
- Page: empty state; item rendering (counts, reasons, suspended badge, post link).
- Actions: button set per status/user status; correct endpoint + body; confirm cancel → no request; error shown; refresh on success.
- Studio: PENDING_REVIEW and REMOVED notices.
- Playwright (if the e2e harness exists): subscriber reports a post → admin dismisses it from `/admin/moderation` → the queue is empty.
