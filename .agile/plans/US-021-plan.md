# Technical Plan: US-021 — Admin Comment Moderation

## Architecture Overview

Admins and post creators already can or should delete other people's comments; this story adds the admin right and the audit trail. No new endpoint and no new UI.

- **One delete rule, one route.** `DELETE /posts/:id/comments/:commentId` (existing) allows the author, the post's creator, or an **admin**. The admin role is read from `user_roles` on every request, never from request data. Anyone else gets 403 `FORBIDDEN` (the 403 for non-admins that the story asks for).
- **Audit table `comment_moderation_actions`** (decided with the user; `moderation_actions` stays admin-only and post/user-targeted). Append-only, one row per moderation delete: `comment_id` (UNIQUE), `post_id`, `actor_id`, `actor_role` (`CREATOR` | `ADMIN`), `created_at`. A self-delete by the author writes nothing.
- **Same transaction, winner only.** The soft delete and the audit insert run in one `$transaction`. The audit row is written only when the conditional `updateMany` (`deletedAt: null`) actually deleted the row (`count === 1`), so two concurrent deletes produce one audit row, and the UNIQUE `comment_id` makes a duplicate impossible even without that check.
- **Role precedence:** if the actor is both the post's creator and an admin, the row says `ADMIN`.
- **Moderation never grants edit.** `canEdit` stays author-only, `edit()` is unchanged (already 403 for creator/admin, tested in US-019). `canPin` stays creator-only (US-020).
- **Flags:** `canDelete` becomes `author || post creator || admin`, so the existing `···` menu shows Hapus to admins with no client change. `gate()` returns `isAdmin` (one extra `user_roles` lookup for a signed-in viewer) and the mappers take it.
- Admins may delete on any post they can see in full, including DRAFT/ARCHIVED/REMOVED posts (`PostAccessService` gives admins `full`), because moderation must reach abusive comments on taken-down posts.
- Existing behaviour kept: soft delete, placeholder rules, pin cleared on delete (`pinnedAt: null`), deleted text never returned.

## Dependencies

- US-017 (placeholders), US-019 (author-only edit) and US-020 (delete clears the pin) are in the codebase; this plan builds on the current `PostCommentsService.delete`.
- No new packages.

## Risks

- **FK RESTRICT breaks other specs' cleanup.** The new table references users, posts and comments with RESTRICT. Any spec that deletes a comment as the post creator (or an admin) now leaves an audit row, so its `afterAll` must delete `commentModerationAction` rows first or the post/user delete fails. Mitigation: TASK-133 greps the specs that call the delete route as a non-author (at least `post-comments.integration.spec.ts`; also check the comment-likes, pin and replies/edit specs) and adds `prisma.commentModerationAction.deleteMany({ where: { post: { creatorProfile: { userId: { in: userIds } } } } })` before their post/comment deletion. The full suite must pass.
- **Append-only is by convention** (the project has no DB triggers for other append-only tables either): no code path updates or deletes audit rows. A test asserts there is no such code path by checking rows survive an idempotent re-delete.
- **Admin identity leaks into responses:** the audit table is not exposed by any endpoint in this story, and comment responses stay free of user ids.
- **Extra query per request:** `isAdmin` adds one indexed lookup to list/replies/create/edit/delete for signed-in users only; guests skip it.

## Tasks

### TASK-132: comment_moderation_actions table (Prisma model + migration)

**What to build**

