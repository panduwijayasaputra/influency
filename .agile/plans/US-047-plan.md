# Technical Plan: US-047 — Archive & Restore a Post

## Architecture Overview

US-047 replaces US-019's "hide" with **archive**, following Monetization Spec v1 §4 and §4.1. These decisions were agreed with the user:

- **`HIDDEN` is renamed `ARCHIVED`** in the `post_status` enum with `ALTER TYPE … RENAME VALUE`, so existing rows keep their meaning. `POST /creators/me/posts/:id/hide` is replaced by `POST …/archive` and `POST …/restore`.
- **An archive can only start from PUBLISHED, and restore always returns the post to PUBLISHED.** A post that was archived had already passed the publish checks (and moderation, if it was on), and nothing can change while it is archived. So restore re-runs no checks and never goes to PENDING_REVIEW. `publishedAt` stays untouched, so the post keeps its feed position.
- **Archived posts are locked like live posts.** `POST_EDITABLE_STATUSES` becomes `['DRAFT']`. On an archived post the creator can change the caption and the offer price (setOffer already works in any status and only affects future purchases). They can't change visibility or add/delete media, so buyers who keep access through US-050 never lose media (Spec §4: no silent replacement of paid media). This drops the US-019 "hide → edit → republish" workflow on purpose.
- **Archive episodes** go in a new table `post_archive_episodes (id, post_id, archived_at, restored_at NULL)`. Archive inserts a row. Restore sets `restored_at` once, as a conditional write (`WHERE restored_at IS NULL`). Nothing else ever updates or deletes a row. A partial unique index on `(post_id) WHERE restored_at IS NULL` allows at most one open episode per post. US-050 will read the open episode's `archived_at` for the archive grant (`startsAt <= archivedAt < endsAt`).
- **Both transitions run in one transaction under the post-row lock** (the existing `lockPost`): lock the row, check the status, update `posts.status`, then insert or close the episode. Two concurrent archives (or restores) are serialized; the second one sees the new status and gets 409 `POST_STATUS_CONFLICT`.
- **Nothing public changes.** The public feed already returns only `PUBLISHED` posts. "Can no longer be newly unlocked" holds for now because purchases don't exist yet. US-025 must require `status = 'PUBLISHED'` when it creates a purchase; record this in the codebase map.

| AC | Covered by |
|----|------------|
| Archive own published post; it leaves the public page/feed and can't be newly unlocked | `archive` PUBLISHED → ARCHIVED; the feed filters PUBLISHED (test); US-025 note |
| An episode with a timestamp on every archive, closed on restore, a new one on re-archive, never edited/deleted | `post_archive_episodes` + partial unique index + conditional close (tests) |
| Restore returns it to the public page as PUBLISHED | `restore` ARCHIVED → PUBLISHED; feed test |
| Archiving never deletes the post or media | Status change only; media locked while ARCHIVED (test that media rows survive and DELETE is `POST_LOCKED`) |
| Studio shows Arsipkan / Pulihkan and the archived state in the list | `PostStatusActions` + `POST_STATUS_LABELS.ARCHIVED = 'Diarsipkan'` |
| Archived visible only to the owner until purchases exist | Studio is owner-scoped; the public feed excludes it (test) |

## Dependencies

- None. No new packages.

## Risks

- **Prisma can't rename an enum value by itself.** `migrate dev` would generate a drop-and-recreate. Use `--create-only` and hand-write the SQL below. Then check that `prisma migrate diff` / `migrate dev` reports no drift.
- **Legacy HIDDEN rows have no episode.** The migration backfills an open episode for every row that becomes ARCHIVED (`archived_at = updated_at`, the best timestamp available; this affects dev data only). Without the backfill, restoring those posts would fail.
- **Legacy HIDDEN posts may have been edited while hidden**, for example with all media deleted. This is dev data only. Restore doesn't re-check media. Accepted; mention it in the migration header.
- **PENDING_REVIEW posts can no longer be withdrawn** (the old hide allowed it). This only matters when `POST_MODERATION_REQUIRED=true`, and there is no admin moderation flow yet. Revisit with admin moderation (US-040+).
- **Copy drift:** the "Sembunyikan post dulu…" hints (`POST_LOCKED` message, post form, media section) no longer make sense, because nothing unlocks editing after the first publish. Update all three.

