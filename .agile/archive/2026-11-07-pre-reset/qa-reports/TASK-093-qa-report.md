# QA Report: TASK-093 — Theme tokens and app-wide font

**Story:** US-053 Light Social Design Tokens
**Date:** 2026-11-04
**Verdict:** PASS

## Scope reviewed

- `apps/web/src/app/globals.css`: DRAFT palette in `:root` (hex, one place, commented); `--koin`, `--koin-foreground`, `--success`, `--feed-max-width` added; `@theme inline` exposes `bg-koin`, `text-koin-foreground`, `text-success`, `max-w-feed`, `font-sans`.
- `apps/web/src/app/fonts.ts` + `layout.tsx`: Plus Jakarta Sans exposed as `--font-jakarta` and applied on `<html>` via `font-sans`; the per-page `jakarta.className` was removed from the creator page (and its test mock).
- Hard-coded colours replaced: `koin.tsx`, `subscribe-card.tsx` (amber/neutral → koin tokens), creator `page.tsx` (`ring-amber-400` → `ring-primary`), `post-grid.tsx` (`text-green-700` → `text-success`).
- `apps/web/src/app/theme.test.ts` (new).

## Findings fixed during QA

With the old near-black `--primary`, `text-primary` was readable. Coral as small body text is 2.6:1 on white and fails AA. Fixed:
- post page "Konten premium" badge: `bg-primary/10 text-primary` → `bg-accent text-accent-foreground`
- comments "load more" link: `text-primary` → `text-foreground` + underline on hover
- `Button` `link` variant: `text-primary` → `text-foreground underline`
- subscribe card body text: `opacity-80` charcoal on coral (about 3.9:1) → full charcoal (about 5.4:1)

Coral is kept for fills with charcoal text (default button, active tab, avatar fallback, subscribe card), icons (liked heart), rings and the banner gradient.

## Remaining hard-coded colours (intentional)

`bg-black/xx` + `text-white` overlays in `post-grid.tsx` and `post-media-viewer.tsx` sit on media, not on the theme. `text-white` on `bg-destructive` is about 4.6:1.

## Verification

- `pnpm check`: format, lint, typecheck and all tests green (shared 202, web 243, api 617).
- `theme.test.ts`: token values match the spec; 13 foreground/background pairs reach at least 4.5:1; white-on-coral is asserted below 3:1.
- `pnpm --filter @influency/web build` succeeded. The compiled CSS contains `.bg-koin`, `.text-koin-foreground`, `.text-success`, `.ring-primary`; `font-sans` resolves to `var(--font-jakarta)` = "Plus Jakarta Sans".
- Security, isolation and financial checks: N/A (styling only; no data, auth or money paths touched).

## Not covered

Visual check in a real browser (left to UAT). The `.dark` palette is unchanged; dark mode isn't in scope.


## Palette update (2026-11-04)

The user swapped the DRAFT colours for the **PetalSkull "Skeleton Lady"** reference, still as a light theme (spec §1.1/§1.2 updated): primary Dusty Rose `#C7767E`, canvas Bone Ivory `#EEE7DC`, surface `#FBF8F3`, text Soft Charcoal `#232021`, accent Blush Petal `#F2C9CB`, secondary Charcoal Midnight `#26344F` (ivory text), muted `#E4DCCF` / `#55504F`, Koin muted gold `#D9A654`, success `#166534` (`#15803D` was only 4.1:1 on ivory). The token names and rules above are unchanged. Wherever this document says "coral", read dusty rose. `theme.test.ts` now asserts the new values plus `secondary-foreground` on `secondary` (16 tests).
Re-verified: `pnpm check` green (web 253 tests); `/claudiandreya` and the post page show no horizontal scroll at 320–1280 px; screenshot at 375 px checked.


## Redesign to dark mode (2026-11-04, later the same day)

Per the user, the app is now **dark-only**, following a dark app reference with a lemon-yellow accent. This supersedes both the coral and PetalSkull palettes (spec §1.1/§1.2 updated; story renamed "Dark Social Design Tokens"). Values: canvas `#121212`, card/popover `#232323`, text `#F5F5F5`, muted `#2C2C2C` / `#A3A3A3`, primary `#F8F43C` (near-black text), secondary white pill `#F5F5F5`, border `#2E2E2E`, input `#333333`, Koin `#F8F43C`, success `#4ADE80`, destructive `#FF6467`, `--radius` 0.75rem. The unused `.dark` block was deleted; `<html>` gets the `dark` class plus `color-scheme: dark`. Component changes: `Button` is `rounded-full`; the subscribe card is a bordered `bg-card` with the yellow Koin CTA (yellow on yellow would vanish); the active post-grid filter is a white `secondary` pill and inactive filters use `bg-muted`. `theme.test.ts` adds destructive and primary pairs on canvas and card (all pass AA).
