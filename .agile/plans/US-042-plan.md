# Technical Plan: US-042 — Langganan Page UI

## Architecture Overview

`/subscriptions` becomes a client view over `fetchMySubscriptions()` in `lib/api/my-subscriptions.ts`, shaped like the final `GET /me/subscriptions` (US-047 swaps the body). Cards link to the creator profile, where the existing Langganan sheet handles renewal and cancel. No list paging: a user holds at most one active subscription per creator and the list is small (cap documented in US-047).

Dummy body: `fetchRecommendedCreators()` mapped to subscriptions with fake `daysLeft` (e.g. 12, 1, 25) and `hasScheduledRenewal` on the first. Marked `// DUMMY: US-047`.

Badge wording lives in one pure function so the UI and its tests agree: `daysLeftLabel(daysLeft)` → `"Aktif · berakhir hari ini"` when `daysLeft <= 1`, else `"Aktif · {n} hari lagi"`. (`daysLeft` is a whole-day ceiling computed on the server, so `1` means it ends within 24 hours; the story's "last day" wording is approximated this way.)

## Dependencies

- US-040 TASK-171/172 (`user-area.ts`, list states).

## Risks

- A subscription that expires while the page is open still shows "Aktif". Mitigation: acceptable, the creator profile (server decides) shows the real state when tapped; noted in US-047.

## Tasks

### TASK-176: Subscriptions schema and dummy `fetchMySubscriptions`

Add to `packages/shared/src/user-area.ts`:

```ts
export const mySubscriptionSchema = z.object({
  creator: z.object({
    slug: z.string(), displayName: z.string(),
    avatarUrl: z.string().nullable(), bannerUrl: z.string().nullable(),
    bio: z.string().nullable(),
  }),
  endsAt: z.string(),                 // ISO, end of the current active period
  daysLeft: z.int().min(1),           // whole days, ceil, server-computed
  hasScheduledRenewal: z.boolean(),   // a prepaid next period exists and is not cancelled
});
export const mySubscriptionListSchema = z.object({ subscriptions: z.array(mySubscriptionSchema) });
```

Create `apps/web/src/lib/api/my-subscriptions.ts` with `fetchMySubscriptions(): Promise<MySubscriptionList>` (dummy as above) and the pure `daysLeftLabel` in `apps/web/src/lib/format.ts` (exists; add there, with a test in `format.test.ts`).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/user-area.ts` | subscription list schemas |
| CREATE | `apps/web/src/lib/api/my-subscriptions.ts` (+ test) | dummy fetch |
| MODIFY | `apps/web/src/lib/format.ts`, `format.test.ts` | `daysLeftLabel` |

**Testing:** `daysLeftLabel(1)`, `(2)`, `(30)`; schema rejects `daysLeft: 0`.

---

### TASK-177: `SubscriptionsView` and the `/subscriptions` page

**Page** `apps/web/src/app/(public)/subscriptions/page.tsx`: `getCurrentUser` or `redirect(loginHref('/subscriptions'))`; `PageHeader title="Langganan" asHeading fallbackHref="/"`; `<SubscriptionsView />`.

**Component** `apps/web/src/components/subscriptions/subscriptions-view.tsx` (`'use client'`): loads once with `useEffect`/`setTimeout` pattern (not paged), states `loading | ready | error`.
- One full-width card per subscription, a `Link` to `/{slug}` with `aria-label="Buka {displayName}, langganan aktif, {label}"`: banner (96px), badge top-right `daysLeftLabel(daysLeft)` (success tone: `bg-card text-success` token), avatar overlapping, name, `@slug`, 2-line bio.
- If `hasScheduledRenewal`: a second small pill "Perpanjangan terjadwal" on the card.
- Copy: "Langganan terpisah dari mengikuti." and "Perpanjangan dilakukan manual." Open design items ("Detail kartu dan kontrol perpanjangan") appear as a small muted note: "Perlu konfirmasi: detail kartu dan kontrol perpanjangan." Never worded as policy.
- Empty: "Belum ada langganan aktif" + hint "Langganan terpisah dari mengikuti. Berlanggananlah dari profil creator." Error: `ListError` retry. Skeleton: `ListSkeleton variant="cards"`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(public)/subscriptions/page.tsx` | real page |
| CREATE | `apps/web/src/components/subscriptions/subscriptions-view.tsx` (+ `.test.tsx`) | view |
| MODIFY | `.agile/guidelines/codebase-map.md` | page and component |

**Testing:** badge text for `daysLeft` 1 and 12; scheduled-renewal pill only when flagged; card links to the profile; empty copy; error + retry; skeleton; page redirect when logged out; the "Perlu konfirmasi" note is present.

## Suggested order

TASK-176 → TASK-177.
