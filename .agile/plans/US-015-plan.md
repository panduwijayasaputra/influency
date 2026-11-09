# Technical Plan: US-015 — Comment Thread UI (replies, likes, labels)

## Architecture Overview

UI only. The API does not return replies, likes, pins, edits or avatars yet, so this story:

1. **Grows the shared comment type with optional fields.** This is the contract US-017 to US-020 will fill in.
2. **Builds the thread UI so each feature appears only when its field is present.** Field present means the feature is live. Absent fields are simply hidden, so today's API renders exactly as before.
3. **Pre-wires the like client** against the UX spec's endpoints (`POST` / `DELETE /posts/:postId/comments/:commentId/likes`). The heart stays on "Segera hadir" until a comment carries `likeCount`. US-018 builds the server to match.

Decisions agreed with the user (2026-11-07):

- **Contract:** nested, optional fields.
- **Like wiring:** pre-wire the real client.

**Contract (added to `postCommentSchema`, all optional until the matching story makes them required):**

```ts
likeCount?: number;            // US-018. Present = likes are live.
liked?: boolean;               // US-018, the viewer's own like.
editedAt?: string | null;      // US-019. Non-null = show "Diedit".
pinned?: boolean;              // US-020. Only on a top-level comment.
deleted?: boolean;             // US-017. Placeholder: body '' and author.displayName '' are ignored by the UI.
avatarUrl?: string | null;     // Later. The UI falls back to initials.
replyCount?: number;           // US-017.
replies?: PostReply[];         // US-017. One level only, oldest first.
```

`PostReply` is the same shape without `replies`, `replyCount` and `pinned`.

**Endpoint paths.** The like client uses `/api/v1/posts/{postId}/comments/{commentId}/likes`, nested like the existing delete route. The UX spec's `/comments/:commentId/likes` is DRAFT, and the nested form lets the server reuse the post access gate. US-018 must match this path.

**Rendering rules (per comment):**

- Header: avatar (image or initials circle), name, relative time (`formatRelativeTime`), "· Diedit" when `editedAt`.
- Pinned (top-level only): a Pin icon and the label "Disematkan oleh creator" above the header.
- Body: plain text, `whitespace-pre-wrap`, never HTML (unchanged).
- Actions row: like heart + count, **Balas**, and the existing Hapus (stays until US-016 replaces it with the menu).
- `deleted`: avatar-less row with the italic muted text "Komentar dihapus". No body, name or avatar, and no actions. If it has no replies it renders nothing (the server omits those, and this guards against a stale one).
- Replies: `replyCount ?? replies.length` greater than 0 shows a "Lihat n balasan" toggle (`aria-expanded`). Expanded, the replies render indented one level (`ml-10`), each with the same item (no nested reply toggle).

**Balas.** A signed-in viewer sees a "Segera hadir" toast. A guest gets a login link. US-017 wires it to the composer. It shows only when `initial.canComment || !loggedIn`.

## Dependencies

- None new. Uses `lucide-react` (Heart, Pin), `useToast`, `loginHref`, `formatRelativeTime`, `initials`.
- Rebuild shared after TASK-110: `pnpm --filter @influency/shared build`.

## Risks

- **Pre-wiring an endpoint that does not exist yet:**
  - If US-018 picks a different path or shape, the client changes.
  - Mitigation: the paths and the `{ liked, likeCount }` response are fixed in this plan and in the US-018 story AC (tech lead keeps them aligned when planning US-018).
  - The feature is off until `likeCount` is present, so there is no user-facing breakage.
- **A deleted comment must never leak text:** the UI ignores `body` and `author` when `deleted`.
  - Mitigation: a test with real-looking body and name on a deleted fixture asserts neither is in the DOM.
- **Optimistic toggling with fast double taps:**
  - Mitigation: disable the button while pending, and always rollback to the pre-tap state on failure.
- **Layout at 375px:** a long unbroken name or word could overflow.
  - Mitigation: `min-w-0`, `wrap-break-word`, `truncate` on the name.

## Tasks

### TASK-110: Extend the shared comment schema

**What to build**

In `packages/shared/src/comments.ts`:

