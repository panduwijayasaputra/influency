# Technical Plan: US-048 — Welcome Stepper Shell & Path Choice

## Architecture Overview

`/welcome` is a new standalone route (no bottom nav, no top bar). A server page checks the session and renders a client `WelcomeFlow`. The flow keeps `path: null | 'user'` in state:
- `null` shows the path choice.
- `'user'` runs the user steps (US-049).

Choosing **creator** navigates to `/become-creator?from=welcome` (decision: one creator flow at one URL; that page already resolves pending, approved and rejected states, see US-050).

The stepper chrome (`StepperHeader`, `StepperFooter`) lives in `components/onboarding/` and is shared with the creator path.

`lib/api/onboarding.ts` is the single swappable data source. Until US-051 and US-052 it holds dummy functions.

## Dependencies

- None new. It reuses `getCurrentUser`, `loginHref`, `safeReturnTo` (shared), `Button`, and the `STANDALONE_PREFIXES` in `app-chrome.tsx`.

## Risks

- `welcome` becomes a reserved slug. An existing creator with slug `welcome` would collide. Mitigation: the dev checks the local DB (`select slug from creator_profiles where slug='welcome'`). The seed has none, so no data migration is planned.
- The `returnTo` query on `/welcome` is user-controlled. Always pass it through `safeReturnTo` before use.

## Tasks

### TASK-190: Welcome route, stepper chrome and path choice

**Shared**
- Add `'welcome'` to `RESERVED_SLUGS` in `packages/shared/src/creators.ts`. The existing `creators.test.ts` `it.each([...RESERVED_SLUGS])` covers it automatically. Also add `welcome` to the reserved list in `CLAUDE.md`.

**Web**
- `components/app-chrome.tsx`: add `'/welcome'` to `STANDALONE_PREFIXES` and remove the "Add onboarding here…" note.
- `app/(subscriber)/welcome/page.tsx`: the server page.
  - `metadata.title = 'Selamat datang'`.
  - Inside `<Suspense>` (cacheComponents), render `<Welcome searchParams={…} />`.
- `app/(subscriber)/welcome/welcome.tsx`: an async server component.
  - Call `getCurrentUser()`. With no user, `redirect(loginHref('/welcome'))`.
  - Compute `returnTo = safeReturnTo(searchParams.returnTo)`.
  - Render `<WelcomeFlow user={{ displayName, username, bio }} returnTo={returnTo} />`.
  - (US-051 adds the "already done → redirect" check here.)
- `components/onboarding/stepper-header.tsx` (client): props `{ steps: string[]; current: number; onBack(): void; onSkip?: () => void }`.
  - Renders a Back button (`aria-label="Kembali"`, 44 px) and the text "Langkah {current+1} dari {steps.length}".
  - When `onSkip` is set, renders a "Lewati" button; otherwise a 44 px spacer.
  - Renders `role="progressbar"` with `aria-label="Progres onboarding"`, `aria-valuemin=1`, `aria-valuemax=steps.length`, `aria-valuenow=current+1`, with one bar per step (bars at index ≤ current use the coral fill).
  - Below the bars, the step labels: the current one bold, the others muted.
- `components/onboarding/stepper-footer.tsx`: a sticky bottom CTA. Props: `{ label: string; disabled?: boolean; pending?: boolean; onClick(): void }`.
  - Full-width `Button size="lg"` with `aria-disabled` when disabled. A click while disabled calls `onClick`, so the step can show its errors (as in the design's `tried` flag).
  - Bottom padding uses `env(safe-area-inset-bottom)`.
- `components/onboarding/path-choice.tsx`: props `{ firstName: string; value: 'user' | 'creator' | null; onChange(v): void }`.
  - Shows the brand logo (`BrandLogo`), an h1 "Selamat datang, {firstName}. Mau pakai Influency untuk apa?", and the note "Kamu bisa jadi creator nanti dari menu akun.".
  - `role="radiogroup"` with `aria-label="Jenis akun"`, holding two `role="radio"` buttons with `aria-checked`:
    - user: "Jelajahi dan dukung creator" / "Ikuti creator, buka postingan premium, berlangganan, dan kirim tip dengan Koin."
    - creator: "Bagikan konten sebagai creator" / "Posting konten gratis dan premium, buka langganan, dan terima penghasilan."
  - Arrow keys move between the radios (roving `tabIndex`).
- `components/onboarding/welcome-flow.tsx` (client): state `{ choice, path }`.
  - With `path === null`, render `PathChoice` and a footer "Lanjut", disabled until a choice is made.
  - On Lanjut: `user` sets `path = 'user'`; `creator` calls `router.push('/become-creator?from=welcome')`.
  - With `path === 'user'`, render `<UserPath …/>` (US-049). Until then, a placeholder step list `['Profil', 'Ikuti']`, where Back on step 0 sets `path = null`.
- `lib/api/onboarding.ts`: export `saveMyProfile(input: { displayName: string; bio: string }): Promise<MeResponse>` and `completeOnboarding(): Promise<void>`.
  - Both start as dummies (resolve after 300 ms; `saveMyProfile` echoes the input). Mark them `// DUMMY: replaced by US-051/US-052`.
- First name: `displayName.trim().split(/\s+/)[0] || 'kamu'`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/creators.ts` | reserve `welcome` |
| MODIFY | `CLAUDE.md` | reserved list |
| MODIFY | `apps/web/src/components/app-chrome.tsx` | standalone `/welcome` |
| CREATE | `apps/web/src/app/(subscriber)/welcome/page.tsx`, `welcome.tsx` | route + session gate |
| CREATE | `apps/web/src/components/onboarding/stepper-header.tsx`, `stepper-footer.tsx`, `path-choice.tsx`, `welcome-flow.tsx` | stepper UI |
| CREATE | `apps/web/src/lib/api/onboarding.ts` | swappable data source (dummy) |

**Testing:**
- `app-chrome.test.tsx`: `/welcome` has no bottom nav.
- `welcome.test.tsx`: a guest redirects to `/login?returnTo=%2Fwelcome`; a user renders the greeting with their first name; an unsafe `returnTo` (`//evil.com`) becomes `/`.
- `onboarding.test.tsx`:
  - Lanjut is `aria-disabled` until a choice is made.
  - The radios have the `aria-checked` state, and arrow keys move focus.
  - Choosing user shows the header "Langkah 1 dari 2", with progressbar `aria-valuenow=1` / `aria-valuemax=2`.
  - Back on step 1 returns to the choice.
  - Choosing creator pushes `/become-creator?from=welcome`.
- The shared reserved slug test passes for `welcome`.
