# Technical Plan: US-003 — App Shell & 4-Tab Bottom Nav

## Architecture Overview

Web-only. No API or DB changes. The only shared change is adding `'me'` to `RESERVED_SLUGS`.

- **`AppChrome`** (`components/app-chrome.tsx`, client) is mounted once in the root layout, replacing `SiteHeader`.
  - It reads `usePathname()` and hides the bottom nav on a **standalone denylist** of path prefixes: `/login`, `/studio`, `/admin`, `/become-creator`. Every other route, including new ones, gets the nav by default.
  - When the nav is visible, it also renders an in-flow **spacer** (`h-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))]`) at the end of `<body>`'s flex column, so no page needs its own bottom padding.
  - It also runs the **in-app navigation tracker**, which feeds `PageHeader`'s back button.
- **`BottomNav`** (`components/bottom-nav.tsx`, rewritten) has four tabs: Beranda `/` · Jelajahi `/discover` · Dompet `/wallet` · Profil `/me`.
  - The active tab gets `aria-current="page"`, coral (`text-brand`) icon/label and a coral top indicator.
  - Beranda matches only `/`. The other tabs match their prefix. A creator profile marks no tab.
- **`PageHeader`** (`components/page-header.tsx`, client): a sticky, simple top bar with an optional back button and a title.
  - The back button shows only after an in-app navigation in this tab session, and calls `router.back()`.
  - Otherwise, an optional `fallbackHref` renders a plain back link. Otherwise there is no back button. So a guest opening a bio link directly sees no back button.
- **Placeholders.** `ComingSoon` is restyled onto `PageHeader` and no longer mounts its own nav. Beranda `/` and the new `/me` (Profil) use it.
  - `/me` also hosts the **interim account entry** (the existing `UserMenu`: Masuk for guests, `AccountMenu` with Keluar for signed-in users) until US-005's drawer replaces it.
- **`SiteHeader` is deleted.** `UserMenu` moves to `components/user-menu.tsx`. The old `/account` profile placeholder is deleted (`/me` replaces it). `/account/settings` stays. `account` stays reserved.

Decisions agreed with the user (2026-11-07):
- Pathname denylist rather than an `(app)` route group, so there are no file moves.
- Interim account menu on the `/me` placeholder.
- `/become-creator` is standalone (no nav).
- Studio and admin layouts get a `PageHeader` ("Studio"/"Admin", fallback `/`). Page `<h1>`s stay as they are.

## Dependencies

None new. `lucide-react` icons (`House`, `Compass`, `Wallet`, `UserRound`, `ArrowLeft`) and `next/navigation` (`usePathname`, `useRouter`) are already available.

## Risks

- **`usePathname` + `cacheComponents`.** Per `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md`, it suspends on routes with unknown dynamic params (`[creatorSlug]`, `studio/posts/[postId]`). Without a `Suspense` the build fails.
  - Mitigation: the root layout wraps `<AppChrome />` in `<Suspense fallback={null}>`, and `PageHeader` (which uses `useRouter` only, not `usePathname`) needs none.
  - Verify with `pnpm --filter @influency/web build`.
- **Back after returning to the landing page.** A guest lands on `/ana`, opens a post (the flag turns true) and goes back to `/ana`. `/ana` now shows a back button that would leave the site.
  - Accepted. Add the comment `// shortcut: one-way "has navigated" flag, so back can leave the site after returning to the landing page; track history depth if users hit it.`
- **Hydration.** The tracker flag is client-only. `PageHeader` reads it via `useSyncExternalStore` with server snapshot `false`, so the SSR HTML never has the back button and there's no mismatch.
- **Toast offset on standalone pages.** Toasts still float `--bottom-nav-height` above the bottom edge where there is no nav. This was already accepted in US-002 and is left as is.
- **Logout reachability.** Between US-003 and US-005, logout lives only on `/me`. This is called out in the PR description.

---

## Tasks

### TASK-007: Bottom nav, AppChrome shell and `me` reserved slug

