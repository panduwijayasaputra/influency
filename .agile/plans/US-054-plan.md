# Technical Plan: US-054 — Post Baru / Edit Post Form UI

## Architecture Overview

One client component, `PostEditor`, replaces the multi-section editor in place (decision 2026-11-09: replace, don't duplicate).

- `/studio/posts/new` renders `<PostEditor />` (new mode). `/studio/posts/[postId]` renders `<PostEditor post={…} media={…} />` (edit mode), loading data server-side through the existing `getMyPost` / `getMyPostMedia` (`lib/api/studio-posts.ts`).
- The draft is created **on the first media add**: opening the form creates nothing (decision 2026-11-09). If the creator presses Publikasikan without media, the media error shows and nothing is created.
- All calls use the existing studio APIs: `POST/PATCH /creators/me/posts`, `…/media` (slot → PUT → complete, delete), `PUT …/offer`, `PUT …/cover {mediaId}`, `POST …/publish`, archive/restore. Until US-059, media order is kept only in local state, through a dummy `saveMediaOrder()` in `lib/api/studio-posts.ts` that resolves without calling anything.
- **Cover = the first media item** for premium posts (design "Sampul"). On save, a premium post with a READY first item calls `PUT …/cover { mediaId: firstId }` when it differs from the current `post.cover.mediaId`. The custom cover image upload UI (`post-cover.tsx`) is dropped; its API stays.
- Live posts (status ≠ DRAFT, `isPostEditable` false):
  - Media and visibility are read-only, with the reason "Media dan akses tidak bisa diubah setelah dipublikasikan."
  - Caption and price stay editable. A price change shows "Harga baru berlaku untuk pembelian berikutnya."
  - The cover can still change in any status.
  - Arsipkan / Pulihkan from `post-status-actions.tsx` stay below the form.

## Dependencies

- None new. Reuse `@influency/shared` (`createPostSchema`, `updatePostSchema`, `POST_CAPTION_MAX_LENGTH`, `POST_MEDIA_MAX_PER_POST`, `isPostEditable`, the offer price limits), `components/ui/*`, `useToast`, `lib/api/errors.ts` (`ApiError`).
- `POST_MEDIA_MAX_PER_POST` is still 10 in shared; US-059 lowers it to 5. The UI uses the constant, never a literal.

## Risks

- **Partial save.** Save is a sequence of calls; one failing midway leaves part of the change saved. Mitigation: run the steps in order, stop at the first failure, keep the form state, and show the error. Every step is idempotent (PATCH, PUT offer/cover), so pressing again resumes.
- **Upload logic is the riskiest part to move** (presigned PUT, video processing polling, REJECTED items). Mitigation: move the existing logic from `post-media.tsx` into a hook unchanged and port its tests.

## Tasks

### TASK-198: PostEditor form, validation and save flow

Build `apps/web/src/app/studio/posts/post-editor.tsx` (`'use client'`) with the non-media fields and the save sequence. TASK-199 adds media.

- **Props:** `{ post?: StudioPost; media?: StudioMedia[] }`. Mode is `post ? 'edit' : 'new'`. Title "Post Baru" / "Edit post" (`<h1>`). Button "Publikasikan" (new, or a DRAFT in edit mode, next to a secondary "Simpan draf") / "Simpan" (live).
- **State:** `postId` (from props or created later), `caption`, `visibility` ('FREE' | 'PREMIUM', default FREE), `priceInput` (string, default `post.offer?.priceCoins ?? 25`), `tried` (show errors after the first submit), `pending`.
- **Caption:** shadcn `Textarea` with a label "Caption" and a counter `{n}/{POST_CAPTION_MAX_LENGTH}`. Over the limit → error.
- **Access:** a segmented control "Gratis" / "Premium" (reuse `components/user-area/` `SegmentedControl`), `aria-pressed`/radio semantics. Disabled when live.
- **Price** (Premium only): `inputMode="numeric"`, label "Harga (Koin)". Valid = whole number 5–1,000 (use the shared offer schema limits, not literals).
  - Help text: `≈ {formatIdr(p*1000)} per unlock · kamu terima ≈ {formatIdr(p*800)} setelah biaya platform 20%`.
  - Error: "Masukkan angka bulat 5–1.000 Koin."
  - Integer math only. Reuse the existing IDR formatter in `lib/format.ts`; add `formatIdr(n: number)` there with `Intl.NumberFormat('id-ID')` if none exists.
- **Helper `ensureDraft()`:** if there's no `postId`, `POST /api/v1/creators/me/posts { caption, visibility }`, store the id, `router.replace('/studio/posts/{id}')` without a full reload (`window.history.replaceState`, so state survives), and return the id. TASK-199 calls it on the first media add.
- **`save({ publish })`:**
  1. If there is no media → `tried=true`, show "Tambahkan minimal 1 foto atau video.", stop.
  2. Validate locally, then stop on error.
  3. `PATCH` caption (and visibility when DRAFT) if changed.
  4. `saveMediaOrder(postId, ids)` (TASK-199).
  5. Premium: `PUT offer { priceCoins }` if changed or missing; `PUT cover { mediaId: first READY id }` if it differs.
  6. If `publish`: `POST publish`.
  - Map `ApiError.code`:
    - `MEDIA_PROCESSING` → "Video masih diproses. Coba lagi sebentar lagi." (saved as draft)
    - `MEDIA_REQUIRED` → the media error
    - `OFFER_REQUIRED` → the price error
    - `VALIDATION_FAILED` → field errors via the existing `byField`
    - anything else → toast with the API message
  - Success toast "Post dipublikasikan" / "Perubahan disimpan", then `router.push('/{creatorSlug}')`. Get the slug from `getMyCreatorProfile()` server-side and pass it as a `creatorSlug` prop.
- **Pages:** `studio/posts/new/page.tsx` and `studio/posts/[postId]/page.tsx` render `PostEditor` inside the existing `Suspense` (they read cookies). Keep the PENDING_REVIEW / REMOVED notices from the current `[postId]/page.tsx` above the form. Keep `post-status-actions.tsx` (Arsipkan/Pulihkan) below it for live posts.
- **Styling:** Light Social tokens, ≥ 44px controls, 16px gutters, max-w 560 column. A sticky bottom action bar is fine (studio has no bottom nav).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/app/studio/posts/post-editor.tsx` | Form + save sequence |
| CREATE | `apps/web/src/app/studio/posts/post-editor.test.tsx` | Component tests |
| MODIFY | `apps/web/src/app/studio/posts/new/page.tsx` | Render PostEditor |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/page.tsx` | Render PostEditor (edit) + notices + status actions |
| MODIFY | `apps/web/src/lib/format.ts` | `formatIdr` if missing |
| MODIFY | `apps/web/src/lib/api/studio-posts.ts` | `saveMediaOrder` dummy (resolves, no fetch; comment `dummy until US-059`) |

**Testing** (Vitest + Testing Library, mock `fetch`, `{ wrapper: Toaster }`):
- New mode renders "Post Baru" and "Publikasikan"; publishing with no media shows the media error and calls no fetch.
- Price helper: 25 → "Rp25.000" and "Rp20.000"; 4, 1001, 2.5, "abc" → the price error; Gratis hides the field.
- Caption counter and over-limit error.
- Save sequence order for a premium draft: PATCH → offer → cover → publish (assert fetch call order); stops at a failing step and keeps the inputs; `MEDIA_PROCESSING` message.
- Edit live post: access control disabled with the reason, a price change shows the "pembelian berikutnya" note, the button reads "Simpan", publish is not called.

---

### TASK-199: PostEditor media strip (upload, preview, reorder, remove)

Add media to `PostEditor`, reusing the current upload logic.

- **Extract** the upload/complete/poll/delete logic from `studio/posts/[postId]/post-media.tsx` into `apps/web/src/app/studio/posts/use-post-media.ts`. Keep the behaviour unchanged: slot → PUT → complete, PROCESSING video refresh, REJECTED with a reason, delete allowed for REJECTED in any status. The hook is `usePostMedia({ getPostId: () => Promise<string>, initial: StudioMedia[], locked: boolean })` and returns `{ items, add(file), remove(id), move(from, to), error }`. `getPostId` is `ensureDraft` from TASK-198, so the first add creates the draft.
- **UI** in `post-editor.tsx`, section "Media":
  - A large preview of the selected item: image via the existing owner preview URL, video poster/"Video" placeholder with the duration. Badge "Sampul" on index 0 and position "2 / 4".
  - Below it: "Geser kiri" / "Geser kanan" (`aria-label`, disabled at the ends) and "Hapus".
  - A thumbnail row: each item is a button (`aria-pressed` = selected) with an upload/processing/failed overlay. Then an "Tambah foto atau video" button (`<input type=file accept="image/jpeg,image/png,image/webp,video/*" hidden>`) and the counter `{n} / {POST_MEDIA_MAX_PER_POST}`.
  - At the limit the add button is disabled with the text "Maksimal {max} foto atau video per post." The API `MEDIA_LIMIT_REACHED` error shows the same text.
  - Reordering is keyboard/tap based (move buttons); drag is optional and not required.
- `locked` (live post): no add/remove/move, the note from TASK-198.
- `items` order feeds `saveMediaOrder` and the cover choice in TASK-198.
- **Delete** `post-media.tsx`, `post-cover.tsx`, `post-offer-form.tsx`, `post-form.tsx` and their tests once PostEditor covers them. Port the relevant upload test cases from `post-media.test.tsx` to `use-post-media.test.ts` / `post-editor.test.tsx`. Keep `byField` (move it to `post-editor.tsx` or `lib/form-errors.ts`, and update its importers).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/app/studio/posts/use-post-media.ts` | Upload logic moved from post-media.tsx |
| CREATE | `apps/web/src/app/studio/posts/use-post-media.test.ts` | Ported upload tests |
| MODIFY | `apps/web/src/app/studio/posts/post-editor.tsx` | Media section |
| MODIFY | `apps/web/src/app/studio/posts/post-editor.test.tsx` | Media tests |
| DELETE | `apps/web/src/app/studio/posts/[postId]/post-media.tsx` (+ test), `post-cover.tsx` (+ test), `post-offer-form.tsx` (+ test), `apps/web/src/app/studio/posts/post-form.tsx` (+ test) | Replaced |

**Testing:**
- The first add with no `postId` calls create-post once, then the slot request; a second add doesn't create again.
- Counter and disabled add at the max; `MEDIA_LIMIT_REACHED` message.
- Move left/right changes the order and the "Sampul" badge follows index 0; buttons are disabled at the ends.
- Remove the selected item → selection moves to a neighbour.
- Locked mode hides add/remove/move.
- Ported cases: upload success, failed upload, a processing video that turns ready, a rejected item with its reason.

---

### TASK-200: Entry points (Post Baru, Edit) and the drafts list

- **Creator profile, owner only.** `app/(public)/[creatorSlug]/page.tsx` already computes `isOwner`; pass it down to the Postingan tab content (`creator-content.tsx` / `creator-posts.tsx`).
  - At the top of the Postingan tab, render a primary 48px "Post Baru" button (`Link` to `/studio/posts/new`, Plus icon).
  - Pass `editHref={`/studio/posts/${post.id}`}` to each `PostCard`.
- **`PostCard`** (`components/post-card/post-card.tsx`): new optional prop `editHref?: string`. When set, the `···` menu shows a first item "Edit" (Pencil icon, `Link`). Without it nothing changes. Home feed, library and others don't pass it.
- **`/studio/posts`** (`page.tsx`, `my-post-list.tsx`): restyle to Light Social. The list shows status labels (`labels.ts`) incl. Draf, each row links to the editor, and "Post Baru" sits at the top. This is where abandoned drafts are found.
- **`/studio` page:** replace the underline links with Light Social rows: "Post Baru", "Postingan saya" (`/studio/posts`), "Edit Profil" (`/studio/profile`), "Penghasilan" (`/studio/earnings`).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.tsx`, `creator-content.tsx`, `creator-posts.tsx` | Owner "Post Baru" + `editHref` |
| MODIFY | `apps/web/src/components/post-card/post-card.tsx` (+ test) | Optional "Edit" menu item |
| MODIFY | `apps/web/src/app/studio/posts/page.tsx`, `my-post-list.tsx` | Restyle drafts list |
| MODIFY | `apps/web/src/app/studio/page.tsx` | Studio links |
| MODIFY | related `*.test.tsx` | Expectations |

**Testing:**
- Profile page test: the owner sees "Post Baru" and an "Edit" item linking `/studio/posts/{id}`; a non-owner and a guest see neither.
- PostCard: no `editHref` → no Edit item (existing tests unchanged).
- Studio list renders draft and published rows with their labels and links.
