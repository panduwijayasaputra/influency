# Technical Plan: US-033 — Unlock & Langganan Sheets UI

## Architecture Overview

UI first, against the **final API contract** (the koin-wallet pattern). This story defines the whole `purchases` contract in `packages/shared/src/purchases.ts`. It also adds one client module, `apps/web/src/lib/api/purchases.ts`, that is temporarily backed by dummy data from `lib/demo.ts`. US-035 to US-039 swap each function to a real `fetch` without touching components.

Feature-wide decisions (agreed with the user, 2026-11-09):
- Routes use the creator **slug**: `POST /creators/:slug/subscribe`, `GET /creators/:slug/subscription`, `POST /creators/:slug/tips`, and `POST /posts/:id/purchase`, `POST /posts/:id/tips`, `POST /subscription-periods/:id/cancel-scheduled`.
- Chargeable bodies carry the price the user saw (`expectedPriceCoins`). If the DB price differs, the API answers `409 OFFER_CHANGED` with `details.priceCoins`, so the user never pays a price they did not confirm.
- Viewer subscription state is **not** in the cached public profile. It is a separate `GET /creators/:slug/subscription` (`OptionalSessionGuard`, `no-store`), the same split as `GET /creators/:slug/follow`.
- After an unlock, the PostCard refetches its own post (client `GET /creators/:slug/posts/:id`) and replaces its local state, so the Home feed (client state) and server pages both update. After subscribe or cancel, `router.refresh()` re-renders the server profile page and its posts.

## Dependencies

- None new. Uses `BottomSheet`, `useToast`, `Button`, `useWalletBalance`, `ERRORS` from shared, `safeReturnTo`.

## Risks

- **Dummy data looking real:** every dummy result toasts with the "Demo:" prefix (`DEMO_PURCHASE_MESSAGE` style), and `lib/demo.ts` stays the only dummy source.
- **Idempotency-Key reuse:** the key is created when the sheet opens and kept across retries of the same attempt. A new opening makes a new key. A key from an attempt that failed with `OFFER_CHANGED` is replaced when the user re-confirms the new price (different payload → `DUPLICATE_REQUEST` otherwise).

## Tasks

### TASK-158: Purchases contract and dummy client

**Shared contract** — create `packages/shared/src/purchases.ts` and export it from `index.ts`:

```ts
/** LOCKED (Monetization Spec v1 §2). */
export const UNLOCK_PRICE_MIN = 5, UNLOCK_PRICE_MAX = 1000;          // reuse existing constants if posts.ts has them
export const PLAN_PRICE_MIN = 10, PLAN_PRICE_MAX = 5000;
export const SUBSCRIPTION_DAYS = 30;
export const TIP_MIN = 1, TIP_MAX = 1000;

export const purchasePostRequestSchema = z.strictObject({ expectedPriceCoins: z.int().min(UNLOCK_PRICE_MIN).max(UNLOCK_PRICE_MAX) });
export const purchasePostResponseSchema = z.object({
  purchaseId: z.uuid(), postId: z.uuid(), priceCoins: z.int(), balanceCoins: z.int().nonnegative(),
  /** true when the viewer already owned the post: nothing was charged. */
  alreadyOwned: z.boolean(),
});

export const subscriptionPeriodSchema = z.object({ periodId: z.uuid(), startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), priceCoins: z.int() });
export const creatorSubscriptionStateSchema = z.object({
  plan: z.object({ priceCoins: z.int(), durationDays: z.literal(30) }).nullable(),
  /** null for guests. */
  viewer: z.object({
    current: subscriptionPeriodSchema.nullable(),     // period covering server now
    scheduled: subscriptionPeriodSchema.nullable(),   // prepaid future period (max one)
    canTip: z.boolean(),
  }).nullable(),
});
export const subscribeRequestSchema = z.strictObject({ expectedPriceCoins: z.int().min(PLAN_PRICE_MIN).max(PLAN_PRICE_MAX) });
export const subscribeResponseSchema = subscriptionPeriodSchema.extend({ scheduled: z.boolean(), balanceCoins: z.int().nonnegative() });
export const cancelScheduledResponseSchema = z.object({ periodId: z.uuid(), refundedCoins: z.int().positive(), balanceCoins: z.int().nonnegative() });
export const tipRequestSchema = z.strictObject({ amountCoins: z.int().min(TIP_MIN).max(TIP_MAX) });
export const tipResponseSchema = z.object({ tipId: z.uuid(), amountCoins: z.int(), balanceCoins: z.int().nonnegative() });
```
Export the inferred types. Add `purchases.test.ts` for the bounds (4/5/1000/1001, 9/10/5000/5001, 0/1/1000/1001, decimals rejected, unknown keys rejected).

