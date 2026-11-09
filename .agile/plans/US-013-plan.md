# Technical Plan: US-013 — Full-screen Media Viewer

## Architecture Overview

Agreed with the user (2026-11-07). **Web only** — no API, shared-schema or DB change. Depends on US-012 (TASK-099 `PostCardPost`, TASK-101 `PostComments` `variant`).

- **`MediaViewer`** (`components/media-viewer/`): a Radix `Dialog` (so focus trap, Escape, `aria-modal`, scroll lock come from Radix, as with `BottomSheet`), full-screen dark, with a centred 9:16 frame (`aspect-9/16`, `h-dvh max-w-full`, `mx-auto`).
- **Swipe between media:** the same native `overflow-x-auto snap-x snap-mandatory` track as the PostCard carousel. Touch and trackpad swipe come free, no dependency. "Drag" with a mouse is not supported beyond the arrow keys and the scrollbar-less track (`shortcut:` comment — add pointer drag only if a desktop request comes). Arrow Left/Right keys scroll one slide.
- **Swipe down to close:** pointer handlers on the frame (not on videos or buttons): vertical drag > `SWIPE_CLOSE_PX` or faster than `SWIPE_CLOSE_VELOCITY` (both exported from `bottom-sheet.tsx`) with `|dy| > |dx|` closes. The frame follows the finger with `translateY` (off under `motion-reduce`).
- **Media URLs:** the viewer calls `useMediaAccess(post.id, open)` itself, which refreshes before expiry, and renders items with `MediaItemView` (`nativeControls` for videos = sound/seek controls; the premium watermark is part of `MediaItemView`). It calls `pauseAllVideos()` on open (spec §6.3).
- **Entry points:** an accessible image in a PostCard opens it at that slide; an accessible video gets a separate "Layar penuh" button (tapping a video keeps toggling play, US-009); an accessible Grid tile opens it at item 0. **Locked premium media never opens it** — locked cards and tiles keep their current behaviour (detail page / Buka).
- **Action row:** Suka · Komentar · Bagikan · Kirim Tip (always shown, per the user). Suka/Bagikan behave as on the PostCard; Kirim Tip toasts "Segera hadir".
- **Komentar** opens a `BottomSheet` of about 40% height inside the viewer, with the existing comment list and form (`PostComments variant="sheet"`), loaded on open from `GET /api/v1/posts/:id/comments`. The comments feature replaces this later.
- **Like state stays in sync** between the card and the viewer: `PostCard` owns `{ liked, count }`, and both `LikeButton`s get it via props plus `onChange`; the card's button is re-keyed on change so it picks up the viewer's result.
- **Focus and scroll on close:** remember `document.activeElement` on open and refocus it on `onCloseAutoFocus` (the `BottomSheet` pattern; the viewer has no `Dialog.Trigger`). Radix's scroll lock keeps the page's scroll position; verify in UAT.

## Dependencies

- None new (`radix-ui`, `lucide-react` already in).

## Risks

- **Nested dialogs:** the comments sheet is rendered as a React child of the viewer's `Dialog.Content`, so Radix treats it as a nested layer (outside-click/Escape close the sheet first). Test Escape order.
- **Swipe conflicts:** horizontal scroll, vertical close and video controls share gestures. Mitigation: the close drag ignores pointers that start on `video`, `button`, `a`, `textarea`, and only starts a close when vertical movement dominates; `touch-action: pan-x` on the track keeps vertical touches for our handler.
- **Rate limit:** each open adds one `media-access` call (60/min placeholder). Acceptable; add a `shortcut:` comment in the viewer (reuse the already-loaded access from the card if 429s show up).
- **Expiry while open:** `useMediaAccess` replaces the items' URLs; `PostVideo` already reattaches at the same position. Test that images/videos survive a refresh.
- **iOS `100dvh`/safe areas:** use `h-dvh` and `env(safe-area-inset-*)` padding; verify on a device in UAT.

## Tasks

### TASK-103: Shared like state and component class hooks

Prepare reusable controls for a dark surface and for two instances of the same post.