## Tasks

### TASK-060: Archive & restore — shared contract, migration and API

**Shared** (`packages/shared/src/posts.ts`):
- In `POST_STATUSES`, replace `'HIDDEN'` with `'ARCHIVED'`, keeping the same position.
- `POST_EDITABLE_STATUSES = ['DRAFT'] as const satisfies readonly PostStatus[];`. Update its doc comment: visibility and media may change only in DRAFT; PUBLISHED, PENDING_REVIEW and ARCHIVED allow caption (and offer price) edits only, so paid media is never removed.
- Update the `publishedAt` comment: "kept when an archived post is restored".
- `packages/shared/src/errors.ts`: set the `POST_LOCKED` message to `'Jenis post dan media tidak bisa diubah setelah post terbit.'`.
- `packages/shared/src/posts.test.ts:89`: the expectation becomes `status === 'DRAFT'`.

**Prisma** (`apps/api/prisma/schema.prisma`):
- In `enum PostStatus`, replace `HIDDEN` with `ARCHIVED`.
- New model (add `archiveEpisodes PostArchiveEpisode[]` to `Post`):

```prisma
/// US-047 archive history. Archive inserts an open episode; restore sets restored_at once; rows are never otherwise
/// updated or deleted. Partial unique index (migration): one open episode per post. US-050 reads archived_at for grants.
model PostArchiveEpisode {
  id         String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  postId     String    @map("post_id") @db.Uuid
  archivedAt DateTime  @default(now()) @map("archived_at") @db.Timestamptz(3)
  restoredAt DateTime? @map("restored_at") @db.Timestamptz(3)
  post       Post      @relation(fields: [postId], references: [id], onDelete: Restrict)

  @@index([postId, archivedAt])
  @@map("post_archive_episodes")
}
```

`schema-conventions.integration.spec.ts` must still pass. If it requires `created_at`/`updated_at`, check how `creator_application_reviews` (append-only, no `updated_at`) is exempted, and treat `archived_at` the same way, or add `createdAt` if the convention demands it.

**Migration:** run `pnpm --filter @influency/api exec prisma migrate dev --create-only --name post_archive_episodes`, then hand-edit the file so it reads:

```sql
-- US-047: HIDDEN becomes ARCHIVED (rename keeps existing rows) + append-only archive episodes.
-- Legacy HIDDEN posts get an open episode at updated_at (dev data only; they may have been edited while hidden).
ALTER TYPE "post_status" RENAME VALUE 'HIDDEN' TO 'ARCHIVED';

CREATE TABLE "post_archive_episodes" ( …as generated… );
CREATE INDEX … ("post_id", "archived_at");
ALTER TABLE … ADD CONSTRAINT "post_archive_episodes_post_id_fkey" … ON DELETE RESTRICT;

CREATE UNIQUE INDEX "post_archive_episodes_one_open" ON "post_archive_episodes" ("post_id") WHERE "restored_at" IS NULL;
ALTER TABLE "post_archive_episodes" ADD CONSTRAINT "post_archive_episodes_restored_after_archived"
  CHECK ("restored_at" IS NULL OR "restored_at" >= "archived_at");

INSERT INTO "post_archive_episodes" ("post_id", "archived_at")
SELECT "id", "updated_at" FROM "posts" WHERE "status" = 'ARCHIVED';
```

Then run `pnpm --filter @influency/api generate`.

**Service** (`apps/api/src/modules/posts/posts.service.ts`): delete `hide` and add:

