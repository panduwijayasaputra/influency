# Technical Plan: US-050 — Creator Onboarding Path UI

## Architecture Overview

`/become-creator` swaps the single form (US-010) for the stepper. The route stays standalone (already in `STANDALONE_PREFIXES`). `PageHeader` is removed; the stepper header replaces it.

The server component (`become-creator.tsx`) keeps its gate and status switch:
- a guest goes to login;
- PENDING_REVIEW and APPROVED show their states, restyled in the standalone shell;
- `null` or REJECTED render `<CreatorPath initial={application} backHref={…} />`.

`CreatorPath` (client) has the steps `['Profil', 'Langganan', 'Pencairan', 'Tinjau']` and a done screen. Submit goes through `submitCreatorApplication()` in `lib/api/creator-application.ts`, which calls the existing `POST /creators/apply`. The price is sent too. Until US-053, the API's non-strict `z.object` strips the unknown key, so nothing breaks.

Decisions: the Kategori field is dropped from the UI (the API keeps it optional). A `?from=welcome` query makes Back on the first step go to `/welcome`; otherwise it goes to `/me`.

## Dependencies

- TASK-190 (`StepperHeader`, `StepperFooter`). Shared constants: `PLAN_PRICE_MIN/MAX`, `KOIN_TO_IDR`, `slugSchema`, `creatorApplicationSchema`, `formatRupiah`.

## Risks

- The fee estimate needs the subscription commission in the web app, but `FEE_BPS` lives in the API. Mitigation: move the value to shared as `SUBSCRIPTION_FEE_BPS = 1500` in `purchases.ts` (LOCKED, spec §2). The API's `FEE_BPS.SUBSCRIPTION` then reads that constant, keeping one source.
- The rejected-resubmit prefill must keep working. Mitigation: port the existing `become-creator.test.tsx` and `creator-application-form.test.tsx` cases to the new components before deleting the old form.

## Tasks

### TASK-192: Creator stepper (Profil, Langganan, Pencairan, Tinjau, done)

- Shared `purchases.ts`:
  - Add `export const SUBSCRIPTION_FEE_BPS = 1500; // LOCKED: Influency 15% / creator 85% (Monetization Spec v1 §2)`.
  - `apps/api/src/modules/financial-ledger/split-revenue.ts`: `SUBSCRIPTION: SUBSCRIPTION_FEE_BPS`.
  - Add `export function creatorShareCoins(price: number): number` returning `price - Math.floor((price * SUBSCRIPTION_FEE_BPS) / 10_000)`, an integer.
    - It must use the same rounding as `split-revenue.ts`. The dev reads that file and reuses its rule. If the rules differ, export a pure helper from shared and use it in both places.
- `components/onboarding/creator-path.tsx` (client): props `{ initial?: CreatorApplicationResponse; backHref: string }`.
  - State: `step`, `done`, `tried`, `pending`, `formError`, and `values`.
  - `values` is `{ displayName, slug, bio, price: string, agree: false }`, prefilled from `initial`. For `price`: `String(initial?.subscriptionPriceCoins ?? 50)`, where `subscriptionPriceCoins` exists after US-053; until then use `?? 50`.
  - **Profil**:
    - Initials avatar.
    - `Nama tampilan` (`maxLength` 60).
    - `Alamat halaman` with a static `influency.com/` prefix inside the field, `autoCapitalize="none"`, `spellCheck={false}`, and lowercased on input. Help text "influency.com/{slug}" when valid; the slug error otherwise.
    - `Bio (opsional)` (500).
    - Validate with `creatorApplicationSchema.pick({ displayName, slug, bio })`.
  - **Langganan**:
    - Numeric input (`inputMode="numeric"`, digits only) with a Koin badge and the "Koin" suffix.
    - Valid when `/^\d+$/` and the value is in [`PLAN_PRICE_MIN`, `PLAN_PRICE_MAX`]. Error: "Masukkan angka 10–5.000 Koin.".
    - Presets 25 / 50 / 100 / 150 as `aria-pressed` chips.
    - Help text when valid: "≈ {formatRupiah(price*KOIN_TO_IDR)} per 30 hari · kamu menerima ≈ {formatRupiah(creatorShareCoins(price)*KOIN_TO_IDR)} setelah biaya platform 15%".
    - Notes:
      - "Perpanjangan manual, tanpa tagihan otomatis."
      - "Postingan premium diberi harga per postingan (5–1.000 Koin) saat dipublikasikan."
      - "Tip masuk ke kamu tanpa biaya platform."
  - **Pencairan**:
    - h1 "Ke mana penghasilanmu dikirim?".
    - A dashed "Perlu konfirmasi" placeholder card: "Rekening pencairan ditambahkan nanti di Rekening Pencairan setelah pengajuanmu disetujui. Verifikasi identitas dan biaya pencairan masih perlu konfirmasi.".
    - No inputs. Lanjut is always enabled.
  - **Tinjau**:
    - Preview card (initials, name, `@slug`).
    - Rows Profil (`@slug`), Alamat (`influency.com/slug`) and Langganan (`{price} Koin / 30 hari`). Each has an "Ubah" button (`aria-label="Ubah {k}"`) that jumps to its step.
    - Checkbox "Saya menyetujui Perjanjian Kreator dan Kebijakan Konten." plus the existing note "Dokumen kebijakan sedang disiapkan.". If unticked on submit, show "Setujui Perjanjian Kreator untuk melanjutkan.".
    - Footer "Kirim".
  - Submit calls `submitCreatorApplication({ displayName, slug, bio, acceptAgreement: true, subscriptionPriceCoins: Number(price) })`:
    - `{ ok: true }`: `done = true`.
    - `{ ok: false, field: 'slug' | 'displayName' | 'bio', message }`: jump to Profil (step 0) with that field error.
    - Otherwise `formError` with `role="alert"`.
    - Before calling, keep `byField` mapping of `VALIDATION_FAILED` issues and `SLUG_TAKEN` from the current form.
  - **Done**: h1 "Pengajuanmu sedang ditinjau", body "Kami akan memberi tahu setelah admin meninjau pengajuanmu. Setelah disetujui, kamu bisa posting dan membagikan influency.com/{slug}.", CTA `Link` "Ke beranda" → `/`.
  - Back on step 0 → `router.push(backHref)`.