1. `components/like-button.tsx`: new optional props `onChange?: (next: { liked: boolean; count: number }) => void` (called after a successful toggle) and `className?: string` (applied to the `Button`/logged-out `Link`/read-only `p`, merged with `cn`).
2. `components/post-card/post-card.tsx`: hold `const [like, setLike] = useState({ liked: post.viewer?.liked ?? false, count: post.likeCount })`. The card's `LikeButton` gets `likeCount={like.count}`, `viewer={post.viewer && { ...post.viewer, liked: like.liked }}`, `onChange={setLike}` and `key={`${like.liked}:${like.count}`}` (remount to resync).
3. `app/(public)/[creatorSlug]/share-button.tsx`: new optional `className?: string` that replaces `SHARE_BUTTON_CLASS` when given (the viewer uses a borderless white icon).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/components/like-button.tsx` | `onChange`, `className` |
| MODIFY | `apps/web/src/components/post-card/post-card.tsx` | lifted like state |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/share-button.tsx` | `className` |
| MODIFY | `apps/web/src/components/like-button.test.tsx` (create if missing) | callback test |

**Testing:**
- `onChange` fires with `{ liked: true, count: n+1 }` after a successful PUT; not on failure.
- `className` reaches the rendered control in all three states (logged out, cannot like, can like).
- Card: after `setLike` from outside (re-render with new props) the displayed count updates.

---

### TASK-104: `MediaViewer` shell, slides, gestures

Create `components/media-viewer/media-viewer.tsx` (`'use client'`).

```ts
export type MediaViewerProps = {
  post: PostCardPost;          // access === 'full' only; callers never open it for locked posts
  creator: PostCardCreator;
  startIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  like: { liked: boolean; count: number };           // from PostCard
  onLikeChange: (next: { liked: boolean; count: number }) => void;
};
```

1. Structure: `Dialog.Root open onOpenChange` › `Dialog.Portal` › `Dialog.Content` (`fixed inset-0 z-50 flex items-center justify-center bg-black text-white focus:outline-none`, `data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none`).
   - `Dialog.Title` (sr-only): `Media ${creator.displayName}, layar penuh`; `Dialog.Description` (sr-only): `Geser untuk melihat media lain. Tekan Escape untuk menutup.`
   - Close: `Dialog.Close asChild` › `<button aria-label="Tutup layar penuh" className="absolute top-3 left-3 z-20 flex size-11 …">` with the `X` icon (top inset `calc(0.75rem + env(safe-area-inset-top))`).
   - Counter: `<span aria-live="polite">{index + 1}/{total}</span>` (`absolute top-3 right-3`), shown for `total > 1`.