```ts
/** PUBLISHED → ARCHIVED and opens an archive episode, under the post-row lock. Never touches media. */
async archive(creatorProfileId: string, id: string): Promise<StudioPost> {
  await this.prisma.$transaction(async (tx) => {
    const post = await this.lockPost(tx, creatorProfileId, id);
    if (post.status !== 'PUBLISHED') throw new DomainError('POST_STATUS_CONFLICT');
    await tx.post.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await tx.postArchiveEpisode.create({ data: { postId: id } });
  });
  return this.get(creatorProfileId, id);
}

/** ARCHIVED → PUBLISHED and closes the open episode. No publish re-checks: the post was published and stayed locked. */
async restore(creatorProfileId: string, id: string): Promise<StudioPost> {
  await this.prisma.$transaction(async (tx) => {
    const post = await this.lockPost(tx, creatorProfileId, id);
    if (post.status !== 'ARCHIVED') throw new DomainError('POST_STATUS_CONFLICT');
    await tx.post.update({ where: { id }, data: { status: 'PUBLISHED' } });
    await tx.postArchiveEpisode.updateMany({
      where: { postId: id, restoredAt: null },
      data: { restoredAt: new Date() },
    });
  });
  return this.get(creatorProfileId, id);
}
```

- `publish`: keep the `isPostEditable` check. It now means DRAFT only, so publishing an ARCHIVED post returns `POST_STATUS_CONFLICT`; the creator must use restore. Update its doc comment (`DRAFT → PUBLISHED …`) and the `publishedAt` comment ("a restored post keeps its feed position" is now handled by restore not touching it).
- `post-media.service.ts` needs no code change, because it uses `isPostEditable`.

