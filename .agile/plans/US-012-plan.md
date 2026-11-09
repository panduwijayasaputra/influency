# Technical Plan: US-012 — Post Detail Page

## Architecture Overview

Agreed with the user (2026-11-07). **Web only** — no API, shared-schema or DB change.

Most of the page exists from the old US-014 (`/{creatorSlug}/posts/{postId}`: `PostDetail`, `CommentsSection`, `PostComments`, `UnlockCta`, not-found, status notice, guest header rule). What changes:

- **The post renders as a full `PostCard`** (US-008) in a `detail` mode instead of the bespoke layout. This gives the author header, the 4:5 media carousel, the locked preview with the **Buka** action (`PurchaseSheet` for signed-in users, login link for guests), the action row and the Laporkan menu for free. The custom `LikeButton`/`ReportPostButton`/`UnlockCta`/`mediaSummary` blocks in the page are removed.
- **`detail` mode of PostCard:** caption fully expanded (no clamp, no link), Komentar becomes an in-page anchor to `#komentar`, no "Lihat detail post" link in the Buka sheet (we are already there), login return path is the post page.
- **Sticky comment composer:** `position: fixed` bar (not `sticky`: a sticky bar at the end of a long page is not visible at the top of the page), centred in `max-w-feed`. Its bottom offset is `--bottom-nav-height` for a signed-in user (the nav is there), `0` for a guest, or the keyboard height while the textarea is focused (`useKeyboardInset`, iOS; Android resizes the layout viewport itself). The comment list gets bottom padding so the last comment is not covered.
- **Opening Komentar from a PostCard** is the existing `${postHref}#komentar` link. Because the comments stream in `Suspense`, the browser's hash scroll can run before the section exists, so a tiny client effect scrolls to `#komentar` once the comments mount.
- Premium rules are unchanged and enforced by the API: comments of a locked post are `forbidden`/private and the page shows the existing note; no names, avatars or text.

Decisions: composer sits **above the bottom nav** (nav stays); the page does not become a standalone route.

## Dependencies

- None new. Reuses `PostCard`, `ExpandableText`, `PurchaseSheet`, `useKeyboardInset`, `--bottom-nav-height`.

## Risks

- **`PublicPostDetail.publishedAt` can be `null`** (never-published post seen by its owner/admin) while `PublicPost.publishedAt` is a string. `PostCard` must accept both and hide the relative time for `null`.
- **Fixed composer vs. toast/bottom nav:** the toast is already offset by `--bottom-nav-height`; it may overlap the composer briefly. Acceptable.
- **iOS keyboard:** the composer offset relies on `visualViewport`; verify manually in UAT (jsdom cannot).
- **Hash scroll after streaming:** the effect only handles `location.hash === '#komentar'`; other hashes are untouched.

## Tasks

### TASK-099: PostCard `detail` mode

Make `PostCard` usable as the post page's main card.

1. `components/post-card/post-card.tsx`
   - Export `type PostCardPost = Omit<PublicPost, 'publishedAt'> & { publishedAt: string | null }` and accept it for `post` (so `PublicPost` and `PublicPostDetail` both fit).
   - New optional prop `detail?: boolean`.
   - `const returnPath = detail ? postHref : path;` and use it for `loginHref(...)` and the `LikeButton` `path` (the feed keeps returning to the creator page).
   - Header time: render `<time>` only when `post.publishedAt` is not null.
   - Komentar: when `detail`, render `<a href="#komentar">` (plain anchor, same classes and `aria-label`) instead of `Link` to `${postHref}#komentar`.
   - Caption: when `detail`, `<ExpandableText text={post.caption} expanded />` (no `href`); otherwise unchanged. When `detail` and no caption, render `<p className="px-4 text-sm text-muted-foreground">Tanpa caption</p>`.
   - Pass `detail` to `PostMedia`.
2. `components/expandable-text.tsx`: new optional prop `expanded?: boolean` (a forced-open mode: no clamp, no Selengkapnya/Sembunyikan button, text rendered as a plain paragraph).
3. `components/post-card/post-media.tsx`: `PostMedia`/`LockedMedia` take `detail?: boolean`; in `LockedMedia` the "Lihat detail post" `Button asChild` child of `PurchaseSheet` is omitted when `detail`. Accept `PostCardPost` where it takes `PublicPost` (`mediaSummary` only reads counts, so widen its parameter to `Pick<PublicPost, 'imageCount' | 'videoCount'>`).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/components/post-card/post-card.tsx` | `detail` prop, `PostCardPost`, anchor to comments, expanded caption |
| MODIFY | `apps/web/src/components/post-card/post-media.tsx` | `detail` prop, widen `mediaSummary` param |
| MODIFY | `apps/web/src/components/expandable-text.tsx` | `expanded` mode |
| MODIFY | `apps/web/src/components/post-card/post-card.test.tsx` | detail-mode tests |

**Testing:**
- `detail`: long caption fully shown with no "Selengkapnya" button and no link; empty caption shows "Tanpa caption".
- `detail`: Komentar is an `a[href="#komentar"]`; in the feed it is still `…/posts/{id}#komentar`.
- `detail`: guest login links return to the post path (`returnTo=/slug/posts/id`); feed guest links still return to `/slug`.
- `detail` + locked + signed-in: Buka opens the sheet without "Lihat detail post"; locked + guest: Buka links to login. No media-access call for a locked post.
- `publishedAt: null` renders no `<time>` and no crash.

