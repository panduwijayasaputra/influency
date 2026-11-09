# Technical Plan: US-049 — User Onboarding Path UI

## Architecture Overview

`UserPath` (a client component) runs inside `WelcomeFlow`, with steps `['Profil', 'Ikuti']` and a done screen.

- Profil saves through `saveMyProfile` from `lib/api/onboarding.ts`, a dummy until US-052.
- Ikuti reuses the real `fetchRecommendedCreators()` and `FollowButton`. These are already optimistic with a rollback toast, and the label is "Ikuti / Diikuti". The story's "Mengikuti" wording follows the existing component.
- Finishing or skipping calls `completeOnboarding()` (a dummy until US-051) and then shows the done screen.

## Dependencies

- TASK-190 (stepper chrome, `WelcomeFlow`, `lib/api/onboarding.ts`).

## Risks

- `FollowButton`'s `onChange` fires only after a server success. Count follows from `onChange` (`state.following`), so the done screen's number matches the server.
- `/creators/recommended` excludes already-followed creators, so a refetch after following drops cards. Fetch once on entering the step and keep the list in state.

## Tasks

### TASK-191: User path (Profil, Ikuti creator, done)

- `components/onboarding/user-path.tsx`: props `{ user: { displayName: string; username: string | null; bio: string | null }; returnTo: string; onExit(): void }`. `onExit` goes back to the path choice.
  - State: `step` (0 Profil, 1 Ikuti), `done`, `values {displayName, bio}`, `errors`, `tried`, `pending`, `followed: Set<string>`.
- **Profil step**:
  - Initials avatar (no upload; decided in the feature).
  - `Nama tampilan` `Input`, `maxLength=60`.
  - Read-only Telegram username: "@{username}" with the help text "Dari Telegram". If `username` is null, hide the row.
  - `Bio (opsional)` `Textarea`, `maxLength=500`.
  - Validate with a new shared `updateMyProfileSchema` (`packages/shared/src/auth.ts`):
    `z.strictObject({ displayName: z.string().trim().min(1,'Masukkan nama tampilan.').max(60,'Nama tampilan maksimal 60 karakter.'), bio: z.string().trim().max(500,'Bio maksimal 500 karakter.') })`.
    US-052 reuses it on the API.
  - Lanjut: if the input is invalid, set `tried` and show field errors (`aria-invalid` and `aria-describedby`, as in the existing form).
  - Otherwise `await saveMyProfile(parsed)`. On a throw, keep the input and show `role="alert"` "Gagal menyimpan profil. Coba lagi.". On success, go to step 1.
- **Ikuti step**:
  - h1 "Ikuti beberapa creator", sub "Mengikuti itu gratis dan terpisah dari berlangganan. Postingan baru mereka muncul di Beranda.".
  - On mount, `fetchRecommendedCreators()` with a loading skeleton.
  - Each creator gets a card: avatar, name, `@slug`, and `<FollowButton slug creatorName onChange={(s) => toggle(slug, s.following)} />`.
  - Error state: "Gagal memuat saran creator." with a Coba lagi button. Empty state: "Belum ada saran creator. Kamu bisa menjelajah dari Beranda.".
  - The header has `onSkip` ("Lewati"). Both Selesai and Lewati call `finish()`.
- `finish()`: `setPending(true)`, then `await completeOnboarding()`. On a throw, show the toast "Gagal menyelesaikan. Coba lagi." and stay. Otherwise `done = true`.
- **Done screen**:
  - Initials avatar with a ring, and h1 "Selamat datang, {firstName}!".
  - Body text: with n > 0, "Kamu mengikuti {n} creator. Postingan baru mereka menunggu di Beranda."; otherwise "Beranda kamu sudah siap. Jelajahi creator dari Beranda dan Jelajahi.".
  - CTA `Link` "Mulai menjelajah" → `returnTo`.
- Back: on step 0 it calls `onExit`, otherwise it decrements the step. Header steps: `['Profil','Ikuti']`. Footer label: "Lanjut" on Profil, "Selesai" on Ikuti.
- There are no Koin, purchase or subscription actions anywhere in this path.
- `welcome-flow.tsx`: replace the US-048 placeholder with `<UserPath user returnTo onExit={() => setPath(null)} />`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/auth.ts` (+ `auth.test.ts`) | `updateMyProfileSchema` + type `UpdateMyProfileInput` |
| CREATE | `apps/web/src/components/onboarding/user-path.tsx` | steps + done |
| MODIFY | `apps/web/src/components/onboarding/welcome-flow.tsx` | mount UserPath |

**Testing:**
- Shared: the schema trims; it rejects an empty name, 61 characters, a 501-character bio and unknown keys.
- `user-path.test.tsx` (mock `lib/api/onboarding`, `lib/api/recommended-creators`, `lib/api/creator-follow`):
  - An empty name shows "Masukkan nama tampilan." and does not call save.
  - A save failure keeps the input and shows the alert; a success moves to Ikuti.
  - The username is shown read-only (no input), and hidden when null.
  - The recommended list renders. Follow success counts 1, and a rolled-back follow does not count.
  - The empty and error states with retry work.
  - Lewati and Selesai call `completeOnboarding` once and show the done screen with the right count text.
  - A `completeOnboarding` failure shows a toast and stays on the step.
  - "Mulai menjelajah" has `href=returnTo`.