2. Data: `const { state, retry } = useMediaAccess(post.id, open)`. Not ready → centred message (`Memuat media…` / `Gagal memuat media.` + `Coba lagi` button / `Media tidak tersedia.` / locked → `Konten ini terkunci.`). Ready → track of `media.map` slides (`relative size-full shrink-0 snap-center`) each with `<MediaItemView item watermark active={i === index} nativeControls className="size-full object-contain" />`; the frame is `relative aspect-9/16 h-dvh max-w-full bg-black` with `[scrollbar-width:none] touch-pan-x`.
3. Initial position: `useLayoutEffect` once media is ready sets `track.scrollLeft = startIndex * track.clientWidth` (clamped); `onScroll` updates `index` (same maths as `AccessibleMedia`). Arrow keys: `onKeyDown` on the track scrolls by `clientWidth` (`behavior: 'auto'` under `prefers-reduced-motion`, else `smooth`).
4. Swipe down: `onPointerDown/Move/Up/Cancel` on the frame, ignoring targets inside `video, button, a, textarea, input`; `dragY` state drives `style.transform` (disabled when `matchMedia('(prefers-reduced-motion: reduce)').matches`); close per the thresholds above using `SWIPE_CLOSE_PX`/`SWIPE_CLOSE_VELOCITY`.
5. Opening: `useEffect(() => { if (open) pauseAllVideos(); }, [open])`. Focus: store `document.activeElement` in a ref on `onOpenAutoFocus`, and in `onCloseAutoFocus` `e.preventDefault(); ref.current?.focus?.()`.
6. Mounting: callers render `<MediaViewer>` only when opened (conditional mount), so a closed viewer costs nothing and `useMediaAccess` is not called until open.
7. Add the comment: `// shortcut: opening refetches media-access (one extra call per open); reuse the card's loaded access if 429s show up.`
8. Render `<ViewerActions … />` (TASK-105) as the last child of the frame (bottom overlay, gradient `from-black/70`).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/media-viewer/media-viewer.tsx` | the dialog, slides, gestures |
| CREATE | `apps/web/src/components/media-viewer/media-viewer.test.tsx` | tests |

**Testing:**
- Opens with role `dialog` named "Media <nama>, layar penuh"; X button "Tutup layar penuh" is 44 px (`size-11`) and closes; Escape closes; focus returns to the opener and `onOpenChange(false)` fires.
- Shows `1/3` at `startIndex 0`, `3/3` when started at 2 (set `scrollLeft`/`clientWidth` mocks), updates on scroll; no counter for a single item.
- Swipe down past the threshold closes; a short drag, a horizontal drag, and a drag that starts on a video do not.
- Videos render with native controls (`controls` attribute); the watermark text appears for premium media (`data-testid="watermark"`).
- Failure → "Coba lagi" refetches; `locked`/`missing` messages.
- URL refresh: re-render with a new `expiresAt`/URL keeps the same slide index.
- `pauseAllVideos` called on open (mock `lib/video-playback`).
- Reduced motion: `matchMedia` mocked to match → no transform style while dragging.
- Focus is trapped (Tab from the last control returns to the first).

---

### TASK-105: Viewer action row

Create `components/media-viewer/viewer-actions.tsx`: `ViewerActions({ post, creator, like, onLikeChange, onOpenComments })`.

- `<div role="toolbar" aria-label="Aksi post" className="flex items-center justify-around …">` with four 44 px controls on white-on-dark styling (`text-white hover:bg-white/15`):
  1. **Suka** — `<LikeButton postId={post.id} path={postHref} likeCount={like.count} viewer={post.viewer && { …post.viewer, liked: like.liked }} onChange={onLikeChange} className="text-white …" />` (guest → login link, as on the card).
  2. **Komentar** — `<button aria-label={`Komentar, ${post.commentCount}`}>` with `MessageCircle` and the count; click → `onOpenComments()`. Works for guests too (the sheet shows "Masuk untuk berkomentar").
  3. **Bagikan** — guest: `Link` to `loginHref(postHref)` with `aria-label="Bagikan"` (as on the card); signed-in: `<ShareButton title={creator.displayName} url={postHref} label="Bagikan post" className=… />`.
  4. **Kirim Tip** — `<button>` with `Coins` and text "Kirim Tip" → `useToast()('Segera hadir')`. Always shown (decision), for guests as well.
- `postHref = /${creator.slug}/posts/${post.id}`.
- Toast stays above the viewer: the toaster must render above `z-50`; verify the toast viewport z-index (`components/ui/toast.tsx`) is above 50 and raise it if not.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/media-viewer/viewer-actions.tsx` | the four actions |
| CREATE | `apps/web/src/components/media-viewer/viewer-actions.test.tsx` | tests |
| MODIFY | `apps/web/src/components/ui/toast.tsx` | viewport z-index above the viewer if needed |

**Testing:**
- Signed-in: all four labelled controls render; Suka toggles (fetch PUT mocked) and calls `onLikeChange`; Bagikan copies the link (clipboard mock) and toasts "Tautan disalin"; Kirim Tip toasts "Segera hadir"; Komentar calls `onOpenComments`.
- Guest: Suka and Bagikan are links to `/login?returnTo=/slug/posts/id`; Komentar and Kirim Tip still work.
- Every control is at least 44 px (`min-h-11`/`size-11` classes).

---

### TASK-106: Comments sheet in the viewer

Create `components/media-viewer/viewer-comments.tsx` and extend `BottomSheet`.

1. `components/ui/bottom-sheet.tsx`: new optional `className?: string` merged into `Dialog.Content`'s `cn(...)` (existing classes unchanged). The viewer passes `h-[40dvh]` (with the sheet's `maxHeight` still applied).
2. `ViewerComments({ post, creator, open, onOpenChange })`:
   - `<BottomSheet title="Komentar" open onOpenChange className="h-[40dvh]">`.
   - On open, fetch `GET /${API_PREFIX}/posts/${post.id}/comments` (credentials same-origin), parse with `postCommentListSchema`.
     - 200 → render `<PostComments postId path={postHref} initial={list} loggedIn={post.viewer !== null} variant="sheet" />`.
     - 403 → `Buka post ini untuk melihat dan menulis komentar.`
     - other/network → `Gagal memuat komentar.` + `Coba lagi` button.
     - loading → `Memuat komentar…`.
   - The fetch lives in a `useEffect` keyed on `open`/`post.id` with an abort/`live` flag.
