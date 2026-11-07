# Technical Plan: US-053 — Light Social Design Tokens

## Architecture Overview

Re-skin the existing shadcn/Tailwind v4 theme instead of adding a parallel token system. All DRAFT colours live once, as CSS variables in `:root` of `apps/web/src/app/globals.css`, mapped onto the shadcn variables every component already uses (`bg-primary`, `bg-background`, `text-foreground`, …). New semantic tokens (`--koin`, `--success`, `--feed-max-width`) are added next to them and exposed through `@theme inline`, so Tailwind gives you `bg-koin`, `text-success` and `max-w-feed`.

Decisions agreed with the user (2026-11-04):
- **Coral contrast:** white on `#EF8176` is 2.8:1 and fails AA. Coral fills carry **charcoal** text (`--primary-foreground: #25262B`, about 5.4:1). Coral is never used for body text on light backgrounds.
- **Font:** Plus Jakarta Sans (already in `apps/web/src/app/fonts.ts`), applied app-wide on `<html>`.
- **Tap targets:** raise the shared `Button`/`Input` sizes to at least 44 px **everywhere** (admin/studio included), so call sites don't change.
- **No horizontal scroll** at 320/375/390/430 px is verified by a **manual QA checklist** (devtools), with no Playwright dependency.

Out of scope (owned by US-054 App Shell): bottom nav, top navbar behaviour, padding content below the bars. The `.dark` palette stays untouched because dark mode isn't in scope.

## Dependencies

None new. Uses `next/font/google` (already used), Tailwind v4 `@theme inline`, and Vitest.

## Risks