Build the shell and swap it into the root layout.

1. **Reserved slug.** In `packages/shared/src/creators.ts` add `'me'` to `RESERVED_SLUGS`. `creators.test.ts` already iterates over the list.
   - Note: `SLUG_PATTERN` needs 3+ chars, so `me` can never be a slug anyway. It is added for the shared list's completeness, as the AC requires.
   - Rebuild shared: `pnpm --filter @influency/shared build`.
2. **In-app history store** in `apps/web/src/lib/in-app-history.ts`, about 20 lines:
   ```ts
   let navigated = false;
   const listeners = new Set<() => void>();
   export function markInAppNavigation(): void { if (!navigated) { navigated = true; listeners.forEach((l) => l()); } }
   export function subscribeInAppHistory(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
   export function hasInAppHistory(): boolean { return navigated; }
   /** test-only */ export function resetInAppHistory(): void { navigated = false; }
   ```
   - Put the `shortcut:` comment from Risks on `navigated`.
3. **`BottomNav`.** Rewrite `apps/web/src/components/bottom-nav.tsx`:
   - `export const TABS = [{ href: '/', label: 'Beranda', Icon: House }, { href: '/discover', label: 'Jelajahi', Icon: Compass }, { href: '/wallet', label: 'Dompet', Icon: Wallet }, { href: '/me', label: 'Profil', Icon: UserRound }] as const;`
   - `export function isTabActive(href: string, pathname: string): boolean`. It returns `pathname === '/'` for `'/'`, and otherwise `pathname === href || pathname.startsWith(href + '/')`.
   - `export function BottomNav({ pathname }: { pathname: string })` is a presentational server-safe component; it takes the pathname as a prop.
   - Keep the existing container: `fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]`, with the inner `ul` at `mx-auto grid h-(--bottom-nav-height) max-w-feed grid-cols-4`.
   - Links keep a ≥44 px tap target (full cell height).
   - Active state: `aria-current="page"`, label and icon `text-brand` (coral is allowed for active indicators per US-001), plus a 2 px coral bar at the top of the cell (`before:` pseudo or an absolutely positioned span).
   - Inactive tabs stay `text-muted-foreground`.
4. **`AppChrome`** (`apps/web/src/components/app-chrome.tsx`, `'use client'`):
   ```ts
   export const STANDALONE_PREFIXES = ['/login', '/studio', '/admin', '/become-creator'] as const;
   export function isStandalone(pathname: string): boolean // exact match or prefix + '/'
   export function AppChrome() {
     const pathname = usePathname();
     const first = useRef(pathname);
     useEffect(() => { if (pathname !== first.current) markInAppNavigation(); }, [pathname]);
     if (isStandalone(pathname)) return null;
     return (<><div aria-hidden className="h-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] shrink-0" /><BottomNav pathname={pathname} /></>);
   }
   ```
   - `onboarding` from the AC doesn't exist yet. Add a one-line comment that its route goes into `STANDALONE_PREFIXES` when it lands.
5. **Root layout** (`apps/web/src/app/layout.tsx`):
   - Remove `SiteHeader`.
   - Render `{children}` and then `<Suspense fallback={null}><AppChrome /></Suspense>` inside `<Toaster>`. Comment: `usePathname suspends on unknown dynamic params under cacheComponents`.
   - `--bottom-nav-height` stays as defined in `globals.css` (US-002 contract). Update its comment to say AppChrome uses it.
