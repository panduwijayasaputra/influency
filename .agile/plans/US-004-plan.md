# Technical Plan: US-004 — Home Top Bar

## Architecture Overview

Web-only. No API or DB changes. The only shared change is adding `'notifications'` to `RESERVED_SLUGS`.

- **`HomeTopBar`** (`components/home-top-bar.tsx`, client) is rendered by the Home page only, in place of `PageHeader`.
  - **Logo** link to `/`: on tap, it scrolls to the top.
  - **Cari** link → `/discover`.
  - **Notifikasi** bell link → `/notifications`.
  - **Burger** link → `/me`.
- **Hide on scroll** follows the design artboard (`design/artboards/Home.dc.html`, `onScroll`): the bar is always shown within 56 px of the top; it hides after scrolling down more than 4 px and shows after scrolling up more than 4 px.
  - The rule is a pure function, `nextHidden`, so it can be unit-tested.
  - The bar is `sticky top-0` and slides with `-translate-y-full`. `motion-reduce:transition-none` makes it appear and disappear without animation.
  - Focus inside the bar shows it, so keyboard users never tab into an invisible bar.
- **`ComingSoon`** gets an optional `header` prop. When it is set, that header replaces `PageHeader`, and the title becomes an `sr-only` `<h1>`. Home passes `<HomeTopBar />`.
- **`/notifications`** is a new "Segera hadir" placeholder. It keeps the bottom nav, and no tab is active on it.

Decisions agreed with the user (2026-11-07):
- **Burger:** until the US-005 drawer exists, the burger is a plain link to `/me`, where the interim account menu lives. US-005 turns it into a button with `aria-expanded` that opens the drawer.
- **Unread dot:** the bell takes `hasUnread` (default `false`), and Home passes nothing. So no user sees a fake "new activity" dot. The dot is covered by a test that passes `true`.
- The design shows the bell and burger to signed-in users only. Home becomes signed-in only in US-007, so US-004 always shows all four controls.

## Dependencies

None new. `lucide-react` (`Search`, `Bell`, `Menu`) is already installed.

## Risks

- **Scroll source.** Pages scroll the window, because `<body>` is not a scroll container. The hook reads `window.scrollY` from a passive `scroll` listener and calls `setState` only when `hidden` changes, so it doesn't re-render on every scroll event.
- **iOS rubber-band.** Overscroll past the top gives a negative `scrollY`, and `y < 56` then shows the bar. Overscroll at the bottom bounces back and could flash the bar; the 4 px threshold dampens this. This is accepted, and it matches the design.
- **Hide on scroll is untestable on the placeholder.** Today's Beranda placeholder is not tall enough to scroll, so only unit tests cover the behaviour until the feed lands. UAT: check it on a tall page by temporarily zooming in, or after the feed exists.
- **Sticky + transform.** A transformed sticky element still sticks; the translate only moves it visually. Its in-flow 56 px space stays, which is what the design does with `padTop` at the very top.

---

## Tasks

### TASK-010: HomeTopBar with hide-on-scroll on Home

1. **`apps/web/src/components/home-top-bar.tsx`** (`'use client'`):
   ```ts
   export const SHOW_NEAR_TOP_PX = 56;
   export const SCROLL_DELTA_PX = 4;
   /** Design rule: always shown near the top; hides on scroll down, shows on scroll up (ignoring jitter ≤ 4 px). */
   export function nextHidden(hidden: boolean, y: number, dy: number): boolean {
     if (y < SHOW_NEAR_TOP_PX) return false;
     if (dy > SCROLL_DELTA_PX) return true;
     if (dy < -SCROLL_DELTA_PX) return false;
     return hidden;
   }
   export function HomeTopBar({ hasUnread = false }: { hasUnread?: boolean })
   ```
   - **State:** `const [hidden, setHidden] = useState(false)`, plus `lastY = useRef(0)`.
   - **Scroll listener:** in `useEffect`, add `window.addEventListener('scroll', onScroll, { passive: true })`, where `onScroll` does `const y = window.scrollY; const dy = y - lastY.current; lastY.current = y; setHidden((h) => nextHidden(h, y, dy));`. React bails out when the value is unchanged. Clean up on unmount.
   - **Container:**
     ```tsx
     <header data-hidden={hidden} onFocusCapture={() => setHidden(false)}
       className="sticky top-0 z-30 border-b bg-card transition-transform duration-200 ease-out motion-reduce:transition-none data-[hidden=true]:-translate-y-full">
     ```
     The inner wrapper is `mx-auto flex h-14 w-full max-w-feed items-center justify-between pr-1.5 pl-3.5` (the design pads 14 px left and 6 px right).
   - **Logo:** `<Link href="/" aria-label="Influency, ke atas Beranda" onClick={toTop} className="flex h-11 items-center gap-2 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">`.
     - Mark: `<span aria-hidden className="flex size-7 items-center justify-center rounded-[9px] bg-brand text-primary-foreground">`, holding an inline SVG of the design's "i" glyph: `viewBox 0 0 24 24`, `stroke="currentColor"`, `stroke-width 3`, `<path d="M12 11v8"/>` plus `<circle cx="12" cy="5.5" r="1.6" fill="currentColor" stroke="none"/>`, at `size-4`.
     - Wordmark: `<span aria-hidden className="text-[19px] font-extrabold tracking-tight">influency</span>`, lowercase as in the design.
     - `toTop(e)`: `e.preventDefault(); window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });`. The bar only renders on Home, so tapping it always means "scroll to top". The `href` still works without JS.
   - **Right group:** `<div className="flex items-center gap-0.5">`. Each control is a `Link` with `ICON_CLASS = 'relative flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'` and an `aria-hidden` lucide icon at `size-5.5`:
     - `href="/discover" aria-label="Cari"`, icon `Search`.
     - `href="/notifications"`, icon `Bell`. Its `aria-label` is `hasUnread ? 'Notifikasi, ada aktivitas baru' : 'Notifikasi'`. When `hasUnread`, add `<span aria-hidden data-testid="unread-dot" className="absolute top-2.5 right-2.5 size-2 rounded-full border-2 border-card bg-primary" />` (`primary` is primary.strong, as in the design dot).
     - `href="/me" aria-label="Buka menu akun"`, icon `Menu`. Comment: `// shortcut: links to /me until US-005's drawer; becomes a button with aria-expanded then.`
