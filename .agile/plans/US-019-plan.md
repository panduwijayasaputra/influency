# Technical Plan: US-019 — Edit Comment API

## Architecture Overview

Add one endpoint and one nullable column to the existing comments module (`apps/api/src/modules/engagement/post-comments.*`).

- `post_comments.edited_at` (nullable). Set only by a real edit. Every comment and reply response returns it as `editedAt`; the UI already shows "Diedit" when it is non-null.
- `PATCH /posts/:id/comments/:commentId` with `{ body }` (same validation as create: trimmed, 1–500, plain text). Returns the updated item as a flat `PostReply` (id, body, createdAt, author, flags, `likeCount`, `editedAt`).
- Rules, in this order:
  1. `SessionGuard` (guest → 401); CSRF is the global guard.
  2. `gate(postId, userId, PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS)`: hidden → 404, not PUBLISHED → `POST_NOT_AVAILABLE`, locked premium without access → 403 `FORBIDDEN` (this is CMT-13: an author who lost access cannot edit).
  3. Load the live comment on that post (`deletedAt: null`); missing, deleted or another post's → 404 `NOT_FOUND`.
  4. Not the author → 403 `FORBIDDEN`. The post owner and admins get no override (CMT-06).
  5. Same trimmed text as stored → return the comment unchanged, `editedAt` untouched (no "Diedit" for a no-op).
  6. Otherwise `updateMany({ where: { id, userId, deletedAt: null }, data: { body, editedAt: new Date() } })`. `count === 0` (an edit racing a delete) → 404. Deleted text can never be changed or resurrected.
- No time limit and no rate limit on edits (`shortcut:` comment: edits are not rate-limited; add one if abused).
- Web: `CommentItem` already has an inline editor; its Simpan currently shows "Segera hadir". Wire it to the PATCH call through `PostComments`; on failure the draft stays and the API message shows inline.

Decisions confirmed with the user: non-author gets **403**, and an unchanged save is a **no-op** without "Diedit".

## Dependencies

- US-016 (inline editor and `canEdit` flag) and US-017 (`mapReply`/`mapTop`, `PostReply` schema) are done.
- US-018 (likes) is planned and also edits `post-comments.service.ts` (`mapReply` gets `liked`). Both changes are additive in `commentFields`/`mapReply`; whichever lands second must merge, not overwrite. Run `pnpm --filter @influency/shared build` after changing shared.
- No new packages.

## Risks

- **Merge with US-018** in the same service and mapper: keep the diffs small and additive.
- **Edit racing delete:** mitigated by the conditional `updateMany` (`deletedAt: null`); a test runs both together and asserts the deleted text never appears in a list.
- **Lost access is only "locked premium" today** because purchases are not built. The same `gate()` will cover real entitlements later; the test models "no access" as a fan without entitlement on a premium post.
- **Archived post:** the author's edit is rejected with `POST_NOT_AVAILABLE` (same as creating a comment there). Documented, not a bug.
- **Client merge:** the PATCH response is flat, so the web must merge only `body` and `editedAt` into the existing item (keep replies, `replyCount`, `canPin`, `pinned`).

## Tasks

### TASK-124: edited_at column and shared schemas

**What to build**

1. `apps/api/prisma/schema.prisma`, model `PostComment`: add
   ```prisma
   /// US-019: set only by a real edit; null = never edited.
   editedAt DateTime? @map("edited_at") @db.Timestamptz(3)
   ```
   Create the migration with `pnpm db:migrate` (name `comment_edited_at`; no data fix needed, existing rows stay null). Then `pnpm --filter @influency/api generate`. No new index.
2. `packages/shared/src/comments.ts`:
   ```ts
   /** Body of PATCH /posts/:id/comments/:commentId: same rules as creating. Response: PostReply. */
   export const updatePostCommentSchema = createPostCommentSchema.pick({ body: true });
   export type UpdatePostCommentInput = z.infer<typeof updatePostCommentSchema>;
   ```
   `postReplySchema.editedAt` already exists (`z.string().nullable().optional()`); update its doc comment to "ISO time of the last edit; null = never edited".
   Do not export or change anything else; rebuild shared.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | `editedAt` (+ migration) |