1. `apps/api/prisma/schema.prisma`:
   ```prisma
   enum CommentModerationActor {
     CREATOR
     ADMIN

     @@map("comment_moderation_actor")
   }

   /// US-021: append-only audit of a comment deleted by someone other than its author (the post's creator or an
   /// admin). One row per comment (UNIQUE). Never updated or deleted. The author's own delete writes nothing.
   model CommentModerationAction {
     id        String                 @id @default(dbgenerated("uuidv7()")) @db.Uuid
     commentId String                 @unique @map("comment_id") @db.Uuid
     postId    String                 @map("post_id") @db.Uuid
     actorId   String                 @map("actor_id") @db.Uuid
     actorRole CommentModerationActor @map("actor_role")
     createdAt DateTime               @default(now()) @map("created_at") @db.Timestamptz(3)
     comment   PostComment            @relation(fields: [commentId], references: [id], onDelete: Restrict)
     post      Post                   @relation(fields: [postId], references: [id], onDelete: Restrict)
     actor     User                   @relation("CommentModerationActor", fields: [actorId], references: [id], onDelete: Restrict)

     @@index([postId, createdAt])
     @@index([actorId, createdAt])
     @@map("comment_moderation_actions")
   }
   ```
   Add the back-relations: `PostComment.moderationAction CommentModerationAction?`, `Post.commentModerationActions CommentModerationAction[]`, `User.commentModerationActions CommentModerationAction[] @relation("CommentModerationActor")`.
2. Create the migration with `pnpm db:migrate` (name `comment_moderation_actions`), then `pnpm --filter @influency/api generate`.
3. `src/common/schema-conventions.integration.spec.ts` must still pass (uuidv7 default, snake_case, timestamptz, no float).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | enum, model, back-relations (+ migration) |
| CREATE | `apps/api/prisma/migrations/<ts>_comment_moderation_actions/migration.sql` | generated |

**Testing:**
- `pnpm test` runs the migration via `global-setup.ts`; schema-conventions spec passes.
- Covered functionally by TASK-133 (UNIQUE `comment_id`: a second raw insert for the same comment is rejected).

---

### TASK-133: Admin delete right, audit record and canDelete flag

**What to build** in `apps/api/src/modules/engagement/post-comments.service.ts` (and the cleanup lines of existing specs).

1. **`gate()`** also returns `isAdmin: boolean`:
   ```ts
   const isAdmin = userId !== null && (await this.prisma.userRole.findUnique({ where: { userId_role: { userId, role: 'ADMIN' } }, select: { userId: true } })) !== null;
   ```
   Add it to the return object `{ access, status, ownerUserId, isAdmin }` and to the declared return type. Guests skip the query.