3. `PostComments` `variant="sheet"` (added in TASK-101): composer inline under the list, no `fixed`, no list bottom padding.
4. Rendered inside the viewer's `Dialog.Content` so Radix nests the layers; the sheet's z-index equals the viewer's (`z-50`) and it mounts later, so it stacks on top.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/media-viewer/viewer-comments.tsx` | lazy comments sheet |
| CREATE | `apps/web/src/components/media-viewer/viewer-comments.test.tsx` | tests |
| MODIFY | `apps/web/src/components/ui/bottom-sheet.tsx` | `className` prop |
| MODIFY | `apps/web/src/components/ui/bottom-sheet.test.tsx` | className test |

**Testing:**
- Fetches on open only; shows the list and the form; posting adds a comment (POST mocked).
- 403 → note, no list; 500 → error + `Coba lagi` refetches; empty → "Belum ada komentar."
- Guest → "Masuk untuk berkomentar" link with `returnTo` the post path.
- Escape closes the sheet first and leaves the viewer open; a second Escape closes the viewer.
- Sheet content has the `h-[40dvh]` class; BottomSheet without `className` is unchanged.

---

### TASK-107: Wire the viewer into PostCard and the Grid

1. `components/post-card/post-media.tsx`, `AccessibleMedia`: keep `viewer` state `{ index } | null`; rendering `<MediaViewer>` only when set (needs `post`, `creator`, `like`, `onLikeChange` — pass these through `PostMedia` from `PostCard`).
   - **Image slide:** wrap the `<img>` area in a full-slide `<button type="button" aria-label="Buka layar penuh" className="absolute inset-0 …">` (text-less, `focus-visible:ring-2`) → `setViewer({ index: i })`. Do not intercept right-click blocking in `MediaItemView`.
   - **Video slide:** add a separate button `aria-label="Layar penuh"` (44 px, `absolute top-14 right-3 z-10`, `Maximize2` icon, `bg-black/60 text-white`) that calls `setViewer({ index: i })` and `pauseAllVideos()`. Tapping the video itself still toggles play (US-009). Check `PostVideo` overlay positions (mute, duration) so the new button does not overlap them.
   - Locked media (`LockedMedia`) is not touched: it never opens the viewer.
   - `detail` mode (US-012) behaves the same.
2. `components/post-grid/grid-tile.tsx`: for **accessible** posts render a `<button type="button" aria-label={label} onClick={() => setOpen(true)}>` (same classes as the old `Link`) plus `{open && <MediaViewer … startIndex={0} />}`; **locked** posts keep the `Link` to the post detail. Props change to `GridTile({ post, href, creator })`; the viewer's like state is local to the tile (`useState` from `post`).
3. `components/post-grid/post-grid.tsx`: props `{ posts, creator }` (`creator: PostCardCreator`) instead of `creatorSlug`; derive `href` from `creator.slug`. Update `creator-content.tsx` to pass `creator`.
4. `.agile/guidelines/frontend.md`: replace the "the full-screen viewer (US-013) must do the same" sentence with the fact that `MediaViewer` calls `pauseAllVideos()`; add a line on entry points. (Dev updates the codebase map on completion.)

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/components/post-card/post-media.tsx` | open triggers, viewer mount |
| MODIFY | `apps/web/src/components/post-card/post-card.tsx` | pass `creator`, `like`, `setLike` to `PostMedia` |
| MODIFY | `apps/web/src/components/post-grid/grid-tile.tsx` | button + viewer for accessible tiles |
| MODIFY | `apps/web/src/components/post-grid/post-grid.tsx` | `creator` prop |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/creator-content.tsx` | pass `creator` |
| MODIFY | `apps/web/src/components/post-card/post-card.test.tsx`, `post-grid/post-grid.test.tsx`, creator page tests | updated + new cases |
| MODIFY | `.agile/guidelines/frontend.md` | viewer note |

**Testing:**
- Card: tapping an image slide opens the viewer at that slide (`2/3` when the second slide was tapped); a video slide's "Layar penuh" opens it and the card video stops; tapping the video itself does not open it.
- Locked card/tile: no "Buka layar penuh" / viewer, no media-access call; a locked tile still links to the post detail.
- Grid: an accessible tile is a button that opens the viewer at item 0; closing returns focus to the tile.
- Like toggled in the viewer is reflected on the card after closing (count and pressed state).
- Logged-out HTML contains no premium media URLs (SSR unchanged); no viewer markup is in the initial HTML.
- Manual UAT: scroll position and focus return after closing, Android/iOS swipe feel, video sound controls, 9:16 safe areas.
