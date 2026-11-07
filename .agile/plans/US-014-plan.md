# Technical Plan: US-014 — Comments Bottom Sheet

## Architecture Overview

Most of this already exists. `components/media-viewer/viewer-comments.tsx` (`ViewerComments`) is a comments `BottomSheet` that:

- fetches `GET /posts/:id/comments`
- handles the loading, forbidden and failed states
- renders `PostComments variant="sheet"`

`BottomSheet` already pauses video on open (`pauseAllVideos`) and handles the iOS keyboard inset.

US-014 makes it the one shared **CommentsSheet**:

1. Move `ViewerComments` → `components/comments/comments-sheet.tsx` as `CommentsSheet`, with:
   - `size: 'compact' | 'tall'` (compact = `h-[40dvh]` for the viewer, tall = `h-[85dvh]` for cards)
   - a live count in the title
   - a **locked state** that never calls the comments API
2. Move `PostComments` → `components/comments/post-comments.tsx`. It is still used inline by the post detail page and inside the sheet.
3. PostCard's Komentar becomes a button that opens `CommentsSheet size="tall"`, except in `detail` mode, which keeps the `#komentar` anchor.
4. Extract the two demo purchase sheets so the locked state can reuse them:
   - `PostUnlockSheet` from `post-card/post-media.tsx`
   - `SubscribeSheet` from `profile-actions.tsx`

The two decisions agreed with the user (2026-11-07):

- The locked state shows **both** CTAs (Buka and Langganan), as in the design.
- Send errors stay **inline** under the composer, as today (the AC is corrected accordingly).

No API changes. The list order stays whatever the server returns (oldest first today; US-017 switches it to Top).

## Dependencies

- None new. Uses the existing `BottomSheet`, `PurchaseSheet`, `useToast`, `loginHref`, `DEMO_SUBSCRIPTION`, and `postCommentListSchema` from `@influency/shared`.

## Risks

- **Nested Radix dialogs:** PurchaseSheet opens on top of CommentsSheet, and the delete confirmation already does this inside the viewer sheet.
  - Mitigation: a test that opening Buka from the locked sheet shows the purchase sheet.
  - Mitigation: closing the purchase sheet leaves the comments sheet open.
- **Moving files breaks imports and tests:**
  - `posts/[postId]/page.tsx`
  - `page.test.tsx`
  - `post-comments.test.tsx`
  - `viewer-comments.test.tsx`
  - `media-viewer.tsx`

  Mitigation: use `git mv` for the files and tests, then grep `post-comments` and `viewer-comments` until nothing is left.
- **Count drift:** the header count starts from `post.commentCount` (server, excludes deleted) and is adjusted locally on create/delete. It is not re-fetched, which is acceptable for a sheet.

## Tasks

### TASK-108: Shared CommentsSheet with locked state

**What to build**