---

### TASK-100: Post page uses PostCard

Rewrite `PostDetail` in `app/(public)/[creatorSlug]/posts/[postId]/page.tsx`.

1. `PostDetail({ slug, postId })` fetches `getPublicPost(slug, postId)` (404 → `notFound()`, unchanged) and the creator (`getPublicCreator(slug)`, cached) for `{ slug, displayName, avatarUrl }`. Pass the creator in from `PostPage` as a prop (it already has it) instead of re-fetching.
2. Render:
   - the status notice (`POST_STATUS_LABELS[post.status] · tidak terlihat publik`) when `status !== 'PUBLISHED'` (kept as is, owners/admins only because the API returns hidden posts only to them);
   - `<PostCard post={post} creator={creator} detail />` (full-bleed: the `main` keeps `max-w-feed`, drop the horizontal padding for the card by using `-mx-4` or removing `px-4` from `main` and padding the notice and comments section instead);
   - the Komentar section, unchanged condition (`post.status === 'PUBLISHED'`), `id="komentar"`, `scroll-mt-16`.
3. Delete `mediaSummary`, `UnlockCta`, and the page-level `LikeButton`, `ReportPostButton`, `PostMediaViewer`, `PremiumCover`, `Lock`/`LockOpen` usage. If `PostMediaViewer`/`MediaItemView` stay used by the studio and `PostMedia`, keep those components.
4. Header and guest rules unchanged: `IfSignedIn` → `PageHeader title="Postingan" fallbackHref`. Guests get no header and no nav.
5. `generateMetadata`, `instant = false`, `not-found.tsx` unchanged. `PostNotFound` still shows "Postingan tidak ditemukan" for unknown/hidden/removed posts.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.tsx` | render `PostCard detail`, remove bespoke blocks |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.test.tsx` | update expectations |

**Testing:**
- Free post: card with author, caption expanded, media container, Komentar section after it.
- Locked premium (guest): blurred preview, "n Koin" in the Buka button, Buka links to `/login?returnTo=…`; page HTML/props contain no media URLs.
- Locked premium (signed in): Buka opens the sheet; "akses permanen" row present.
- Non-published post (owner/admin response): status notice shown; no comments section.
- Unknown/hidden post (`getPublicPost` → null): `notFound()` is thrown (existing behaviour kept).
- Signed-in has "Postingan" header with back; guest has neither (existing tests stay green).

---

### TASK-101: Sticky comment composer and scroll to comments

Change `app/(public)/[creatorSlug]/posts/[postId]/post-comments.tsx` and `CommentsSection`.

1. Add a prop `variant?: 'page' | 'sheet'` (default `'page'`; `'sheet'` is used by US-013's viewer sheet and renders the composer inline at the bottom of the component instead of fixed).
2. Composer (page variant): wrap the existing `<form>` (and the guest "Masuk untuk berkomentar" link) in a `fixed inset-x-0 z-30 mx-auto w-full max-w-feed border-t bg-card px-4 py-2` container.
   - Bottom offset via inline style: `bottom: focused && inset > 0 ? inset : loggedIn ? 'var(--bottom-nav-height)' : 0`, with `const inset = useKeyboardInset(focused)` and `focused` set by the textarea's `onFocus`/`onBlur`.
   - Keep: plain text, `maxLength={POST_COMMENT_MAX_LENGTH}`, `{body.length}/{POST_COMMENT_MAX_LENGTH}` counter, Kirim disabled when empty/pending, `sentNote`, error `role="alert"`, 44 px targets. The `Label` stays visible as `sr-only` to save height; textarea `rows={1}` with `max-h-28`.
   - The guest link keeps `loginHref(path)` and the text "Masuk untuk berkomentar".
   - When `initial.canComment` is false and the user is logged in (locked/closed), render no bar.
3. The list container gets bottom padding `pb-40` (page variant) so the last comment and the load-more button clear the bar and the nav.
4. New tiny client component `ScrollToComments` (`'use client'`, in the same folder) rendered by `CommentsSection` next to `PostComments`: `useEffect(() => { if (location.hash === '#komentar') document.getElementById('komentar')?.scrollIntoView({ block: 'start' }); }, [])` (use `behavior: 'auto'`; respects reduced motion by not animating).
5. Existing behaviour is unchanged: delete confirm sheet, pagination, rate-limit message, plain-text rendering, `forbidden` note for locked posts.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/post-comments.tsx` | fixed composer, `variant` prop, list padding |
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/scroll-to-comments.tsx` | hash scroll after streaming |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.tsx` | render `ScrollToComments` in `CommentsSection` |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/post-comments.test.tsx` | composer tests |

**Testing:**
- Counter shows `0/500` and updates; Kirim disabled when blank; posting appends the comment (existing tests stay green).
- Signed-in composer style `bottom: var(--bottom-nav-height)`; guest `bottom: 0` and shows "Masuk untuk berkomentar" link with `returnTo`.
- Keyboard: mock `window.visualViewport` (height smaller than `innerHeight`), focus the textarea → `bottom` equals the inset.
- `canComment: false` + logged in → no composer.
- Locked premium (`getPostComments` → `'forbidden'`) → note only, no names/avatars/text, no composer.
- `ScrollToComments`: with `location.hash = '#komentar'` calls `scrollIntoView` once; with no hash, not at all.
- Hapus shows only for `canDelete` comments (author or creator) — existing.
