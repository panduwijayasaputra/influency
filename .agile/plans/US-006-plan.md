# Technical Plan: US-006 — Login Landing

## Architecture Overview

Web-only. No API, DB or shared-schema changes. `/login` is already standalone: `AppChrome` lists it in `STANDALONE_PREFIXES`, so it gets no bottom nav.

- **Layout** follows `design/artboards/Login.dc.html`, top to bottom:
  - the brand logo
  - a CSS-only hero (three tilted "post cards")
  - the headline and subline
  - the existing error message and in-app-browser notice
  - the **Masuk dengan Telegram** button (Telegram blue, paper-plane icon)
  - the consent line with **Syarat** and **Kebijakan Privasi** buttons
  - the dev-only login links
- **Legal sheets.** Each link opens its own `BottomSheet` (`LegalSheet`). Each sheet holds placeholder sections marked "Teks final dari legal", a "Terakhir diperbarui: [TANGGAL]" line, and a **Selesai** button that closes it.
  - The copy lives in one file, `lib/legal-placeholder.ts`, until legal delivers the text.
  - Concrete business values from the mock ("1 Koin = Rp1.000", "30 hari") are **left out**, because they are [TBD]. Only bracketed placeholders remain.
- **Signed-in redirect.** A streamed server component, `RedirectIfSignedIn`, reads the cookie through `getCurrentUser()`. If there is a user, it calls `redirect(safeReturnTo(returnTo))`.
  - `safeReturnTo` already maps `/login`, external URLs and junk to `/`, so the redirect can't loop or leave the site.
  - An API outage is treated as a guest, and the visitor stays on `/login`.
  - This is the same server-side pattern as `StudioGate`/`AdminGate`. A cookie-presence check in `proxy.ts` was rejected: once US-007 sends guests from `/` to `/login`, an expired cookie would bounce between the two pages forever.
- **Shared logo.** The logo mark and wordmark are extracted from `HomeTopBar` into `components/brand-logo.tsx`, so `/login` and the top bar render the same logo.

Decisions agreed with the user (2026-11-07):
- **Hero:** CSS-only cards (no image assets), decorative (`aria-hidden`).
- **Button colour:** a new `telegram` token, `#1A7DB0` with white text. White on `#1A7DB0` is about 4.56:1, which passes AA for normal text.
- **Legal:** two separate sheets, one per link, with no tabs.

## Dependencies

None new. The tools already in the repo are enough: `BottomSheet`, `Button`, `KoinIcon`, `lucide-react` (`Lock`, `Send`), `safeReturnTo` from `@influency/shared`, and `getCurrentUser`.

## Risks

- **The redirect streams.** `redirect()` inside `Suspense` after the shell has streamed becomes a client-side redirect, so a signed-in visitor may glimpse the login page for a moment. Accepted; it matches the studio and admin gates.
- **Short screens (320×568).** The hero height is clamped (`h-[clamp(12rem,38dvh,22rem)]`), so the button stays reachable. The page can still scroll (`min-h-dvh`), so nothing is cut off.
- **Placeholder legal text** must never look final. Every section body is bracketed, the sheet shows "Teks final dari legal", and the date reads `[TANGGAL]`.

---

## Tasks

### TASK-015: Telegram token, BrandLogo and legal placeholder sheets

1. **Token.** In `apps/web/src/app/globals.css`:
   - Under `:root`, add `--telegram: #1a7db0; /* "Masuk dengan Telegram" button only; white text 4.56:1 */` and `--telegram-foreground: #ffffff;`.
   - Under `@theme inline`, map `--color-telegram: var(--telegram);` and `--color-telegram-foreground: var(--telegram-foreground);`.
   - In `app/theme.test.ts`, add `telegram: '#1a7db0'` and `'telegram-foreground': '#ffffff'` to the expected tokens, and add `['telegram-foreground', 'telegram']` to the AA (≥ 4.5) pairs.