**Error codes** — add to `ERRORS` in `packages/shared/src/errors.ts` (Bahasa messages):
- `PLAN_NOT_AVAILABLE` 404 "Kreator ini belum membuka langganan."
- `RENEWAL_ALREADY_SCHEDULED` 409 "Perpanjangan berikutnya sudah dibayar."
- `RENEWAL_ALREADY_STARTED` 409 "Periode ini sudah dimulai dan tidak bisa dibatalkan."
- `CANNOT_PURCHASE_OWN` 400 "Kamu tidak bisa membeli kontenmu sendiri."
- `TIP_NOT_ALLOWED` 403 "Tip hanya untuk kreator yang kamu dukung."

Existing codes reused: `INSUFFICIENT_COINS` (details `{ required, available }`), `OFFER_CHANGED` (details `{ priceCoins }`), `POST_NOT_AVAILABLE`, `DUPLICATE_REQUEST`, `REQUEST_IN_PROGRESS`, `NOT_FOUND`, `RATE_LIMITED`. Update `errors.test.ts` if it snapshots the code list.

**Web client** — create `apps/web/src/lib/api/purchases.ts` (`'use client'`-safe, no `next/headers`):
```ts
purchasePost(postId: string, expectedPriceCoins: number, key: string): Promise<PurchasePostResponse>
subscribeCreator(slug: string, expectedPriceCoins: number, key: string): Promise<SubscribeResponse>
cancelScheduledRenewal(periodId: string): Promise<CancelScheduledResponse>
sendTip(target: { creatorSlug: string } | { postId: string }, amountCoins: number, key: string): Promise<TipResponse>
fetchCreatorSubscription(slug: string): Promise<CreatorSubscriptionState>   // client refresh
fetchPublicPost(slug: string, postId: string): Promise<PublicPostDetail>     // client refetch after unlock (real endpoint already exists: GET /creators/:slug/posts/:id)
```
Move `ApiError` out of `lib/api/wallet.ts` into `lib/api/errors.ts` (re-export from wallet.ts to keep imports working). Add `ApiError.details` and a `postJson(path, body, key?)` helper that sends `Idempotency-Key`, parses the shared error shape into `ApiError(code, message, details)` and validates the response with its schema.
Dummy phase: `purchasePost`, `subscribeCreator`, `cancelScheduledRenewal` and `sendTip` wait about 600 ms and return results built from `lib/demo.ts` (`DEMO_BALANCE = 120`; throw `ApiError('INSUFFICIENT_COINS', …, { required, available })` when the price is above it). Each dummy body has a `// shortcut: dummy until US-0xx` comment naming its story. `fetchPublicPost` is real from the start.

Server-side: create `apps/web/src/lib/api/creator-subscription.server.ts` `getCreatorSubscription(slug)` (forwards the session cookie, `no-store`, like `creator-follow.server.ts`). Dummy phase: return `DEMO_CREATOR_SUBSCRIPTION(slug, signedIn)` from `lib/demo.ts` (plan `{ priceCoins: 300, durationDays: 30 }`; for `creatorb` a `current` period ending in 12 days; for everyone else `current: null`).

Update `lib/demo.ts`: replace `DEMO_SUBSCRIPTION` / `DEMO_SUBSCRIBED` with the shaped demo values above; keep `DEMO_PURCHASE_MESSAGE`.