- `lib/api/creator-application.ts`: add `submitCreatorApplication(input)`. It never throws: it returns `{ ok: true } | { ok: false; field?: string; message: string }` and maps network errors to "Gagal mengirim pengajuan. Silakan coba lagi.".

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/purchases.ts` (+ test) | `SUBSCRIPTION_FEE_BPS`, `creatorShareCoins` |
| MODIFY | `apps/api/src/modules/financial-ledger/split-revenue.ts` | read shared constant |
| CREATE | `apps/web/src/components/onboarding/creator-path.tsx` | creator steps |
| MODIFY | `apps/web/src/lib/api/creator-application.ts` (+ test) | `submitCreatorApplication` |

**Testing:**
- Shared: `creatorShareCoins(75) === 63`. The integer rule must match `split-revenue` (75 Koin → fee 11.25 → the existing rounding); assert against `split-revenue`'s function on 10, 75, 5000.
- `creator-path.test.tsx`:
  - Profil validation (empty name, reserved slug `welcome`, uppercase is lowercased); the slug preview updates.
  - Price: 9 and 5001 show the error and block; 10 and 5000 pass; non-digits are blocked; a preset fills the field; the estimate text for 50 shows Rp50.000 and Rp42.500.
  - Pencairan has no inputs.
  - Tinjau: the Ubah buttons jump to the right steps; Kirim without agreeing shows the error and makes no call.
  - A server `SLUG_TAKEN` returns to Profil with the slug error; a generic failure shows the alert; success shows the done screen.
  - A rejected `initial` is prefilled.
  - Back on step 0 goes to `backHref`.

---

### TASK-193: `/become-creator` renders the creator stepper

- `app/(subscriber)/become-creator/page.tsx`: drop `PageHeader` and `main` padding. Render a full-height standalone container (`min-h-dvh flex flex-col`) holding `<Suspense>` + `<BecomeCreator from={searchParams.from} />`.
- `become-creator.tsx`:
  - Keep the guest → `loginHref('/become-creator')` redirect (use `'/become-creator?from=welcome'` when `from === 'welcome'`).
  - PENDING_REVIEW: a centered state "Pengajuanmu sedang ditinjau", "influency.com/{slug}", and a `Link` "Ke beranda".
  - APPROVED: "Kamu sudah menjadi creator" with a `Link` "Buka Studio" → `/studio`.
  - `null` or REJECTED: `<CreatorPath initial={application ?? undefined} backHref={from === 'welcome' ? '/welcome' : '/me'} />`.
  - For REJECTED, show the existing rejection notice ("Pengajuan sebelumnya ditolak…" + "Alasan: …") above the stepper, passed in as a `notice` slot or rendered by `CreatorPath` when `initial.status === 'REJECTED'`.
- Delete `creator-application-form.tsx` and its test after porting the cases into `creator-path.test.tsx`. Update `become-creator.test.tsx` for the new states and the `from` back target.
- Grep for other imports of `CreatorApplicationForm` (none expected).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(subscriber)/become-creator/page.tsx`, `become-creator.tsx`, `become-creator.test.tsx` | stepper + states |
| DELETE | `apps/web/src/app/(subscriber)/become-creator/creator-application-form.tsx` (+ test) | replaced |

**Testing:**
- `become-creator.test.tsx`:
  - A guest redirects (with and without `from`).
  - PENDING shows the review state and the slug.
  - APPROVED shows the Studio link.
  - REJECTED shows the reason and the prefilled stepper.
  - `null` shows the stepper on Profil.
  - `from=welcome` makes Back go to `/welcome`.
- No bottom nav on `/become-creator` (already covered in `app-chrome.test.tsx`).