2. **`ComingSoon`** (`components/coming-soon.tsx`): add the prop `header?: ReactNode`.
   - Render `{header ?? <PageHeader title={title} asHeading />}`.
   - Inside `<main>`, before the pill, render `{header && <h1 className="sr-only">{title}</h1>}`, so the page keeps exactly one `<h1>`.
3. **Home** (`app/page.tsx`): `<ComingSoon title="Beranda" description="…" header={<HomeTopBar />} />`. Keep the existing description and metadata.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/home-top-bar.tsx` | top bar, `nextHidden`, scroll listener |
| CREATE | `apps/web/src/components/home-top-bar.test.tsx` | rule, links, labels, dot, scroll, focus, logo |
| MODIFY | `apps/web/src/components/coming-soon.tsx` (+ test) | optional `header`, sr-only h1 |
| MODIFY | `apps/web/src/app/page.tsx`, `page.test.tsx` | Home uses HomeTopBar |

**Testing** (Vitest + Testing Library):
- `nextHidden` table (`it.each`):
  - `(false, 10, 30)` → false, because it is near the top.
  - `(true, 40, -1)` → false, near the top.
  - `(false, 200, 5)` → true.
  - `(true, 200, -5)` → false.
  - `(true, 200, 3)` → true (jitter keeps the state).
  - `(false, 200, -3)` → false.
- `HomeTopBar` render:
  - The links in order are: logo `/` ("Influency, ke atas Beranda"), Cari `/discover`, Notifikasi `/notifications`, Buka menu akun `/me`.
  - By default there is no `unread-dot` and the label is plain "Notifikasi". With `hasUnread`, the dot shows and the label is "Notifikasi, ada aktivitas baru".
- Scroll: set `window.scrollY` with `Object.defineProperty(window, 'scrollY', { value, configurable: true })` and fire `scroll` inside `act`.
  - 0 → 300 gives `data-hidden="true"`.
  - 300 → 290 gives `"false"`.
  - 300 → 302 keeps the previous value.
  - Back to 20 gives `"false"`.
- Focus: while hidden, `focus()` on the Cari link sets `data-hidden="false"`.
- Logo: mock `window.scrollTo` and `window.matchMedia` (returning `{ matches: true }`). A click calls `scrollTo({ top: 0, behavior: 'auto' })`.
- `coming-soon.test.tsx`: with `header={<div>Bar</div>}`, "Bar" renders, the sr-only `h1` is the title, and there is no "Kembali"/PageHeader `<header>` from `PageHeader`.
- `app/page.test.tsx`: the h1 is "Beranda", the `Cari` link is present, and "Segera hadir" is shown.

---

### TASK-011: `/notifications` placeholder, reserved slug and guidelines

1. **Reserved slug.** In `packages/shared/src/creators.ts`, append `'notifications'` to `RESERVED_SLUGS`. `creators.test.ts` covers it through the existing `it.each`.
   - Rebuild shared: `pnpm --filter @influency/shared build`.
2. **Page.** Create `apps/web/src/app/(public)/notifications/page.tsx`:
   ```tsx
   export const metadata = { title: 'Notifikasi' };
   export default function Page() {
     return <ComingSoon title="Notifikasi" description="Kabar terbaru dari creator yang kamu ikuti dan aktivitas akunmu akan muncul di sini." />;
   }
   ```
   It keeps the bottom nav, because it is not in `STANDALONE_PREFIXES`.
3. **Docs.** Add `notifications` to the reserved lists in `CLAUDE.md` and `.agile/guidelines/frontend.md`.
   - `frontend.md` "App shell": add one line saying Home uses `HomeTopBar` (passed as `ComingSoon`'s `header` until the feed lands) instead of `PageHeader`, and that it is the only page with it.
   - `codebase-map.md` (updated by `/dev-team` at story completion):
     - `home-top-bar.tsx` (HomeTopBar, `nextHidden`)
     - the `/notifications` route
     - the reserved `notifications` slug
     - a note on the `/` row that Home shows the top bar

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/creators.ts` | reserve `notifications` |
| CREATE | `apps/web/src/app/(public)/notifications/page.tsx` | placeholder |
| MODIFY | `CLAUDE.md`, `.agile/guidelines/frontend.md` | reserved list + Home top bar rule |

**Testing:**
- `creators.test.ts` passes with `notifications` through the existing `it.each`.
- `pnpm check` is green, and `pnpm --filter @influency/web build` lists `/notifications`.
- Manual check at 320, 375, 390 and 430 px:
  - On Home, the bar fits with no horizontal scroll.
  - Each control is a 44 px target, and the bell link opens the placeholder with the bottom nav.