**Files:**
| Action | File Path | Purpose |
|---|---|---|
| CREATE | `packages/shared/src/purchases.ts` (+ `.test.ts`) | Contract |
| MODIFY | `packages/shared/src/index.ts`, `errors.ts` | Export + codes |
| CREATE | `apps/web/src/lib/api/errors.ts` | `ApiError` with details, `postJson` |
| MODIFY | `apps/web/src/lib/api/wallet.ts` | Re-export `ApiError` |
| CREATE | `apps/web/src/lib/api/purchases.ts` (+ `.test.ts`) | Client functions (dummy-backed) |
| CREATE | `apps/web/src/lib/api/creator-subscription.server.ts` | SSR viewer state (dummy-backed) |
| MODIFY | `apps/web/src/lib/demo.ts` | Shaped dummy data |

**Testing:** shared schema bounds; `postJson` sends `Idempotency-Key` and maps an error body to `ApiError` with code and details (mock `fetch`).

---

### TASK-159: Purchase sheet states and Unlock flow

Refactor `apps/web/src/components/purchase-sheet.tsx`:

`PurchaseSheet` props: add `onConfirm: (key: string, priceCoins: number) => Promise<void>`, `disclosure?: ReactNode`, and `returnPath: string`. Internal state machine: `idle | confirming | error(message) | offerChanged(newPrice)`.
- On open: `keyRef.current = crypto.randomUUID()`, state `idle`, balance via `useWalletBalance(open)`.
- Confirm: state `confirming` → button disabled with spinner and `aria-busy`, the sheet cannot be dismissed with the button. `await onConfirm(key, price)`:
  - success → close, toast is shown by the caller
  - `ApiError` `INSUFFICIENT_COINS` → show the short state using `details.required/available`
  - `OFFER_CHANGED` → show "Harga berubah menjadi N Koin" and a confirm button for the new price (new key)
  - `ALREADY_ENTITLED` → treat as success
  - other codes → `ERRORS[code]?.message ?? 'Terjadi kesalahan. Coba lagi.'` with "Coba lagi" (same key)
- Short balance link: `/wallet?returnTo=${encodeURIComponent(returnPath)}`.

`PostUnlockSheet` props: add `subscribedToCreator: boolean` (renders the disclosure "Kamu sudah bisa melihat post ini lewat Langganan. Membeli membuat aksesnya permanen, juga setelah langganan berakhir.") and `onUnlocked: () => void`. `onConfirm` calls `purchasePost(post.id, price, key)`, then toasts "Post terbuka" (dummy: `DEMO_PURCHASE_MESSAGE`) and calls `onUnlocked`.

PostCard (`components/post-card/post-card.tsx`): hold `const [current, setCurrent] = useState(post)` and render from `current`. `onUnlocked = async () => setCurrent(await fetchPublicPost(creator.slug, current.id))` (keep the old post on failure, then `router.refresh()`). Pass `onUnlocked` down to `PostMedia` and `CommentsSheet` (the locked comments sheet). `subscribedToCreator`: in the dummy phase it is `false`; US-037 fills it from `post.viewer.subscribed` (a field added there). Do not add it to the schema now.

Guests: the existing locked CTAs already link to `loginHref`; keep that and check it in tests.

Wallet `returnTo`: `/wallet` page reads `searchParams.returnTo` through `safeReturnTo` and passes it to `WalletView` → `TopupSheet`, which appends it to the status URL `/wallet/topups/[orderId]?returnTo=…`. `TopupStatus` in the CREDITED state shows a "Kembali" button to that path. Without `returnTo`, nothing changes.

**Files:**
| Action | File Path | Purpose |
|---|---|---|
| MODIFY | `apps/web/src/components/purchase-sheet.tsx` (+ test) | States, key, onConfirm |
| MODIFY | `apps/web/src/components/post-card/post-card.tsx`, `post-media.tsx` | Local post state, refetch after unlock |
| MODIFY | `apps/web/src/components/comments/comments-sheet.tsx` | Pass onUnlocked |
| MODIFY | `apps/web/src/app/(public)/wallet/page.tsx`, `app/(public)/wallet/topups/[orderId]/page.tsx`, `components/wallet/wallet-view.tsx`, `topup-sheet.tsx`, `topup-status.tsx` (+ tests) | returnTo threading |