2. **`components/brand-logo.tsx`** (server-safe):
   ```tsx
   export function BrandLogo({ size = 'md' }: { size?: 'md' | 'lg' })
   ```
   - It renders the coral mark: a `bg-brand text-primary-foreground` rounded square holding the "i" SVG (moved from `HomeTopBar`).
   - Next to the mark is the lowercase `influency` wordmark, all `aria-hidden`. The wrapping link or heading provides the accessible name.
   - `md` keeps the top bar's sizes (mark `size-7`, text `text-[19px]`); `lg` is used on `/login` (mark `size-8`, text `text-[22px]`).
   - Replace the inline markup in `home-top-bar.tsx` with `<BrandLogo />`. The `HomeTopBar` tests stay unchanged.
3. **`lib/legal-placeholder.ts`**:
   ```ts
   /** shortcut: placeholder legal copy until legal delivers final text ([TBD]); replace the arrays and LEGAL_UPDATED_AT then. */
   export const LEGAL_UPDATED_AT = '[TANGGAL]';
   export type LegalDoc = { title: string; sections: readonly (readonly [heading: string, body: string])[] };
   export const TERMS: LegalDoc = { title: 'Syarat', sections: [...] };
   export const PRIVACY: LegalDoc = { title: 'Kebijakan Privasi', sections: [...] };
   ```
   - TERMS sections (Indonesian headings; every body in brackets):
     - Akun kamu: "[Kamu masuk dengan Telegram. Syarat usia, kelayakan dan tanggung jawab akun dari legal.]"
     - Koin dan pembayaran: "[Ketentuan top-up, nilai Koin, refund dan masa berlaku dari legal.]"
     - Konten premium dan langganan: "[Ketentuan akses post dan langganan dari legal.]"
     - Creator: "[Tanggung jawab creator, biaya dan aturan pencairan dari legal.]"
     - Aturan konten: "[Konten terlarang, pelaporan dan moderasi dari legal.]"
     - Penangguhan dan penutupan akun: "[Kapan akun dapat ditangguhkan atau ditutup, dan dampaknya pada Koin dan akses, dari legal.]"
     - Kontak: "[Nama perusahaan, alamat dan kontak dukungan.]"
   - PRIVACY sections:
     - Data yang kami kumpulkan: "[Dari Telegram: ID, nama, username dan foto profil. Di aplikasi: creator yang diikuti, post yang disimpan dan dibeli, komentar dan transaksi Koin. Daftar lengkap dari legal.]"
     - Cara kami menggunakannya: "[Tujuan dan dasar hukum dari legal.]"
     - Pembayaran dan pencairan: "[Penyedia pembayaran dan data yang mereka terima.]"
     - Berbagi data: "[Pihak penerima data, misalnya mitra pembayaran dan otoritas bila diwajibkan hukum.]"
     - Penyimpanan: "[Berapa lama data disimpan, termasuk komentar dan catatan transaksi.]"
     - Pilihan dan hakmu: "[Cara mengakses, mengoreksi, mengekspor atau menghapus data sesuai hukum Indonesia.]"
     - Kontak: "[Kontak perlindungan data.]"