1. Add `postReplySchema`: the current `postCommentSchema` fields (`id`, `body`, `createdAt`, `author`, `canDelete`) plus the optional `likeCount: z.number().int().min(0)`, `liked: z.boolean()`, `editedAt: z.string().nullable()`, `deleted: z.boolean()`, `avatarUrl: z.string().nullable()`. Export `PostReply`.
2. Redefine `postCommentSchema = postReplySchema.extend({ pinned: z.boolean().optional(), replyCount: z.number().int().min(0).optional(), replies: z.array(postReplySchema).optional() })`. Keep the `PostComment` export, and keep doc comments saying which story fills each field.
3. Add `commentLikeResponseSchema = z.object({ liked: z.boolean(), likeCount: z.number().int().min(0) })` and export `CommentLikeResponse`. This is the contract for the like endpoints (200 for both POST and DELETE; idempotent).
4. Do not change `postCommentListSchema` (it already holds `items: z.array(postCommentSchema)`).
5. Check the API still compiles: `toComment` in the API returns the old fields, which stay valid because the new ones are optional.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/comments.ts` | `postReplySchema`, extended `postCommentSchema`, `commentLikeResponseSchema` |
| MODIFY | `packages/shared/src/comments.test.ts` | New cases |
| (check) | `packages/shared/src/index.ts` | Make sure the new exports are re-exported |

**Testing:**

- The old minimal comment still parses (back-compat).
- A comment with every new field parses, including one nested reply.
- A reply that itself has `replies` is stripped or rejected consistently with the schema's object mode (follow how the other shared schemas behave; assert the chosen behaviour).
- A negative `likeCount` and a non-boolean `liked` are rejected.
- `commentLikeResponseSchema` parses `{ liked: true, likeCount: 3 }` and rejects a missing field.

---

### TASK-111: Comment like client and CommentLikeButton

**What to build**

1. **`apps/web/src/lib/api/comment-likes.ts`** (client-side, same-origin, no secrets):

   ```ts
   export async function setCommentLike(
     postId: string,
     commentId: string,
     like: boolean,
   ): Promise<CommentLikeResponse | null>;
   ```

   - `fetch(`/${API_PREFIX}/posts/${postId}/comments/${commentId}/likes`, { method: like ? 'POST' : 'DELETE' })`
   - It returns the parsed `commentLikeResponseSchema` on a 2xx, and `null` on any non-2xx, network error or unparsable body (never throws).

2. **`apps/web/src/components/comments/comment-like-button.tsx`** (`'use client'`):

   ```ts
   export function CommentLikeButton(props: {
     postId: string; commentId: string; path: string;
     likeCount?: number; liked?: boolean; loggedIn: boolean;
   })
   ```

   - **Guest** (`!loggedIn`): a `Link` to `loginHref(path)`, `aria-label` ``Masuk untuk menyukai · ${count} suka``. The count is `likeCount ?? 0`.
   - **Signed in, `likeCount === undefined`** (feature not live): a button showing a Heart with no count. Click shows the toast "Segera hadir", with no request.
   - **Signed in, live:** a toggle button (`aria-pressed`).
     - Optimistic: flip `liked` and adjust the count by ±1 immediately.
     - Call `setCommentLike`.
     - On success, set state from the server's `{ liked, likeCount }`.
     - On `null`, roll back to the state before the tap and toast "Gagal menyukai komentar. Coba lagi."
     - Disabled while pending, so no double taps.
   - **Styling:** the liked heart uses `fill-current text-brand` (the same as `LikeButton`). Tap target at least 44px (`min-h-11 min-w-11`). `aria-label` is ``Suka komentar · ${count}`` or ``Batal suka komentar · ${count}``.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/comment-likes.ts` | `setCommentLike` |
| CREATE | `apps/web/src/lib/api/comment-likes.test.ts` | Client tests |
| CREATE | `apps/web/src/components/comments/comment-like-button.tsx` | Heart button |
| CREATE | `apps/web/src/components/comments/comment-like-button.test.tsx` | Component tests (`{ wrapper: Toaster }`) |

**Testing:**

- `setCommentLike`: POST/DELETE method and URL; returns the parsed body; returns `null` on 404/500, on a network error and on a malformed body.
- Guest: a login link with `returnTo`, no request.
- Not live (no `likeCount`): click shows "Segera hadir", no fetch.
- Live: tap increments immediately (before the response resolves), and the final state matches the server's reply.
- Live, liked: tap un-likes (DELETE) and decrements.
- Failure: the state rolls back to the pre-tap values and the failure toast shows.
- The button is disabled while the request is pending (a second click makes no second request).

---

### TASK-112: Thread rendering in PostComments (items, replies, labels)

**What to build**

