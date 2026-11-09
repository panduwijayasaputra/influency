# Technical Plan: US-055 — Edit Profil UI

## Architecture Overview

Replace `/studio/profile` in place with one Light Social form (decision 2026-11-09). The page stays a server component that loads the data; a client `EditProfileForm` holds the edits.

- **Data:**
  - `getMyCreatorProfile()` (existing, `lib/api/creator-profile.ts`) for slug, name, bio, category and image URLs.
  - New `getMySubscriptionPlan()` (server, forwards the cookie) → `GET /api/v1/creators/me/subscription-plan` for the current price; null means no plan.
- **Images** upload immediately when picked, as today (`ProfileImageInput`, `PUT /creators/me/avatar|banner`). Only the text fields and the price wait for "Simpan".
- **Save** sends only what changed:
  - `PATCH /creators/me` with the changed subset of `displayName`, `bio`, `category` (`updateCreatorProfileSchema` rejects `{}`, so skip the call when nothing changed);
  - `PUT /creators/me/subscription-plan { priceCoins }` when the price changed.
- **The slug is read-only** (feature decision): `influency.com/{slug}`, a copy button, and "Alamat profil tidak bisa diubah."
- The "Edit Profil" button on the profile cover already links to `/studio/profile` (`editHref` in `[creatorSlug]/page.tsx`), so no entry change is needed.

## Dependencies

- Existing shared schemas: `updateCreatorProfileSchema`, `creatorProfileResponseSchema`, and the subscription plan schemas in `purchases.ts` (price 10–5,000, LOCKED).

## Risks

- **Partial save** (PATCH succeeds, plan PUT fails). Mitigation: run PATCH, then PUT. On failure keep the form dirty with the error, and mark the fields that did save as clean.
- **Unsaved-changes guard.** The Next App Router has no route-change blocking API. Use `beforeunload` while dirty. The form's own "Batal" button and the back link in the page header both open a `BottomSheet` confirm ("Buang perubahan?") when dirty.

## Tasks

### TASK-201: Edit Profil page (form, price, read-only address, partial save)

- **`apps/web/src/lib/api/subscription-plan.ts`:** `getMySubscriptionPlan()` (server, `cookies()` forwarded like `getMyCreatorProfile`, parses with the shared plan schema, returns `null` on 404/no plan) and `saveSubscriptionPlan(priceCoins)` (client `PUT`, throws `ApiError`).
- **`apps/web/src/app/studio/profile/edit-profile-form.tsx` (`'use client'`):**
  - **Props:** `{ profile: CreatorProfileResponse; planPriceCoins: number | null }`.
  - **Layout** in the design order:
    - The cover (`ProfileImageInput kind="banner"`, restyled: full-width 16:6 preview, "Ganti sampul" button) with the avatar overlapping it (`kind="avatar"`, "Ganti foto");
    - the address row (read-only text + "Salin" button → `navigator.clipboard.writeText('https://influency.com/' + slug)` (use the web origin constant if one exists), toast "Tautan disalin");
    - Nama tampilan;
    - Bio (textarea, counter `{n}/{max}` from the shared schema);
    - Kategori (keep the existing field);
    - Harga langganan (Koin / 30 hari).
  - **Price validation:** whole number 10–5,000 (shared schema limits). Help text: `≈ {formatIdr(p*1000)} per 30 hari · kamu terima ≈ {formatIdr(p*850)} setelah biaya platform 15%` plus the note "Harga baru berlaku untuk langganan berikutnya." Error "Masukkan angka bulat 10–5.000 Koin." Integer math only.
  - **Dirty tracking** against the initial values. "Simpan" is disabled when clean or pending. Save runs the partial sequence above, maps `VALIDATION_FAILED` issues to fields (reuse `byField`), shows the toast "Profil diperbarui", then `router.refresh()`.
  - "Batal" → confirm sheet when dirty, then `router.back()` (fallback `/{slug}`). Add a `beforeunload` listener while dirty.
- **`studio/profile/page.tsx`:** Light Social layout with an `<h1>Edit Profil</h1>`. Load the profile and the plan in parallel inside the existing `Suspense` and render `EditProfileForm`.
- **Delete** `creator-profile-form.tsx`, `profile-editor.tsx` and their tests (folded into the new form). Restyle `profile-image-input.tsx` and keep its tests passing (update its selectors if labels change).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/subscription-plan.ts` (+ `.test.ts`) | Plan read/save |
| CREATE | `apps/web/src/app/studio/profile/edit-profile-form.tsx` (+ `.test.tsx`) | New form |
| MODIFY | `apps/web/src/app/studio/profile/page.tsx` | Load profile + plan, render form |
| MODIFY | `apps/web/src/app/studio/profile/profile-image-input.tsx` (+ test) | Restyle |
| DELETE | `apps/web/src/app/studio/profile/creator-profile-form.tsx`, `profile-editor.tsx` (+ tests) | Replaced |

**Testing:**
- Renders the current values; the address is not an input; "Salin" writes the URL and toasts.
- Price: 9, 5001 and 12.5 → error and Simpan blocked; 150 → "Rp150.000" / "Rp127.500".
- Name-only change → only PATCH `{ displayName }`; price-only change → only PUT plan; nothing changed → Simpan disabled.
- PATCH ok + PUT fail → error shown, price stays dirty, name no longer dirty.
- `VALIDATION_FAILED` details map to fields; Batal while dirty opens the confirm sheet.