| CREATE | `apps/api/prisma/migrations/<ts>_comment_edited_at/migration.sql` | generated |
| MODIFY | `packages/shared/src/comments.ts` | `updatePostCommentSchema` |
| MODIFY | `packages/shared/src/comments.test.ts` | schema cases |

**Testing:**
- Shared: `updatePostCommentSchema` trims, rejects empty / whitespace / 501 characters, accepts 500, and strips `parentId` (only `body` is kept).
- `pnpm test` runs the migration through `global-setup.ts`; `schema-conventions.integration.spec.ts` passes.

---

### TASK-125: Edit endpoint (service, controller, integration tests)

**What to build**

1. `post-comments.service.ts`:
   - Add `editedAt: true` to `commentFields` and `editedAt: Date | null` to `CommentRow`; in `mapReply` add `editedAt: row.editedAt?.toISOString() ?? null` (placeholders in `mapTop` omit it). `mapTop` and `create` inherit this through `mapReply` (a new comment returns `editedAt: null`).
   - New method:
     ```ts
     async edit(postId: string, commentId: string, userId: string, input: UpdatePostCommentInput): Promise<PostReply> {
       const { ownerUserId } = await this.gate(postId, userId, this.env.PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS);
       const row = await this.prisma.postComment.findFirst({
         where: { id: commentId, postId, deletedAt: null },
         select: commentFields,
       });
       if (!row) throw new DomainError('NOT_FOUND');
       if (row.userId !== userId) throw new DomainError('FORBIDDEN');
       if (row.body === input.body) return mapReply(row, userId, ownerUserId); // no-op: no "Diedit"
       // shortcut: edits are not rate-limited; add a limit if abused.
       const { count } = await this.prisma.postComment.updateMany({
         where: { id: commentId, userId, deletedAt: null },
         data: { body: input.body, editedAt: new Date() },
       });
       if (count === 0) throw new DomainError('NOT_FOUND'); // deleted while editing
       const updated = await this.prisma.postComment.findUniqueOrThrow({ where: { id: commentId }, select: commentFields });
       return mapReply(updated, userId, ownerUserId);
     }
     ```
     `canPin` stays false in this flat response (the web merges only `body` and `editedAt`).
2. `post-comments.controller.ts`:
   ```ts
   @Patch(':id/comments/:commentId')
   @UseGuards(SessionGuard)
   @Header('cache-control', 'no-store')
   edit(@Param('id', ParseUUIDPipe) id, @Param('commentId', ParseUUIDPipe) commentId,
        @Body(new ZodValidationPipe(updatePostCommentSchema)) body: UpdatePostCommentInput,
        @Req() req: FastifyRequest): Promise<PostReply>
   ```
   Import `Patch`, `PostReply`, `updatePostCommentSchema`, `UpdatePostCommentInput`.