6. **Remove ad-hoc nav and padding.**
   - `app/(public)/[creatorSlug]/page.tsx`: drop the `BottomNav` import/mount and the `pb-28` (use `pb-6`).
   - `components/coming-soon.tsx`: drop the `BottomNav` mount and `pb-28` (fully restyled in TASK-008; here, only enough to compile).
   - `[creatorSlug]/page.test.tsx`: drop any assertion on the nav inside the page. The nav is now covered by the AppChrome tests.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/creators.ts` | add `'me'` to `RESERVED_SLUGS` |
| CREATE | `apps/web/src/lib/in-app-history.ts` | one-way "navigated in app" store |
| CREATE | `apps/web/src/lib/in-app-history.test.ts` | store behaviour |
| MODIFY | `apps/web/src/components/bottom-nav.tsx` | 4 tabs, active state, `isTabActive` |
| CREATE | `apps/web/src/components/bottom-nav.test.tsx` | tabs/order/active |
| CREATE | `apps/web/src/components/app-chrome.tsx` | denylist, spacer, tracker |
| CREATE | `apps/web/src/components/app-chrome.test.tsx` | visibility + tracker |
| MODIFY | `apps/web/src/app/layout.tsx` | mount AppChrome in Suspense, drop SiteHeader |
| MODIFY | `apps/web/src/app/globals.css` | comment only |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.tsx` (+ test) | remove own BottomNav and `pb-28` |
| MODIFY | `apps/web/src/components/coming-soon.tsx` | remove own BottomNav |

**Testing** (Vitest + Testing Library; mock `next/navigation` `usePathname`):
- `bottom-nav.test.tsx`:
  - It renders exactly 4 links in order: Beranda `/`, Jelajahi `/discover`, Dompet `/wallet`, Profil `/me`, each with a visible label and inside `nav[aria-label="Navigasi utama"]`.
  - `aria-current="page"` is set on Beranda only for `/`. Dompet is current for `/wallet` and `/wallet/topups/x`. No tab is current for `/ana` or `/ana/posts/1`. Profil is current for `/me`. `/meow` doesn't match Profil.
- `app-chrome.test.tsx`:
  - The nav and spacer render for `/`, `/discover`, `/ana`, `/ana/posts/p1` and `/me`.
  - It renders nothing for `/login`, `/studio`, `/studio/posts/new`, `/admin/creators` and `/become-creator`. `/login-help` style paths are not treated as standalone (exact or `prefix/` match only).
  - The tracker: the first render doesn't mark navigation, and a rerender with a new pathname calls `markInAppNavigation` (assert `hasInAppHistory()` is true; `resetInAppHistory()` in `beforeEach`).
- `in-app-history.test.ts`: subscribers are notified once, and `hasInAppHistory` flips.
- `packages/shared` `creators.test.ts` passes with `me` (via the existing `it.each`).
- `pnpm --filter @influency/web build` succeeds (this catches the `usePathname`/Suspense prerender failure).

---

### TASK-008: PageHeader, restyled ComingSoon, Beranda and `/me` placeholders

1. **`PageHeader`** (`apps/web/src/components/page-header.tsx`, `'use client'`):
   ```ts
   type Props = { title: string; fallbackHref?: string; asHeading?: boolean };
   export function PageHeader({ title, fallbackHref, asHeading = false }: Props)
   ```
   - `const inApp = useSyncExternalStore(subscribeInAppHistory, hasInAppHistory, () => false);`
   - Back control:
     - If `inApp`, show `<button aria-label="Kembali" onClick={() => router.back()}>`.
     - Else if `fallbackHref`, show `<Link href={fallbackHref} aria-label="Kembali">`.
     - Otherwise show none.
     - Either way: `ArrowLeft` icon, `size-11` tap target, `rounded-full`, `focus-visible:ring-2 focus-visible:ring-ring`.
   - Title: `<h1>` when `asHeading`, otherwise `<p>`, using `truncate text-base font-bold`.
   - Container: `<header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">` with an inner `mx-auto flex h-14 w-full max-w-feed items-center gap-1 px-2`. When there is no back button, pad the title with `pl-4` so it aligns with the 16 px gutter.
   - The root `<body>` already has `pt-[env(safe-area-inset-top)]`, so the header needs no extra top inset.
