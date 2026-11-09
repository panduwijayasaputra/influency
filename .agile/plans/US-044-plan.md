# Technical Plan: US-044 — Save Post API & Simpan Button

## Architecture Overview

A save is a private bookmark: a row in a new `post_saves` table, unique on `(user_id, post_id)`. It touches no entitlement, ledger or wallet, so no financial locking applies. It follows the existing **like** pattern (`PostLikesService` / `PostLikesController`: idempotent `createMany({ skipDuplicates })` / `deleteMany`) and lives in the `engagement` module.

Rules:
- **Save** needs an eligible post: `PostAccessService.check(postId, userId)` is not `hidden` (else `NOT_FOUND`) **and** the post is `PUBLISHED` (else `POST_NOT_AVAILABLE`). Locked premium posts and the user's own posts are allowed. There is deliberately no `canEngage` check (saving a locked post is allowed and grants nothing).
- **Unsave** has no eligibility check: it only deletes the caller's own row (`deleteMany({ userId, postId })`) and always answers `{ saved: false }`. That keeps un-saving possible after a post is archived or removed and leaks nothing about the post.
- The save count is never exposed: no count column, no count in any response.
- `viewer.saved` is added to the viewer object of every post response (list, feed, detail) so the button starts in the server state.

Story note: the story says the Simpan button is also wired "in the viewer". The design's full-screen viewer row is Like · Comment · Share · Kirim Tip and has no Simpan, so only the PostCard (which the post detail page also uses) gets the button. Edit that line of US-044's fourth criterion accordingly.

## Dependencies

- Prisma migration (new table). No new packages.

## Risks

- Adding `saved` to `publicPostViewerSchema` breaks fixtures. Mitigation: grep `canTip:` and `subscribed:` in `apps/api` and `apps/web` tests and add `saved: false`.
- Save/archive race is harmless (non-financial); same shortcut as likes, keep the same comment.

## Tasks

### TASK-180: `post_saves` model, migration, endpoints and tests

**Prisma** (`apps/api/prisma/schema.prisma`):

```prisma
/// user-area US-044: private bookmark. One row per (post, user). Grants no access; never counted publicly.
model PostSave {
  id        String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  postId    String   @map("post_id") @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  post      Post     @relation(fields: [postId], references: [id], onDelete: Restrict)
  user      User     @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@unique([postId, userId])
  @@index([userId, createdAt])
  @@map("post_saves")
}
```

Add `saves PostSave[]` to `Post` and `User`. Run `pnpm db:migrate` (name `post_saves`) and `pnpm --filter @influency/api generate`. The schema-conventions spec must stay green.

**Shared** (`packages/shared/src/posts.ts`): `export const postSaveResponseSchema = z.object({ saved: z.boolean() })` and the type `PostSaveResponse`.

**API** in `apps/api/src/modules/engagement/`:
- `post-saves.service.ts`: `PostSavesService` with `save(postId, userId)` and `unsave(postId, userId)`, using `PrismaService` and `PostAccessService` (already provided by `EngagementModule`, as `PostLikesService` does).
  - `save`: `access = await access.check(...)`; `hidden` → `DomainError('NOT_FOUND')`; load `post.status`; not `PUBLISHED` → `DomainError('POST_NOT_AVAILABLE')`; `createMany({ data: [{ postId, userId }], skipDuplicates: true })`; return `{ saved: true }`.
  - `unsave`: `deleteMany`; return `{ saved: false }`.
- `post-saves.controller.ts`: `@Controller('posts')`, `@UseGuards(SessionGuard, RateLimitGuard)`, `@RateLimit(POST_SAVE_RATE_LIMIT)`, `@Put(':id/save')` and `@Delete(':id/save')`, `ParseUUIDPipe` on `:id`, `@Header('cache-control', 'no-store')`. Export `POST_SAVE_RATE_LIMIT = { max: 60, timeWindow: '1 minute' }` with a "TBD placeholder" comment like `FOLLOW_RATE_LIMIT`. CSRF is covered by the global guard.
- Register both in `engagement.module.ts`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | `PostSave` (+ migration) |
| CREATE | `apps/api/prisma/migrations/<ts>_post_saves/migration.sql` | table, unique, index |
| MODIFY | `packages/shared/src/posts.ts` | `postSaveResponseSchema` |
| CREATE | `apps/api/src/modules/engagement/post-saves.service.ts` | save / unsave |
| CREATE | `apps/api/src/modules/engagement/post-saves.controller.ts` | PUT / DELETE |
| MODIFY | `apps/api/src/modules/engagement/engagement.module.ts` | providers / controllers |
| CREATE | `apps/api/src/modules/engagement/post-saves.integration.spec.ts` | integration tests |
| MODIFY | `.agile/guidelines/codebase-map.md` | `post_saves`, endpoints |