3. New spec `post-comment-edit.integration.spec.ts` (copy the `boot`/helpers pattern of `post-comment-replies.integration.spec.ts`; fixed ids with prefix `0190a000-0000-7000-8000-0000002b…`; users creator, author, other, admin with a `user_roles` ADMIN row; clean up in `afterAll`, replies before parents).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/engagement/post-comments.service.ts` | `edit`, `editedAt` in mapper |
| MODIFY | `apps/api/src/modules/engagement/post-comments.controller.ts` | PATCH route |
| CREATE | `apps/api/src/modules/engagement/post-comment-edit.integration.spec.ts` | tests |

**Testing (integration, real Postgres):**
- Author edits a top-level comment and a reply: 200, trimmed body, `editedAt` set, `no-store`; the list (and the replies endpoint) then returns `body` + `editedAt`; other fields unchanged.
- No time limit: a comment seeded a year ago can be edited.
- Same text (also with extra spaces) → 200, `editedAt` still null.
- Never-edited comments return `editedAt: null` in list, replies and create.
- Non-author fan → 403; **post creator → 403; admin → 403**; the body in DB is unchanged for all three.
- Deleted comment → 404 and its text unchanged and not returned anywhere; unknown id → 404; comment of another post → 404; malformed ids → 400.
- Validation: empty, whitespace, 501 characters → 400 `VALIDATION_FAILED`; extra `parentId` is ignored (comment keeps its parent).
- Guest → 401 `AUTH_REQUIRED`; wrong `Origin` → 403.
- Premium post, author without access (comment seeded) → 403 and unchanged; the owner's own comment on it → 200; with `PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS: true` the fan can edit.
- Archived / draft / removed post: draft/removed are hidden → 404, archived → `POST_NOT_AVAILABLE`.
- Race: run PATCH and DELETE together 5 times on fresh comments; every outcome is either (200 then deleted) or (204 and PATCH 404); in all cases the list never contains the comment text afterwards and the DB row is deleted.

---

### TASK-126: Wire the sheet's Edit action

**What to build** (web; `CommentItem` already has the editor, `Simpan` currently `toast('Segera hadir')`)

1. `components/comments/comment-item.tsx`: add to `CommentRowProps`:
   ```ts
   /** Saves an edit. Resolves to an error message to show in the editor, or null on success. */
   onEdit: (id: string, body: string) => Promise<string | null>;
   ```
   Editor submit: `setSaving(true)`, `const error = await onEdit(comment.id, draft.trim())`, `setSaving(false)`; on error `setEditError(error)` and keep `editing` and `draft`; on success `setEditing(false)` and return focus to the `···` trigger (same `requestAnimationFrame(() => menuRef.current?.focus())` as Batal). Show `editError` as `<p role="alert" className="text-xs text-destructive">` under the textarea; clear it on any change of the draft and on Batal. Simpan is disabled while `saving` or when `draft.trim() === ''`. Remove the "Segera hadir" toast from the edit submit only (pin keeps its toast).
2. `components/comments/comment-thread.tsx`: nothing to pass explicitly (`...row` already forwards `CommentRowProps`).
3. `components/comments/post-comments.tsx`: add
   ```ts
   const edit = async (id: string, text: string): Promise<string | null> => {
     try {
       const res = await fetch(`${base}/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: text }) });
       if (!res.ok) return await errorMessage(res);
       const saved = postReplySchema.parse(await res.json());
       setItems((list) => list.map((c) => applyEdit(c, saved)));
       return null;
     } catch { return FAILED; }
   };
   ```
   with a small pure helper `applyEdit(c, saved)` that sets `{ body: saved.body, editedAt: saved.editedAt }` on the top-level comment or on the reply with `saved.id`, keeping every other field (replies, `replyCount`, flags, `pinned`). Pass `onEdit={edit}` to `CommentThread`. Import `postReplySchema` from `@influency/shared`. Do not use `run()` (its shared error line is for the composer); the editor shows its own error. A 404 (deleted meanwhile) shows the API message.
4. Fix the fixtures that now miss `onEdit` (`comment-thread.test.tsx` renders; `pnpm typecheck` lists them) with `onEdit={vi.fn()}`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/components/comments/comment-item.tsx` | `onEdit`, saving/error state |
| MODIFY | `apps/web/src/components/comments/post-comments.tsx` | `edit`, `applyEdit` |
| MODIFY | `apps/web/src/components/comments/post-comments.test.tsx` | edit cases |
| MODIFY | `apps/web/src/components/comments/comment-thread.test.tsx` | fixtures + editor cases |

**Testing (Vitest + Testing Library, `fetch` stubbed):**
- Edit a top-level comment: menu → Edit → change text → Simpan sends `PATCH …/comments/<id>` with `{ body }`; the text updates, "Diedit" appears, the editor closes, focus returns to `···`.
- Edit a reply (thread open): only that reply changes; the parent's `replyCount` and replies stay.
- Failure (API 403/404 with an error body, and a network error): the editor stays open, the draft is unchanged, the message shows in a `role="alert"`, Simpan is enabled again; a second try can succeed.
- Simpan is disabled for an empty draft and while saving; Batal clears the error and restores the original text.
- The deleted-meanwhile 404 shows the message and does not change the list.
- `applyEdit` keeps `pinned`, `replies`, `replyCount`, `canPin`.
- `pnpm check` passes.