2. **`ComingSoon`.** Rewrite `apps/web/src/components/coming-soon.tsx`:
   - `ComingSoon({ title, description, children }: { title: string; description: string; children?: ReactNode })`.
   - It renders `<PageHeader title={title} asHeading />` and then `<main className="mx-auto flex w-full max-w-feed flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">`, containing:
     - the "Segera hadir" pill in the new style (`rounded-full bg-accent px-3 py-1 text-xs font-bold text-primary-ink`; `accent` is primary.soft `#FFE8E2` in `globals.css`)
     - the description (`text-muted-foreground`)
     - `{children}`
   - Remove the "Kembali ke beranda" button, because the bottom nav covers it.
   - The existing callers (discover, wallet, library, subscriptions, account/settings, studio/earnings) keep working unchanged.
3. **Beranda.** Replace `apps/web/src/app/page.tsx` with `<ComingSoon title="Beranda" description="Feed dari creator yang kamu ikuti akan muncul di sini." />`, plus `metadata = { title: 'Beranda' }`.
   - The guest redirect is US-007, and the top bar is US-004. Don't add them here.
4. **`/me` (Profil).** Create `apps/web/src/app/(public)/me/page.tsx`:
   - It renders `<ComingSoon title="Profil" description="Foto, nama dan akun Telegram yang terhubung akan muncul di sini.">`, with this as children: `<Suspense fallback={null}><UserMenu /></Suspense>` (comment: `interim account entry until the US-005 drawer`).
   - Use `metadata = { title: 'Profil' }`.
5. **`UserMenu` move.** Move `UserMenu` from `components/site-header.tsx` to `components/user-menu.tsx` unchanged: the API-outage fallback to Masuk, `KoinBalance` and `AccountMenu`.
   - Move `site-header.test.tsx` → `user-menu.test.tsx` (only the import path changes).
   - Delete `site-header.tsx` and `site-header.test.tsx`.
6. **`/account` → `/me`.**
   - Delete `app/(subscriber)/account/page.tsx` and keep `account/settings/page.tsx`.
   - In `components/account-menu.tsx`, change the non-creator Profil link from `/account` to `/me`, and update `account-menu.test.tsx`'s expected `['Profil', '/account']` → `['Profil', '/me']`.