- **Muted text contrast on `#FAFAFA`:** the stock `--muted-foreground` (oklch 0.556, about #737373) is borderline 4.5:1. Mitigation: set it to a charcoal-tinted grey that passes. The contrast test fails if it doesn't.
- **Denser admin/studio screens get taller controls:** accepted by the user.
- **Snapshot/class assertions in existing tests** (e.g. `page.test.tsx` mocks `@/app/fonts`) may break when the font moves to the layout. Update those tests and don't delete them.

## Tasks

### TASK-093: Theme tokens and app-wide font

**What to build**

1. In `apps/web/src/app/globals.css`, replace the light `:root` values with the DRAFT palette, written as hex so they match the spec and are changeable in one place. Add a comment that marks the block as DRAFT (spec §1.2):
   - `--background: #FAFAFA` (canvas)
   - `--foreground: #25262B` (charcoal); also `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--accent-foreground`
   - `--card: #FFFFFF`, `--popover: #FFFFFF` (surface)
   - `--primary: #EF8176` (warm coral), `--primary-foreground: #25262B`
   - `--accent: #FFE8E2` (pale coral); `--secondary` and `--muted` stay neutral light greys
   - `--muted-foreground`: a grey that reaches at least 4.5:1 on both `#FAFAFA` and `#FFE8E2` (e.g. `#62636A`)
   - `--ring: #EF8176`
   - new `--koin: #E9AD56`, `--koin-foreground: #25262B`
   - new `--success: #15803D` (replaces `text-green-700`)
   - new `--feed-max-width: 34rem` (544 px, inside the 480–560 band)
   - `--sidebar*` / `--chart*`: leave as they are (unused by the public UI)

   Add to `@theme inline`: `--color-koin`, `--color-koin-foreground`, `--color-success`, `--container-feed: var(--feed-max-width)` (this gives Tailwind `max-w-feed`). Also add `--font-sans: var(--font-jakarta), ui-sans-serif, system-ui, sans-serif`.

2. In `apps/web/src/app/fonts.ts`, add `variable: '--font-jakarta'` to the `Plus_Jakarta_Sans` call.

3. In `apps/web/src/app/layout.tsx`, set `<html className={`${jakarta.variable} h-full font-sans antialiased`}>`. Remove `jakarta.className` from `apps/web/src/app/(public)/[creatorSlug]/page.tsx` and drop the `@/app/fonts` mock in its test if it's no longer needed.

4. Replace the hard-coded colours with tokens:
   - `apps/web/src/components/koin.tsx:11`: `bg-amber-400 text-neutral-900` → `bg-koin text-koin-foreground`
   - `apps/web/src/app/(public)/[creatorSlug]/subscribe-card.tsx:26`: `bg-amber-400 … text-neutral-900 hover:bg-amber-300` → `bg-koin text-koin-foreground hover:bg-koin/85`
   - `apps/web/src/app/(public)/[creatorSlug]/page.tsx:52`: `ring-amber-400` → `ring-primary` (avatar ring = brand accent)
   - `apps/web/src/app/(public)/[creatorSlug]/post-grid.tsx:68`: `text-green-700` → `text-success`
   - Keep the `bg-black/xx` + `text-white` overlays on media (post-grid, post-media-viewer): they sit on photos, not on the theme. Keep `text-white` on `bg-destructive` (about 4.6:1).
   - Run `grep -rnE '(amber|neutral|green|zinc|gray|slate)-[0-9]|#[0-9a-fA-F]{6}' apps/web/src --include=*.tsx`. After the change, only the media overlays should remain.

5. Create the contrast check `apps/web/src/app/theme.test.ts` (Vitest, node env):
   - Read `globals.css` with `fs`, parse the `:root { … }` block with a regex into a `Record<string,string>` (hex values only).
   - Add a small `contrast(hexA, hexB)` helper (WCAG relative luminance) in the test file. Don't add a dependency.
   - Assert the token values match the DRAFT spec: primary `#EF8176`, background `#FAFAFA`, card `#FFFFFF`, foreground `#25262B`, accent `#FFE8E2`, koin `#E9AD56`.
   - Assert at least 4.5:1 for each pair: foreground/background, foreground/card, foreground/accent, muted-foreground/background, muted-foreground/card, muted-foreground/accent, primary-foreground/primary, koin-foreground/koin, success/card, success/background.
   - Assert white on primary is **below** 4.5 (documents why coral never carries white text).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/globals.css` | DRAFT palette + koin/success/feed tokens + font-sans |
| MODIFY | `apps/web/src/app/fonts.ts` | expose `--font-jakarta` variable |
| MODIFY | `apps/web/src/app/layout.tsx` | apply font app-wide |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.tsx` (+ `page.test.tsx`) | drop per-page font; amber ring → token |
| MODIFY | `apps/web/src/components/koin.tsx` | koin token |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/subscribe-card.tsx` | koin token |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/post-grid.tsx` | success token |
| CREATE | `apps/web/src/app/theme.test.ts` | token values + WCAG AA contrast |

**Testing:**
- `theme.test.ts` as above.
- Existing web tests still pass (`pnpm --filter @influency/web test`).
- `pnpm check` is green.

---

### TASK-094: 44 px tap targets, dvh/safe-area and feed width

**What to build**

1. Shared controls, at least 44 px on every size (Tailwind `h-11` = 44 px):
   - `apps/web/src/components/ui/button.tsx`: `default: 'h-11 px-4 py-2 has-[>svg]:px-3'`, `sm: 'h-11 gap-1.5 px-3 text-sm …'`, `xs: 'h-11 gap-1 px-2 text-xs …'` (visually smaller text, same hit area), `lg: 'h-12 …'`, `icon`/`icon-sm`/`icon-xs`: `size-11`, `icon-lg: size-12`. Keep the variant names so call sites don't change.
   - `apps/web/src/components/ui/input.tsx`: `h-9` → `h-11`.
2. Custom controls that bypass `Button`:
   - `apps/web/src/components/koin.tsx:26` balance pill `h-9` → `h-11`
   - `apps/web/src/app/(public)/[creatorSlug]/share-button.tsx:27` `size-9` → `size-11`
   - `apps/web/src/app/(public)/[creatorSlug]/page.tsx:93` button `h-9` → `h-11`
   - `apps/web/src/app/(public)/[creatorSlug]/post-grid.tsx:146` tab/filter button `h-9` → `h-11`
   - Search for any other `<button`/`<a>`/`Link` with an explicit `h-*`/`size-*` below 11: `grep -rnE '\b(h|size)-(6|7|8|9|10)\b' apps/web/src --include=*.tsx`. Bump the interactive ones and leave decorative icons alone.
3. Viewport/layout in `apps/web/src/app/layout.tsx`:
   - Body: `flex min-h-dvh flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]`. Drop `h-full`/`min-h-full` on html/body.
   - `viewport`: add `viewportFit: 'cover'` so the `env(safe-area-inset-*)` values are non-zero on notched iOS.
   - Replace any `min-h-screen`/`h-screen`/`100vh` with `dvh` variants (none exist today; check again).
4. Feed width: `apps/web/src/app/(public)/[creatorSlug]/page.tsx` `<main>` `max-w-2xl` → `max-w-feed` (still `mx-auto w-full`). Do the same for `purchase-sheet.tsx` `max-w-2xl` → `max-w-feed` so the sheet lines up with the feed. Other placeholder pages (discover/library/wallet/subscriptions) also get `max-w-feed` if they set a max width.
5. Overflow hygiene: make sure long creator names and bios wrap (`break-words`/`min-w-0` on flex children). Fix anything that overflows at 320 px during the manual check.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/components/ui/button.tsx` | 44 px sizes |
| MODIFY | `apps/web/src/components/ui/input.tsx` | 44 px height |
| MODIFY | `apps/web/src/components/koin.tsx` | 44 px pill |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/share-button.tsx` | 44 px |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.tsx` | 44 px button, `max-w-feed` |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/post-grid.tsx` | 44 px tabs |
| MODIFY | `apps/web/src/components/purchase-sheet.tsx` | `max-w-feed` |
| MODIFY | `apps/web/src/app/layout.tsx` | `min-h-dvh`, safe-area, `viewportFit: cover` |
| CREATE | `apps/web/src/components/ui/button.test.tsx` | size guard |

**Testing:**
- `button.test.tsx`: for every `size` variant, render `<Button size={s}>` and assert the class string contains `h-11`/`h-12`/`size-11`/`size-12` (guards against regressions back to sub-44 px).
- Existing tests updated if they assert old classes.
- **Manual QA checklist (record the results in the QA report):** in devtools at 320, 375, 390 and 430 px, check `/`, `/{demo creator slug}`, a post page, `/discover`, `/wallet`, `/library`, `/subscriptions`, `/login`, `/studio`. Confirm there's no horizontal scrollbar (`document.documentElement.scrollWidth <= innerWidth` in the console) and that tap targets measure at least 44 px in the inspector. At 1280 px, confirm the creator feed is about 544 px wide and centred.
- `pnpm check` is green.


## Palette update (2026-11-04)

The user swapped the DRAFT colours for the **PetalSkull "Skeleton Lady"** reference, still as a light theme (spec §1.1/§1.2 updated): primary Dusty Rose `#C7767E`, canvas Bone Ivory `#EEE7DC`, surface `#FBF8F3`, text Soft Charcoal `#232021`, accent Blush Petal `#F2C9CB`, secondary Charcoal Midnight `#26344F` (ivory text), muted `#E4DCCF` / `#55504F`, Koin muted gold `#D9A654`, success `#166534` (`#15803D` was only 4.1:1 on ivory). The token names and rules above are unchanged. Wherever this document says "coral", read dusty rose. `theme.test.ts` now asserts the new values plus `secondary-foreground` on `secondary` (16 tests).


## Redesign to dark mode (2026-11-04, later the same day)

Per the user, the app is now **dark-only**, following a dark app reference with a lemon-yellow accent. This supersedes both the coral and PetalSkull palettes (spec §1.1/§1.2 updated; story renamed "Dark Social Design Tokens"). Values: canvas `#121212`, card/popover `#232323`, text `#F5F5F5`, muted `#2C2C2C` / `#A3A3A3`, primary `#F8F43C` (near-black text), secondary white pill `#F5F5F5`, border `#2E2E2E`, input `#333333`, Koin `#F8F43C`, success `#4ADE80`, destructive `#FF6467`, `--radius` 0.75rem. The unused `.dark` block was deleted; `<html>` gets the `dark` class plus `color-scheme: dark`. Component changes: `Button` is `rounded-full`; the subscribe card is a bordered `bg-card` with the yellow Koin CTA (yellow on yellow would vanish); the active post-grid filter is a white `secondary` pill and inactive filters use `bg-muted`. `theme.test.ts` adds destructive and primary pairs on canvas and card (all pass AA).