2. **Mappers:** `mapReply(row, viewerId, ownerUserId, isAdmin, liked)` and `mapTop(row, viewerId, ownerUserId, isAdmin, liked)` (insert `isAdmin: boolean` before `liked`). In `mapReply`: `canDelete: isAuthor || isOwner || isAdmin`. `canEdit` stays `isAuthor`; in `mapTop` `canPin` stays `isOwner` only. The deleted placeholder keeps `canDelete: false`. Update every call in `list`, `listReplies`, `create`, `edit` to destructure `isAdmin` from `gate()` and pass it (for `create`/`edit`, a brand new or own comment: pass it through unchanged).
3. **`delete(postId, commentId, userId)`** rewritten:
   ```ts
   async delete(postId: string, commentId: string, userId: string): Promise<void> {
     if ((await this.access.check(postId, userId)) === 'hidden') throw new DomainError('NOT_FOUND');
     const comment = await this.prisma.postComment.findFirst({
       where: { id: commentId, postId, deletedAt: null }, select: { userId: true },
     });
     if (!comment) throw new DomainError('NOT_FOUND');
     const post = await this.loadPost(postId);
     const isAuthor = comment.userId === userId;
     const isOwner = post.creatorProfile.userId === userId;
     const isAdmin = (await this.prisma.userRole.findUnique({ where: { userId_role: { userId, role: 'ADMIN' } }, select: { userId: true } })) !== null;
     if (!isAuthor && !isOwner && !isAdmin) throw new DomainError('FORBIDDEN');
     await this.prisma.$transaction(async (tx) => {
       // deletedAt: null makes a concurrent second delete a no-op; the pin is cleared in the same statement (CMT-12).
       const { count } = await tx.postComment.updateMany({
         where: { id: commentId, deletedAt: null },
         data: { deletedAt: new Date(), deletedByUserId: userId, pinnedAt: null },
       });
       // Only the winning delete of someone else's comment is audited; the author's own delete is not.
       if (count === 1 && !isAuthor) {
         await tx.commentModerationAction.create({
           data: { commentId, postId, actorId: userId, actorRole: isAdmin ? 'ADMIN' : 'CREATOR' },
         });
       }
     });
   }
   ```
   (`isAdmin` wins when the actor is both an admin and the post's creator.) The route and its 204 response do not change. Update the doc comment of `delete`.
4. **Controller** `post-comments.controller.ts`: comment on the DELETE route only ("author, post creator or admin; moderation deletes are audited"). No behaviour change.
5. **Existing specs' cleanup.** `grep -rn "commentModerationAction\|postComment.deleteMany" apps/api/src` and add `await prisma.commentModerationAction.deleteMany({ where: { post: { creatorProfile: { userId: { in: userIds } } } } });` before the existing `postComment.deleteMany` in every spec whose tests delete a comment as the post creator or an admin (at least `post-comments.integration.spec.ts`; check `post-comment-replies`, `post-comment-edit`, the comment likes and pin specs). Run the full api suite to find the rest.
6. **New spec** `post-comment-moderation.integration.spec.ts` (copy the helpers of `post-comment-edit.integration.spec.ts`; fixed ids prefix `0190a000-0000-7000-8000-0000002d…`, check `grep -oh "0000002[0-9a-f]" apps/api/src -r` so the prefix is free; users creator, author, other, admin, admin2 with ADMIN rows; clean up the audit table first, then replies, comments, offers, posts, profile, roles, sessions, users).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/engagement/post-comments.service.ts` | `gate().isAdmin`, mappers, `delete` + audit |
| MODIFY | `apps/api/src/modules/engagement/post-comments.controller.ts` | comment only |
| CREATE | `apps/api/src/modules/engagement/post-comment-moderation.integration.spec.ts` | tests |
| MODIFY | existing `*.integration.spec.ts` that delete as a non-author | `afterAll` cleanup of the audit table |

**Testing (integration, real Postgres):**
- **Admin delete:** an admin who is not the post's creator deletes a fan's top-level comment on someone else's post → 204; the list shows the placeholder (if it has a live reply) or omits it; the old text appears nowhere in any response; `deleted_by_user_id` is the admin; exactly one audit row `{ actorRole: 'ADMIN', actorId, commentId, postId }`.
- **Admin delete of a reply** and of a comment on an ARCHIVED, DRAFT and REMOVED post (an admin sees these) → 204 + audit.
- **Creator delete:** the post's creator deletes a fan's comment → 204 + one audit row with `CREATOR`. A user who is both creator and admin → `ADMIN`.
- **Self-delete:** the author (fan, and also an admin deleting their own comment, and the creator deleting their own) → 204 and **no** audit row.
- **Non-admin attempt:** another fan → 403 `FORBIDDEN`, no row deleted, no audit row; guest → 401; cross-origin → 403; a user who merely claims admin (body/query/header like `role=ADMIN`, `x-admin: 1`) → still 403.
- **Not found:** deleted, unknown, other-post comment → 404 and no audit row; an already-deleted comment deleted again by the admin → 404, still one audit row.
- **Concurrency:** admin and creator delete the same comment together (`Promise.all`): one 204 and one 404 (or two idempotent outcomes), exactly one audit row; a raw second insert for the same `comment_id` is rejected by the UNIQUE index.
- **Pin:** deleting a pinned comment as admin clears `pinned_at` (existing behaviour kept).
- **Flags:** `canDelete` is true for the admin on every comment (top-level and reply) in list/replies, true for the creator, true for the author, false for other fans and guests; the admin gets `canEdit: false` on others' comments and `canPin: false`; the creator keeps `canPin: true` on top-level.
- **No edit rights:** the admin's and creator's `PATCH` on a fan's comment still return 403 and the text is unchanged.
- **Response shape:** no user ids anywhere in the list JSON for the admin viewer.
- `pnpm check` passes (all earlier specs still green after the cleanup edits).