4. **`app/(auth)/login/legal-sheet.tsx`** (`'use client'`):
   ```tsx
   export function LegalSheet({ doc }: { doc: LegalDoc })
   ```
   - `const [open, setOpen] = useState(false);`, then:
     ```tsx
     <BottomSheet open={open} onOpenChange={setOpen} title={doc.title}
       eyebrow="Teks final dari legal" description={`Terakhir diperbarui: ${LEGAL_UPDATED_AT}`}
       trigger={<button type="button" className="font-semibold text-primary-ink underline underline-offset-2 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{doc.title}</button>}>
     ```
   - The children are each section as `<section><h3 className="text-sm font-bold">{heading}</h3><p className="text-sm text-muted-foreground">{body}</p></section>`.
   - Then `<Button variant="secondary" size="lg" className="w-full" onClick={() => setOpen(false)}>Selesai</Button>`. The design's Selesai is dark, which is our `secondary`.
   - Inline text buttons are exempt from the 44 px minimum (WCAG 2.5.8 inline exception), the same as text links in a sentence.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/globals.css`, `app/theme.test.ts` | `telegram` token + AA check |
| CREATE | `apps/web/src/components/brand-logo.tsx` | shared logo |
| MODIFY | `apps/web/src/components/home-top-bar.tsx` | use BrandLogo |
| CREATE | `apps/web/src/lib/legal-placeholder.ts` | placeholder Syarat/Privasi |
| CREATE | `apps/web/src/app/(auth)/login/legal-sheet.tsx` (+ test) | one sheet per doc |

**Testing:**
- `theme.test.ts`: the token values, and `telegram-foreground` on `telegram` is at least 4.5.
- `legal-sheet.test.tsx` (`{ wrapper: Toaster }` is not needed; render directly):
  - Closed by default. Clicking "Syarat" opens a `dialog` named "Syarat", showing "Teks final dari legal", "Terakhir diperbarui: [TANGGAL]" and the first section heading.
  - "Selesai" closes it, and focus returns to the "Syarat" button.
  - With `PRIVACY`, clicking "Kebijakan Privasi" opens the dialog named "Kebijakan Privasi".
- `legal-placeholder` self-check (in the same test file): every section body in `TERMS` and `PRIVACY` starts with `[` and ends with `]`, and no body matches `/Rp\s?\d|\d+\s?hari/`. This guards against shipping TBD values as final.
- `home-top-bar.test.tsx` still passes, because the logo link label is unchanged.

---

### TASK-016: Login landing layout and signed-in redirect

1. **`app/(auth)/login/login-hero.tsx`** (server, `aria-hidden` root): `<div aria-hidden className="relative mx-auto h-[clamp(12rem,38dvh,22rem)] w-full max-w-88 overflow-hidden">`, holding three absolutely positioned cards. All of them use `rounded-[20px] shadow-lg`, with token gradients only:
   - **Left:** `left-[8%] top-[12%] h-[58%] w-[42%] -rotate-8 bg-linear-to-b from-accent to-brand/70`.
   - **Right:** `right-[8%] top-[4%] h-[58%] w-[42%] rotate-7 bg-linear-to-b from-koin-surface to-brand/50`. It carries a chip `absolute bottom-2.5 left-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white` reading "Video" (overlay colours are the allowed exception).
   - **Centre:** `left-1/2 top-[38%] h-[62%] w-[46%] -translate-x-1/2 rounded-[22px] bg-linear-to-b from-accent to-brand`. Inside it:
     - a blurred layer (`absolute -inset-5 blur-md bg-linear-to-b from-accent to-brand`)
     - a centred `Lock` icon in a `bg-black/40 text-white rounded-full size-10` circle
     - a Koin chip at the bottom (`bg-koin-surface text-koin-foreground border border-koin-border rounded-full px-2.5 h-7 text-xs font-bold`, holding `KoinIcon` + "5 Koin")
2. **`page.tsx` layout** (keep the existing Suspense'd `LoginError`, `TelegramStart` and `DevLogin` helpers):
   ```tsx
   <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-6 pt-6 pb-[calc(1.75rem+env(safe-area-inset-bottom))]">
     <Suspense fallback={null}><RedirectIfSignedIn searchParams={searchParams} /></Suspense>
     <BrandLogo size="lg" />
     <LoginHero />
     <div className="mt-auto flex flex-col gap-5">
       <div className="flex flex-col gap-2.5">
         <h1 className="text-[30px] leading-tight font-extrabold tracking-tight text-balance">Lebih dekat dengan creator favoritmu</h1>
         <p className="text-[15.5px] leading-relaxed text-muted-foreground">Ikuti creator, buka post premium, dan berlangganan dengan Koin, semua di satu tempat.</p>
       </div>
       <InAppBrowserNotice />
       <Suspense fallback={null}><LoginError … /></Suspense>
       <div className="flex flex-col gap-3">
         <Suspense fallback={<TelegramButton href={TELEGRAM_START} />}><TelegramStart … /></Suspense>
         <p className="text-center text-xs leading-relaxed text-muted-foreground">
           Dengan melanjutkan, kamu menyetujui <LegalSheet doc={TERMS} /> dan <LegalSheet doc={PRIVACY} />.
         </p>
       </div>
       {dev links block unchanged}
     </div>
   </main>
   ```
   - Wrap `BrandLogo` in `<p aria-label="Influency">` so it has an accessible name, since it is not a link here.
   - **`TelegramButton`:** `<Button asChild size="lg" className="w-full bg-telegram text-telegram-foreground hover:bg-telegram/90 gap-2.5">`, wrapping `<a href={href}><Send aria-hidden className="size-5" />Masuk dengan Telegram</a>`. It keeps the full navigation (not `<Link>`) and its comment.
   - **`RedirectIfSignedIn`:**
     ```tsx
     /** A signed-in visitor never sees the login page: back to returnTo (safeReturnTo maps /login and junk to /). */
     export async function RedirectIfSignedIn({ searchParams }: Pick<PageProps<'/login'>, 'searchParams'>) {
       const [{ returnTo }, user] = await Promise.all([searchParams, getCurrentUser().catch(() => null)]);
       if (user) redirect(safeReturnTo(returnTo));
       return null;
     }
     ```
     It imports `redirect` from `next/navigation` and `safeReturnTo` from `@influency/shared`. An outage is treated as a guest.
3. **Docs.**
   - `frontend.md` "Auth": add one line saying `/login` redirects signed-in users to `safeReturnTo(returnTo)` server-side, and that the `telegram` token is only for the Telegram login button.
   - `codebase-map.md` (updated at story completion):
     - the new `/login` description
     - `BrandLogo`, `LegalSheet` and `legal-placeholder.ts`
     - the `telegram` token

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/app/(auth)/login/login-hero.tsx` | CSS-only hero |
| MODIFY | `apps/web/src/app/(auth)/login/page.tsx` (+ `page.test.tsx`) | new layout, Telegram button, legal links, redirect |
| MODIFY | `.agile/guidelines/frontend.md` | redirect + token rule |