**Testing (Vitest + Testing Library, `{ wrapper: Toaster }`):** idle shows price, balance and "Permanen"; disclosure only when subscribed; a double click calls `onConfirm` once; the key is the same on retry and new on reopen; `INSUFFICIENT_COINS` shows "Isi Koin · kurang N Koin" with a link including `returnTo`; `OFFER_CHANGED` shows the new price; a generic error keeps the sheet open with retry; success closes and calls `onUnlocked`; PostCard re-renders `access: 'full'` after the refetch (mock `fetchPublicPost`); `safeReturnTo` rejects `//evil.com`.

---

### TASK-160: Langganan sheet, subscribed state and renewal controls

Profile page `apps/web/src/app/(public)/[creatorSlug]/page.tsx`: load `getCreatorSubscription(slug)` next to the follow state (signed-in only; guests get `viewer: null`), remove `DEMO_SUBSCRIBED`, and pass the state to `ProfileActions`.

`ProfileActions` (`profile-actions.tsx`), props `{ slug, creatorName, loginHref?, subscription: CreatorSubscriptionState }`:
- `plan === null` → no Langganan button; Ikuti takes full width.
- guest → Langganan links to login (unchanged).
- `viewer.current` → outline button "Berlangganan" with `"{daysLeft} hari lagi"` (`daysLeft = Math.ceil((endsAt − now) / 86 400 000)`, helper `daysLeft(endsAt, now)` in `lib/format.ts` with a test). It opens `SubscriptionManageSheet`.
- otherwise → `SubscribeSheet` (renamed props `{ slug, creatorName, plan, trigger }`).

`SubscribeSheet`: rows "Masa aktif 30 hari", "Perpanjangan Manual", price from `plan.priceCoins`. `onConfirm` → `subscribeCreator(slug, price, key)` → toast "Langganan aktif sampai {date}" (Asia/Jakarta) → `router.refresh()`.

New `SubscriptionManageSheet` (in `purchase-sheet.tsx` or `components/subscription-sheet.tsx`):
- Shows "Aktif sampai {endsAt}".
- With no `scheduled` → section **Perpanjang lebih awal** built on `PurchaseSheet` content: "Periode berikutnya mulai {current.endsAt}", price, balance, plus the note "Tidak ada perpanjangan otomatis." Confirm → `subscribeCreator` → toast "Perpanjangan dijadwalkan mulai {date}" → refresh.
- With `scheduled` → "Perpanjangan terjadwal {startsAt}–{endsAt} · N Koin" and a destructive **Batalkan perpanjangan** button. It asks for an inline confirmation ("Batalkan dan kembalikan N Koin?" with Batal / Ya, batalkan — no `window.confirm`), then `cancelScheduledRenewal(periodId)` → toast "N Koin dikembalikan" → refresh. `RENEWAL_ALREADY_STARTED` shows its message and refreshes.
- The note "Harga baru untuk perpanjangan: Perlu konfirmasi" is shown as a small muted label (open item).

The comments sheet's `SubscribeSheet` usage gets the plan the same way: pass `plan` down from the profile page or post detail. Where no plan is available (Home feed card), hide the Langganan CTA in the locked comments sheet when `plan` is unknown. Do not fetch per card.

**Files:**
| Action | File Path | Purpose |
|---|---|---|
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.tsx`, `profile-actions.tsx` (+ test) | Real-shaped state |
| MODIFY | `apps/web/src/components/purchase-sheet.tsx` / CREATE `components/subscription-sheet.tsx` (+ test) | Subscribe + manage |
| MODIFY | `apps/web/src/components/comments/comments-sheet.tsx` | Plan prop |
| MODIFY | `apps/web/src/lib/format.ts` (+ test) | `daysLeft` |

**Testing:** no plan → no button; subscribed → "Berlangganan / 12 hari lagi"; early renewal shows the start = current end; scheduled shows the dates and cancel needs the inline confirm; cancel success toasts the returned Koin; `daysLeft` rounding (exactly 1 day, 1 ms left → 1, past → 0); guest links to login with `returnTo`.