1. **Move files** with `git mv`:
   - `app/(public)/[creatorSlug]/posts/[postId]/post-comments.tsx` → `components/comments/post-comments.tsx`, with its test
   - `components/media-viewer/viewer-comments.tsx` → `components/comments/comments-sheet.tsx`, with its test

   `post-comments.tsx` imports `POST_DATE` from `../../premium-cover`, which becomes `@/app/(public)/[creatorSlug]/premium-cover` (keep the import; don't duplicate the formatter).

2. **`PostComments`**: add one optional prop, `onCountChange?: (delta: 1 | -1) => void`.
   - Call `+1` after a successful POST, whether or not the comment is appended.
   - Call `-1` after a successful DELETE (also on 404, which already removes the item).
   - Nothing else changes: inline errors, draft kept on failure, the 500 counter, "Masuk untuk berkomentar".

3. **Extract the purchase sheets** into `components/purchase-sheet.tsx`, next to `PurchaseSheet`. Keep the same props and copy as today:
   - `PostUnlockSheet({ post, creatorName, trigger, children? })`
     - wraps `PurchaseSheet` with kicker ``Post premium · ${creatorName}``, title `post.caption || 'Tanpa caption'`, rows `[['Masa akses', 'Permanen']]`, `priceCoins = post.offer?.priceCoins ?? 0`, and cta ``Buka dengan ${price} Koin``
     - `post` is typed as `Pick<PostCardPost, 'caption' | 'offer'>` (import the type from `post-card/post-card`)
     - `post-media.tsx` `LockedMedia` uses it (with its existing "Lihat detail post" child)
   - `SubscribeSheet({ creatorName, trigger })`
     - wraps `PurchaseSheet` with `DEMO_SUBSCRIPTION`, kicker "Langganan kreator", rows Masa aktif / Perpanjangan Manual, and cta ``Langganan dengan ${priceCoins} Koin``
     - `profile-actions.tsx` uses it

4. **`CommentsSheet`** (`components/comments/comments-sheet.tsx`):

   ```ts
   export function CommentsSheet(props: {
     post: PostCardPost;
     creator: PostCardCreator;
     open: boolean;
     onOpenChange: (open: boolean) => void;
     size: 'compact' | 'tall';           // compact: h-[40dvh]; tall: h-[85dvh]
     count: number;                      // shown in the title
     onCountChange?: (delta: 1 | -1) => void;
   })
   ```

   - **Locked** = `post.access === 'locked'`. The parent only renders it for posts the viewer can't access (owner and admin get `full`). When locked:
     - the effect returns early, so **no fetch**
     - title "Komentar" with no count
     - body: heading "Komentar khusus pendukung", then "Hanya yang punya akses ke post premium ini yang bisa membaca dan ikut berkomentar."
     - CTAs: a filled Button `Buka post · {price} Koin`, then an outline Button `Langganan · {DEMO_SUBSCRIPTION.priceCoins} Koin / {days} hari`
     - footnote (muted, xs): "Komentar, nama, dan avatar tidak dimuat sampai kamu punya akses."
     - **Guest** (`post.viewer === null`): both CTAs are `Link`s to `loginHref('/{slug}/posts/{id}')`
     - **Signed in**: the CTAs are the triggers of `PostUnlockSheet` and `SubscribeSheet`
   - **Not locked**: today's loading / forbidden / failed / ready logic, unchanged.
     - title ``Komentar · ${count}``
     - pass `onCountChange` to `PostComments variant="sheet"`
     - keep "forbidden" (403) as a fallback message, e.g. when access changes server-side
   - `className` = the size class. `BottomSheet` keeps handling the drag handle, swipe-down, keyboard inset and video pause.

5. **`media-viewer.tsx`**: replace `ViewerComments` with `CommentsSheet size="compact" count={post.commentCount}`. The viewer only opens for accessible media, so the locked branch is never hit there.

**Files:**

| Action | File Path | Purpose |
|--------|-----------|---------|
| MOVE+MODIFY | `apps/web/src/components/comments/post-comments.tsx` (from `app/(public)/[creatorSlug]/posts/[postId]/`) | `onCountChange` |
| MOVE | `apps/web/src/components/comments/post-comments.test.tsx` | Fix imports |
| MOVE+MODIFY | `apps/web/src/components/comments/comments-sheet.tsx` (from `media-viewer/viewer-comments.tsx`) | `CommentsSheet`: size, count, locked state |
| MOVE+MODIFY | `apps/web/src/components/comments/comments-sheet.test.tsx` | Existing cases + locked cases |
| MODIFY | `apps/web/src/components/purchase-sheet.tsx` | Add `PostUnlockSheet`, `SubscribeSheet` |
| MODIFY | `apps/web/src/components/post-card/post-media.tsx` | Use `PostUnlockSheet` |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/profile-actions.tsx` | Use `SubscribeSheet` |
| MODIFY | `apps/web/src/components/media-viewer/media-viewer.tsx` | Use `CommentsSheet size="compact"` |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.tsx` (+ `page.test.tsx`) | New `PostComments` import path |

**Testing** (Vitest + Testing Library, `{ wrapper: Toaster }`, mock `fetch`):

- Locked, signed in: no `fetch` is called. The heading, both CTA labels and the footnote are shown, and no comment text or names appear.
  - Clicking "Buka post · 8 Koin" opens the purchase sheet ("Buka dengan 8 Koin").
  - Clicking Langganan opens the subscribe sheet.
- Locked, guest: both CTAs are links to `/login?returnTo=%2F{slug}%2Fposts%2F{id}`, and there is no fetch.
- Not locked: the existing loading / forbidden / failed + retry / ready cases still pass. The title shows `Komentar · 3`.
- `PostComments`: `onCountChange(1)` after a successful post, `(-1)` after a delete, and not called on a failed post. The draft is kept on failure (existing).
- `PostUnlockSheet` / `SubscribeSheet`: the existing post-card and profile-actions tests still pass unchanged (same labels).

---

### TASK-109: PostCard opens the comments sheet

**What to build**

1. **`components/post-card/post-card.tsx`:**
   - Keep `const [commentCount, setCommentCount] = useState(post.commentCount)` and `const [commentsOpen, setCommentsOpen] = useState(false)`.
   - `detail` mode: keep the existing `<Link href="#komentar">` (the page has the inline section), showing `commentCount`.
   - Otherwise: a `<button type="button">` with the same classes and `aria-label={`Komentar, ${commentCount}`}`, `aria-haspopup="dialog"` and `onClick={() => setCommentsOpen(true)}`, plus:

     ```tsx
     <CommentsSheet post={post} creator={creator} open={commentsOpen} onOpenChange={setCommentsOpen}
       size="tall" count={commentCount} onCountChange={(d) => setCommentCount((n) => n + d)} />
     ```

   - Guests also get the button: free comments are readable by guests (US-007 allows opening posts). On locked posts the sheet shows the locked state with login CTAs.
   - Only mount `CommentsSheet` once it has been opened (`{opened && <CommentsSheet …/>}`, with `opened` set on first open), so a feed of 30 cards doesn't mount 30 dialogs.
2. **Grid tiles** are unchanged: they open the viewer or the detail page, not comments.
3. Remove the now-unused `${postHref}#komentar` path. `scroll-to-comments.tsx` stays for the detail page's own `#komentar` and direct links.

**Files:**

| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/components/post-card/post-card.tsx` | Komentar opens `CommentsSheet` (tall); live count |
| MODIFY | `apps/web/src/components/post-card/post-card.test.tsx` | Update the Komentar link expectations; new sheet cases |

**Testing:**

- Feed card (free post, signed in): clicking Komentar opens a dialog titled "Komentar · n" without navigating (no link with `#komentar`). Comments from mocked `fetch` are rendered, and closing the dialog leaves the card in place.
- Feed card (locked premium): clicking Komentar shows the locked state, with `fetch` never called for `/comments`.
- Guest on a free post: the sheet lists comments and shows "Masuk untuk berkomentar".
- `detail` mode: Komentar is still a link to `#komentar`, and no dialog opens.
- Posting in the sheet bumps the card's count by 1.
- The existing video tests still pass: the `BottomSheet` open path calls `pauseAllVideos` (already covered in `bottom-sheet` tests; no new test needed).