7. **Home test.** Update `apps/web/src/app/page.test.tsx`: the h1 is "Beranda" and "Segera hadir" is visible.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/page-header.tsx` | title bar + conditional back |
| CREATE | `apps/web/src/components/page-header.test.tsx` | back-button rules |
| MODIFY | `apps/web/src/components/coming-soon.tsx` | Light Social placeholder on PageHeader |
| CREATE | `apps/web/src/components/coming-soon.test.tsx` | h1 + pill + children |
| MODIFY | `apps/web/src/app/page.tsx`, `page.test.tsx` | Beranda placeholder |
| CREATE | `apps/web/src/app/(public)/me/page.tsx` | Profil placeholder + interim UserMenu |
| CREATE | `apps/web/src/components/user-menu.tsx` | moved `UserMenu` |
| MOVE | `components/site-header.test.tsx` → `components/user-menu.test.tsx` | import path |
| DELETE | `apps/web/src/components/site-header.tsx` | replaced by AppChrome/PageHeader |
| DELETE | `apps/web/src/app/(subscriber)/account/page.tsx` | replaced by `/me` |
| MODIFY | `apps/web/src/components/account-menu.tsx` (+ test) | Profil → `/me` |

**Testing:**
- `page-header.test.tsx` (mock `next/navigation` `useRouter` → `{ back: vi.fn() }`, `resetInAppHistory()` in `beforeEach`):
  - With no history and no fallback, there is no "Kembali" control.
  - With no history and `fallbackHref="/ana"`, "Kembali" is a link to `/ana`.
  - After `markInAppNavigation()` (inside `act`), "Kembali" is a button, and clicking it calls `router.back()`. This also covers the case where the flag flips after mount (subscription re-render).
  - With `asHeading`, the title is an `h1`. Without it, there is no heading role.
- `coming-soon.test.tsx`: the h1 is the title, "Segera hadir" is shown and children render.
- `user-menu.test.tsx`: the existing three cases pass after the move.
- `account-menu.test.tsx`: Profil → `/me` for non-creators.

---

### TASK-009: PageHeader on existing pages, standalone headers and guidelines

Roll `PageHeader` out to the remaining non-Home pages that lost `SiteHeader`, and document the shell.

1. **Creator profile** `app/(public)/[creatorSlug]/page.tsx`: render `<PageHeader title={creator.displayName} />` above `<main>` (not a heading, since the profile already has the name `<h1>`).
   - A guest arriving from a bio link sees only the title, and a back button appears after in-app navigation.
   - Wrap both in a fragment. Keep everything else; the creator-profile feature redesigns the page later.
2. **Post detail** `app/(public)/[creatorSlug]/posts/[postId]/page.tsx`: replace the inline `ArrowLeft` back `Link` with `<PageHeader title="Postingan" fallbackHref={`/${creator.slug}`} />` above `<main>`.
   - Change `py-6 pb-12` to `py-4`, because the spacer handles the bottom.
   - Remove the now-unused `ArrowLeft`/`Link` imports if nothing else uses them.
   - Update `page.test.tsx` where it asserted the creator back link: now the "Kembali" link points to `/${slug}`.
3. **Become creator** `app/(subscriber)/become-creator/page.tsx`: render `<PageHeader title="Jadi Kreator" fallbackHref="/me" asHeading />` and drop the page's own `<h1>`.
4. **Studio and Admin layouts** (`app/studio/layout.tsx`, `app/admin/layout.tsx`): render `<PageHeader title="Studio" fallbackHref="/" />` / `<PageHeader title="Admin" fallbackHref="/" />` before the existing `<Suspense>`/gate. Page `<h1>`s stay as they are.
   - Check `studio-gate.test.tsx`/`admin-gate.test.tsx` still pass; they render the gate, not the layout.
5. **Guidelines.**
   - `.agile/guidelines/frontend.md`: add a short "App shell" section. It covers:
     - `AppChrome` in the root layout owns the bottom nav and the bottom spacer, so pages must not add nav padding or mount `BottomNav`.
     - Standalone routes are listed in `STANDALONE_PREFIXES`; add new standalone routes there.
     - Non-Home pages start with `PageHeader`, using `asHeading` only when the page has no other `<h1>`.
     - Placeholders use `ComingSoon`.
     - Remove or replace any mention of `SiteHeader`.
   - `.agile/guidelines/codebase-map.md`: replace the `SiteHeader`/`site-header.tsx` mentions with `AppChrome`, `BottomNav`, `PageHeader`, `UserMenu` (`user-menu.tsx`) and `ComingSoon`. Add `/me` to the routes and `me` to the reserved-slug list.
6. **Manual check** (no Playwright in the repo yet): at 320, 375, 390 and 430 px, `/`, `/discover`, `/wallet`, `/me`, a creator page and a post page show the nav with the correct active tab and nothing hidden behind it, with no horizontal scroll. `/login`, `/studio`, `/admin` and `/become-creator` show no nav. Run `pnpm check`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.tsx` (+ test) | PageHeader |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.tsx` (+ test) | PageHeader with fallback to creator |
| MODIFY | `apps/web/src/app/(subscriber)/become-creator/page.tsx` | standalone PageHeader |
| MODIFY | `apps/web/src/app/studio/layout.tsx` | PageHeader "Studio" |
| MODIFY | `apps/web/src/app/admin/layout.tsx` | PageHeader "Admin" |
| MODIFY | `.agile/guidelines/frontend.md` | App shell rules |
| MODIFY | `.agile/guidelines/codebase-map.md` | shell components, `/me`, reserved `me` |

**Testing:**
- Post detail `page.test.tsx`: the "Kembali" link points to `/${slug}` for a direct visit (no in-app history).
- Creator page `page.test.tsx`: a header title with the display name, the `<h1>` is still the display name, and there is no "Kembali" on a direct visit.
- `become-creator.test.tsx` and the existing studio/admin gate tests still pass.
- `pnpm check` is green, `pnpm --filter @influency/web build` succeeds, and the manual width check is done.