**Testing** (`page.test.tsx`; mock `@/lib/api/current-user` and `next/navigation` with `redirect` throwing `redirect:<url>`, plus `useRouter` for the sheets):
- With a pending `searchParams`, the page shows:
  - the h1 "Lebih dekat dengan creator favoritmu" and the subline text
  - "Masuk dengan Telegram" → `/api/v1/auth/telegram/start`
  - "Syarat" and "Kebijakan Privasi" buttons
  - no element outside `aria-hidden` for the hero (its root has `aria-hidden="true"`)
- `RedirectIfSignedIn` (call the async function directly):
  - guest (`null`) → returns `null`, with no redirect
  - an API outage (rejected) → `null`
  - user + `returnTo: '/ana/posts/1'` → throws `redirect:/ana/posts/1`
  - user + no `returnTo` → `redirect:/`
  - user + `returnTo: 'https://evil.example'` → `redirect:/`
  - user + `returnTo: '/login'` → `redirect:/`, so it never loops
- The existing `LoginErrorMessage`, `InAppBrowserNotice` and `DevLoginLinks` tests pass unchanged.
- `pnpm check` green, and `pnpm --filter @influency/web build` succeeds.
- Manual check at 320×568, 375, 390 and 430 px:
  - The button is visible without horizontal scroll, and the hero shrinks on short screens.
  - Each sheet opens, scrolls and closes with Selesai, swipe-down or Escape.
  - A signed-in visit to `/login?returnTo=/discover` lands on `/discover`.