**Controller** (`posts.controller.ts`): replace the `:id/hide` route with `:id/archive` and `:id/restore`, using the same `@HttpCode(200)` and `postIdPipe` pattern and calling `this.posts.archive` / `this.posts.restore`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/posts.ts` | ARCHIVED status, editable = DRAFT only |
| MODIFY | `packages/shared/src/posts.test.ts` | editable expectation |
| MODIFY | `packages/shared/src/errors.ts` | `POST_LOCKED` copy |
| MODIFY | `apps/api/prisma/schema.prisma` | enum rename, `PostArchiveEpisode` (+ migration) |
| CREATE | `apps/api/prisma/migrations/<ts>_post_archive_episodes/migration.sql` | rename, table, partial unique index, CHECK, backfill |
| MODIFY | `apps/api/src/modules/posts/posts.service.ts` | `archive`/`restore`, remove `hide` |
| MODIFY | `apps/api/src/modules/posts/posts.controller.ts` | routes |
| MODIFY | `apps/api/src/modules/posts/post-publish.integration.spec.ts` | rewrite hide tests as archive/restore |
| MODIFY | `apps/api/src/modules/posts/public-posts.integration.spec.ts` | `'HIDDEN'` → `'ARCHIVED'` (type literal line 90, fixture line 111) |
| MODIFY | `apps/api/src/common/schema-conventions.integration.spec.ts` | only if the new table needs an exemption |

**Testing** (in `post-publish.integration.spec.ts`, using its existing `action`/`send`/`createPost` helpers and its `…00000020` id range; widen the `action` type to `'publish' | 'archive' | 'restore'`):
- Archive a PUBLISHED post: 200 `ARCHIVED`, one episode with `restoredAt = null`. Archiving again gives 409 `POST_STATUS_CONFLICT` and still one episode.
- Restore: 200 `PUBLISHED`, `publishedAt` unchanged, and the episode now has `restoredAt >= archivedAt`. Restoring again gives 409.
- Archive → restore → archive leaves two episodes; the first is unchanged (same `archivedAt`/`restoredAt` as before) and the second is open.
- Archiving a DRAFT, archiving a REMOVED post, restoring a DRAFT, restoring a PUBLISHED post: all 409 `POST_STATUS_CONFLICT`. Publishing an ARCHIVED post gives 409 `POST_STATUS_CONFLICT`.
- Archiving a PENDING_REVIEW post (moderated app) gives 409.
- While ARCHIVED: a caption PATCH gives 200; a visibility change, a new media slot and a media DELETE give 409 `POST_LOCKED`; the media rows still exist; PUT offer still gives 200.
- Foreign or unknown post on archive/restore gives 404 `NOT_FOUND`; a malformed id gives 400.
- Concurrency: two parallel `archive` calls on one PUBLISHED post give one 200 and one 409, and exactly one open episode.
- DB guard: inserting a second open episode for the same post directly through Prisma fails (unique violation).
- In `public-posts.integration.spec.ts`: an ARCHIVED post is excluded from `GET /creators/:slug/posts`. Add a case where archiving drops the post from the feed and restoring brings it back.

---

### TASK-061: Studio — Arsipkan / Pulihkan and archived state

- `apps/web/src/app/studio/posts/labels.ts`: replace `HIDDEN: 'Disembunyikan'` with `ARCHIVED: 'Diarsipkan'`. The list (`my-post-list.tsx`) already renders `POST_STATUS_LABELS`, so it shows "Gratis · Diarsipkan" without further changes.
- `apps/web/src/app/studio/posts/[postId]/post-status-actions.tsx`: replace the action choice with a status map:

```ts
const ACTIONS: Partial<Record<StudioPost['status'], { action: 'publish' | 'archive' | 'restore'; label: string; notice?: string }>> = {
  DRAFT: { action: 'publish', label: 'Publikasikan' },
  PUBLISHED: { action: 'archive', label: 'Arsipkan', notice: 'Post tampil di halaman publik Anda.' },
  ARCHIVED: { action: 'restore', label: 'Pulihkan', notice: 'Post diarsipkan: tidak tampil di halaman publik dan tidak bisa dibeli. Media tetap tersimpan.' },
};
```

  PENDING_REVIEW shows only its notice ("Menunggu tinjauan admin sebelum tampil."), with no button. Keep the `run()` fetch/error handling unchanged, posting to `/api/v1/creators/me/posts/${id}/${action}`. `archive` uses `variant="outline"`; the others use the default variant. Drop the `isPostEditable` import if it becomes unused.
- `apps/web/src/app/studio/posts/post-form.tsx:146`: change the hint to "Jenis post tidak bisa diubah setelah post terbit."
- `apps/web/src/app/studio/posts/[postId]/post-media.tsx:185`: change the hint to "Media tidak bisa diubah setelah post terbit."
- `apps/web/src/app/studio/posts/[postId]/page.tsx` needs no change, because `locked={!isPostEditable(...)}` now covers ARCHIVED.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/studio/posts/labels.ts` | `ARCHIVED: 'Diarsipkan'` |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/post-status-actions.tsx` | Publikasikan / Arsipkan / Pulihkan |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/post-status-actions.test.tsx` | updated cases |
| MODIFY | `apps/web/src/app/studio/posts/post-form.tsx` (+ test if it asserts the hint) | locked hint copy |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/post-media.tsx` (+ test if it asserts the hint) | locked hint copy |
| MODIFY | `.agile/guidelines/codebase-map.md` | ARCHIVED, episodes table, endpoints, editable = DRAFT, US-025 note (purchase requires PUBLISHED) |

**Testing** (Testing Library, existing `post-status-actions.test.tsx` pattern):
- DRAFT shows "Publikasikan" and POSTs `/publish`.
- PUBLISHED shows "Arsipkan" with the public notice and POSTs `/archive`.
- ARCHIVED shows "Pulihkan" with the archived notice and POSTs `/restore`.
- PENDING_REVIEW shows the notice and no button. REMOVED renders nothing.
- An API error message is shown in `role="alert"`; success calls `router.refresh()`.
- The post form and media section show the new locked hints for an ARCHIVED post (Gratis/Premium disabled, no upload/Hapus).
- Run `pnpm check` from the root.