**Testing** (Supertest/`inject`, real Postgres; model on `post-likes.integration.spec.ts`):
- Save twice → one row, both 200 `{ saved: true }`; unsave twice → 200 `{ saved: false }`, no row.
- Guest → 401; bad `Origin` with the cookie → 403; malformed id → 400.
- Saving a locked premium post succeeds, and a later `GET` of that post still returns `access: 'locked'` with no media (saving never unlocks); `media-access` stays 403.
- Draft / archived / removed post, or a suspended creator's post → 404/`POST_NOT_AVAILABLE`, no row created. Own post can be saved.
- Unsave of an archived post still succeeds and removes the row.
- Another user's save is invisible (user B's `viewer.saved` is false) and no response carries a save count.
- Rate limit returns 429 past `max`.

---

### TASK-181: `viewer.saved` in every post response

- `packages/shared/src/posts.ts`: `publicPostViewerSchema` adds `saved: z.boolean()` (doc comment: "The viewer saved this post (Simpan). Private, grants nothing.").
- `apps/api/src/modules/posts/public-posts.service.ts`:
  - `viewerOf(...)`: add a `saved: boolean` parameter and set `saved` in the returned viewer object (anonymous stays `null`).
  - `toPublicPosts`: after the likes lookup add one batched `postSave.findMany({ where: { userId, postId: { in: ids } }, select: { postId: true } })` into a `savedIds` set (skip when `userId` is null or the page is empty); pass `savedIds.has(row.id)`.
  - `get()` (detail): one `postSave.findUnique({ where: { postId_userId: { postId, userId } } })` for the signed-in viewer, passed to `viewerOf`.
- Update every fixture / expectation that builds or deep-equals a viewer object: grep `canTip` and `subscribed:` under `apps/api/src` and `apps/web/src`, add `saved: false` (or the right value).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/posts.ts` | `viewer.saved` |
| MODIFY | `apps/api/src/modules/posts/public-posts.service.ts` | batched lookup, `viewerOf` |
| MODIFY | `apps/api/src/modules/posts/public-posts.integration.spec.ts`, `feed.integration.spec.ts`, `public-post-detail.integration.spec.ts`, `engagement/post-likes.integration.spec.ts` | `saved` expectations |
| MODIFY | web test fixtures that build `viewer` (grep) | `saved: false` |

**Testing:** list, feed and detail return `viewer.saved: true` for the saver and `false` for another user and the owner; anonymous viewer is still `null`; no extra query per post (one `post_saves` query per page, assert by counting with a Prisma query spy or by reading the code path).

---

### TASK-182: Simpan button wiring, toasts and demo seed

**Web client** `apps/web/src/lib/api/post-save.ts`: `setSaved(postId: string, save: boolean): Promise<boolean | null>`; `PUT`/`DELETE /api/v1/posts/{id}/save`; parses `postSaveResponseSchema`; **never throws**, returns `null` on any failure (same contract as `setFollow` in `creator-follow.ts`).

**Component** `apps/web/src/components/save-button.tsx` (`'use client'`), modeled on `like-button.tsx`: props `{ postId: string; initialSaved: boolean; className?: string }`. Renders the existing `Bookmark` icon (filled via `fill-current` when saved), `aria-pressed`, `aria-label` "Simpan" / "Hapus dari Disimpan", `ICON` button classes from `post-card.tsx` (44px). Click: optimistic flip, call `setSaved`; on `null` roll back and `toast('Gagal menyimpan. Coba lagi.')`; on success `toast('Disimpan ke Koleksi Saya')` or `toast('Dihapus dari Disimpan')`. Ignore clicks while a request is in flight.

**PostCard** (`components/post-card/post-card.tsx` ~line 238-246): replace the `toast(SOON)` button with `<SaveButton postId={post.id} initialSaved={post.viewer?.saved ?? false} className={ICON} />`; the guest branch (link to login) stays. Remove the now-unused `SOON` constant if nothing else uses it.

**Seed** (`apps/api/prisma/seed/`): add an idempotent `seedPostSaves` step to `seedSteps` (after posts and users; upsert by the unique `(postId, userId)`) giving a demo subscriber two saved posts (one free, one premium) using ids from `common/demo-ids.ts`. Add ids there only if needed.

**Story edit (already applied by the Tech Lead; do not redo):** in `US-044-save-post-api-and-simpan-button.md` change "on PostCard, the viewer and the post detail" to "on PostCard (which the post detail page also uses; the full-screen viewer has no Simpan in the design)".

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/post-save.ts` (+ `.test.ts`) | client |
| CREATE | `apps/web/src/components/save-button.tsx` (+ `.test.tsx`) | button |
| MODIFY | `apps/web/src/components/post-card/post-card.tsx`, `post-card.test.tsx` | use `SaveButton` |
| MODIFY | `apps/api/prisma/seed/seed.ts` (+ new step file) | demo saves |
| MODIFY | `.agile/features/user-area/US-044-save-post-api-and-simpan-button.md` | AC edit |

**Testing:** `setSaved` returns `true`/`false` on 200 and `null` on 500 / network error; `SaveButton` flips optimistically, shows the right toast, rolls back with the error toast on failure, ignores a second click while pending; a guest PostCard still links to login with `returnTo`; the "Segera hadir" toast no longer fires; `pnpm db:seed` runs twice without error.

## Suggested order

TASK-180 → TASK-181 → TASK-182.