1. **`apps/web/src/components/comments/comment-item.tsx`** (`'use client'`):

   ```ts
   export function CommentItem(props: {
     comment: PostComment | PostReply;
     postId: string; path: string; loggedIn: boolean;
     canReply: boolean;                 // initial.canComment || !loggedIn
     pending: boolean;                  // disables Hapus while a request runs
     onDelete: (id: string) => void;    // opens the existing confirm sheet
     reply?: boolean;                   // true for a reply: no pinned label
   })
   ```

   - Render per the rules in "Rendering rules" above.
   - **Avatar:** 32px circle. `avatarUrl` gives an `<img alt="">` (with the same `eslint-disable-next-line @next/next/no-img-element` comment as PostCard). Otherwise an `initials(displayName)` circle (`bg-accent text-accent-foreground`, `aria-hidden`).
   - **Time:** `formatRelativeTime(createdAt, new Date())`, in a `<time dateTime={createdAt}>`.
   - **Actions row:** `CommentLikeButton`, then Balas, then the existing `Hapus` button (`canDelete`; its label, aria-label and `onClick` stay as today).
   - **Balas:**
     - guest: `Link` to `loginHref(path)`
     - signed in: button that toasts "Segera hadir"
     - hidden when `!canReply`
   - **Deleted:** per the rules above.

2. **`apps/web/src/components/comments/comment-thread.tsx`**: renders one top-level comment and its replies.

   ```ts
   export function CommentThread(props: {...same as CommentItem minus reply})
   ```

   - Renders a `CommentItem` for the comment.
   - If `count = comment.replyCount ?? comment.replies?.length ?? 0` is greater than 0:
     - a toggle button "Lihat {count} balasan" / "Sembunyikan balasan" (`aria-expanded`, `aria-controls`)
     - expanded: a `<ul>` of `CommentItem reply` rows, indented with `ml-10`
   - `deleted` with no replies renders nothing.

3. **`post-comments.tsx`**: replace the inline `<li>` markup in the list with `CommentThread`.
   - Keep everything else exactly as is (composer, inline errors, load more, delete confirm, counts, `variant`).
   - The list container stays a `<ul className="flex flex-col gap-4">`, with each thread in an `<li>`.
   - Drop the `POST_DATE` import if no longer used.
   - A pinned comment renders where the server puts it (first). The client never reorders.

4. **Deleting a comment that has replies.** Today the `remove` handler filters the item out of the list. With replies in the contract, a deleted parent must become a placeholder instead.
   - In `remove(id)`: if the removed item is a top-level comment with a non-empty `replies` (or `replyCount > 0`), replace it with `{ ...c, deleted: true, body: '', author: { displayName: '' }, pinned: false, canDelete: false }`.
   - Otherwise filter it out as today. For a reply, remove it from its parent's `replies` and decrement `replyCount`.
   - `onCountChange(-1)` is unchanged.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/comments/comment-item.tsx` | One comment or reply row |
| CREATE | `apps/web/src/components/comments/comment-thread.tsx` | Comment + collapsible replies |
| CREATE | `apps/web/src/components/comments/comment-thread.test.tsx` | Fixture tests for every state |
| MODIFY | `apps/web/src/components/comments/post-comments.tsx` | Use `CommentThread`; delete → placeholder |
| MODIFY | `apps/web/src/components/comments/post-comments.test.tsx` | Keep the existing cases passing; add the cases below |

**Testing** (Vitest + Testing Library, `{ wrapper: Toaster }`; fixtures use real-looking text):

- **Today's API shape** (no new fields): renders name, time, text and Hapus as before, with a heart without a count and a Balas button, and no "Lihat balasan", "Diedit" or pinned label.
- **Avatar:** initials shown when there is no `avatarUrl`, an `<img>` when there is.
- **Pinned:** "Disematkan oleh creator" is shown on a top-level pinned comment only.
- **Edited:** `editedAt` set shows "Diedit"; `null` does not.
- **Replies:**
  - collapsed by default, with "Lihat 2 balasan"
  - click shows both replies, indented, and the toggle reads "Sembunyikan balasan"
  - `aria-expanded` is correct
  - replies have no pinned label
- **Deleted parent with replies:** shows "Komentar dihapus" and its replies. Its body text and author name are **not** in the DOM, and it has no avatar, like button or Balas.
- **Deleted parent without replies:** renders nothing.
- **Like states:** liked heart is `aria-pressed=true`; the count shown matches `likeCount`.
- **Balas:** guest link to login; signed-in toast "Segera hadir"; hidden when `canComment` is false for a signed-in user.
- **Delete flow** (`post-comments.test.tsx`):
  - deleting a comment with replies turns it into the placeholder, with the replies kept and `onCountChange(-1)`
  - deleting a plain comment removes it
  - deleting a reply removes only that reply and decrements the parent's count
- **Layout guard:** a 60-character unbroken name and body do not add a horizontal scrollbar (assert the `wrap-break-word` / `truncate` classes are present, as jsdom has no layout).
