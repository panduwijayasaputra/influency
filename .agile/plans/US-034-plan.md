# Technical Plan: US-034 — Kirim Tip Sheet UI

## Architecture Overview

One `TipSheet` client component (on top of `BottomSheet`) is opened from three places: the PostCard, the media viewer actions and the creator profile header. Sending goes through `sendTip()` in `lib/api/purchases.ts` (dummy until US-039; contract from TASK-158).

Visibility comes from the server, never computed in the browser:
- **post:** new `viewer.canTip` in `publicPostViewerSchema`. In this story the API fills it with today's UI rule (PREMIUM + `access === 'full'` + not own + published). US-039 tightens it to "paid access" (excludes admins and owners).
- **profile:** `CreatorSubscriptionState.viewer.canTip` (TASK-158). Dummy `true` for `creatorb` until US-039.

## Dependencies

- TASK-158 (contract, `sendTip`, `ApiError`) and TASK-159 (`PurchaseSheet` key and error handling patterns).

## Risks

- A small API change inside a UI story (`viewer.canTip`). It is additive and keeps the contract honest, so US-039 only changes the rule.

## Tasks

### TASK-161: Kirim Tip sheet and entry points

**API (additive):** `packages/shared/src/posts.ts` `publicPostViewerSchema` adds `canTip: z.boolean()` with the doc comment "Server rule (US-039): premium post the viewer has paid access to, not their own." `apps/api/src/modules/posts/public-posts.service.ts` `viewerOf(...)` gets a `visibility` and `access` argument and returns `canTip: status === 'PUBLISHED' && visibility === 'PREMIUM' && access === 'full' && ownerUserId !== userId` with `// shortcut: interim rule; US-039 uses paid access`. Update the affected API/web tests and fixtures (`viewer` objects in `*.test.ts(x)` and API specs gain `canTip`).

**`apps/web/src/components/tip-sheet.tsx`** (`'use client'`), props `{ creator: { slug, displayName, username?, avatarUrl }, postId?: string, trigger: ReactNode, returnPath: string }`:
- Header: avatar (initials fallback), name, @slug. A chip "Perlu konfirmasi" (muted) marks the layout as a design proposal.
- Amount: `role="group" aria-label="Jumlah tip"`, 5 preset buttons `[5, 10, 25, 50, 100]` (`aria-pressed`, default 10), plus "Jumlah lain" `<input inputMode="numeric" pattern="[0-9]*">`. Parse with `tipRequestSchema.shape.amountCoins.safeParse(Number(value))`. If invalid: inline message "Tip 1–1.000 Koin, bilangan bulat" and Kirim is disabled.
- Balance row (`useWalletBalance(open)`). Short balance → `/wallet?returnTo=…` link "Isi Koin · kurang N Koin".
- Note: "Tip adalah ucapan terima kasih. Tip tidak membuka konten, dan Influency tidak memotong biaya tip."
- Kirim: one `Idempotency-Key` per opening (`crypto.randomUUID()` on open, reused on retry, renewed when the amount changes after a failure). Disabled while sending. `sendTip(postId ? { postId } : { creatorSlug }, amount, key)` → close + toast `Tip ${n} Koin terkirim ke ${displayName}` (dummy: prefix "Demo:"). `INSUFFICIENT_COINS` → short state; `TIP_NOT_ALLOWED` / other → message + "Coba lagi".

**Entry points:**
- `components/post-card/post-card.tsx`: replace `canTip` and the `toast(SOON)` button with `post.viewer?.canTip` wrapping `<TipSheet postId={post.id} …>`.
- `components/media-viewer/viewer-actions.tsx`: same, with `post.viewer?.canTip`.
- Profile: `ProfileActions` / `ProfileHeader` (`app/(public)/[creatorSlug]/`) renders a koin-styled "Kirim Tip" button (h-11, `bg-koin-surface text-koin-foreground`) under the Ikuti/Langganan row when `subscription.viewer?.canTip`. Never for guests or the owner (owner gets no `ProfileActions`).

**Files:**
| Action | File Path | Purpose |
|---|---|---|
| MODIFY | `packages/shared/src/posts.ts` | `viewer.canTip` |
| MODIFY | `apps/api/src/modules/posts/public-posts.service.ts` (+ affected specs) | Interim rule |
| CREATE | `apps/web/src/components/tip-sheet.tsx` (+ `.test.tsx`) | Sheet |
| MODIFY | `apps/web/src/components/post-card/post-card.tsx`, `media-viewer/viewer-actions.tsx`, `app/(public)/[creatorSlug]/profile-actions.tsx` (+ tests) | Entry points |
| MODIFY | `apps/web/src/lib/demo.ts` | Dummy `canTip` for `creatorb` |

**Testing:** no Kirim Tip when `canTip` is false (free post, own post, guest); preset selection and `aria-pressed`; custom 0, 1001 and 2.5 disable Kirim with the message, while 1 and 1000 are allowed; a double click sends once; same key on retry; short balance link; success toast text; API spec: `canTip` false for FREE, own and locked posts and true for an accessible premium post.
