# Technical Plan: US-001 — Light Social Design Tokens

## Architecture Overview

We re-skin the existing shadcn + Tailwind v4 theme in place and do not add a parallel token system.

- Every colour is defined once, as a hex CSS variable in `:root` of `apps/web/src/app/globals.css`.
- These variables are mapped onto the shadcn variables that components already use (`bg-primary`, `bg-background`, `text-foreground`, `border-border`, …). Existing class names therefore keep working.
- A few semantic tokens are added for things shadcn has no slot for, and exposed via `@theme inline`.

The theme is light only: the `dark` class and `color-scheme: dark` are removed.

Decisions agreed with the user (2026-11-07):
- **Filled button colour is `#D9584C` exactly as in the design**, with white text. This pair measures **3.85:1**, not the 4.8:1 the design claims. It passes only the 3:1 large-text threshold. The user accepted it as a documented AA exception, and the story AC was updated. Every other text/background pair must still meet 4.5:1, and the test guards that.
- Shape follows the design. Buttons and inputs use a 14 px radius instead of pills; segments 9 px, cards/media 16 px, recommended cards 20 px, sheets 22 px. Primary buttons are 48 px tall by default and 52 px at `lg`.
- Coral `#EF8176` (`brand`) is used only for the logo, active indicators, the liked heart and focus/selection rings. It never carries text: white on it is 2.6:1.

### Token mapping (hex, in `:root`)

| Variable | Value | Design token / use |
|---|---|---|
| `--background` | `#FAFAFA` | canvas |
| `--foreground`, `--card-foreground`, `--popover-foreground` | `#25262B` | text |
| `--card`, `--popover` | `#FFFFFF` | surface |
| `--primary` | `#D9584C` | primary.strong — filled buttons |
| `--primary-foreground` | `#FFFFFF` | white on filled buttons (AA exception) |
| `--primary-ink` (new) | `#B4463B` | coral text links and lock icons on white or soft |
| `--brand` (new) | `#EF8176` | logo, active indicator, liked heart |
| `--ring` | `#EF8176` | selection/focus ring |
| `--accent` | `#FFE8E2` | primary.soft — chips, Premium badge, hover |
| `--accent-foreground` | `#8F3A31` | text on soft (6.35:1) |
| `--secondary` | `#25262B` | dark "Ikuti" button / active chip |
| `--secondary-foreground` | `#FFFFFF` | |
| `--muted` | `#F1EEED` | segment track, neutral fill |
| `--muted-foreground` | `#6B6B75` | metadata |
| `--border` | `#ECE8E7` | hairlines |
| `--input` | `#DCD6D5` | input / outline-button border |
| `--destructive` | `#B42318` | danger |
| `--koin` | `#D6A443` | Koin coin mark only (never behind text) |
| `--koin-surface` (new) | `#FFF6E5` | Koin surfaces (balance card, tip button) |
| `--koin-foreground` | `#6B4A0E` | text on `koin-surface` (7.49:1) |
| `--koin-border` (new) | `#F1DDB3` | tip button border |
| `--success` | `#1E6B3A` | Active / Unlocked text |
| `--success-surface` (new) | `#E6F4EA` | badge background |
| `--feed-max-width` | `34rem` | unchanged (544 px, inside 480–560) |

Measured contrast: `#6B6B75` on `#FFE8E2` is 4.49:1, below AA. Muted text must **not** sit on `accent`; use `accent-foreground` there. The test documents this.

The `--sidebar-*` and `--chart-*` variables are unused, so delete them and their `@theme` mappings.

## Dependencies

None new. Plus Jakarta Sans is already loaded via `next/font` in `apps/web/src/app/fonts.ts`. It is a variable font, so weights 400–800 are already available.

## Risks

- **Existing pages were styled against a dark palette.** Some spots assume light text on dark, for example:
  - the active chip in `post-grid.tsx` (now charcoal `secondary`, which is fine)
  - `KoinIcon` text on `bg-koin` (white-ish on gold fails)

  Mitigation: TASK-002 does a sweep plus a visual check of every route.
- **Radius changes affect shadcn defaults.** `rounded-md`/`rounded-lg` change meaning when the radius scale is remapped. Mitigation: map the scale explicitly (below) and check the sweep visually.
- **Uncommitted Dark Social components** (`bottom-nav`, `account-menu`, `site-header`, `purchase-sheet`, `koin`, placeholders) will be structurally replaced in US-002–US-005. Here they only need to render legibly in the new tokens; don't redesign them.

## Tasks

### TASK-001: Light Social tokens, radius scale and theme test

**What to build**

1. In `apps/web/src/app/globals.css`, make these changes.
   - Replace the Dark Social `:root` block with the mapping table above, written as lowercase hex. Head the block with this comment:

     ```
     /* Light Social palette (design/HANDOFF.md, 2026-11-07). Tokens are PROPOSAL values; change them here only. */
     ```

     Inline comments name the design token. Add a one-line comment on `--primary-foreground` that records the accepted AA exception (3.85:1).
   - Set `color-scheme: light`.
   - Remove `@custom-variant dark (...)`. Nothing in app code uses `dark:`, and the stray `dark:` variants in `components/ui/*` become inert; TASK-002 deletes them.
   - In `@theme inline`, keep the existing mappings and add the following:
     - `--color-brand: var(--brand)`
     - `--color-primary-ink: var(--primary-ink)`
     - `--color-koin-surface: var(--koin-surface)`
     - `--color-koin-border: var(--koin-border)`
     - `--color-success-surface: var(--success-surface)`
   - Delete the sidebar and chart mappings and their variables.
   - Replace the computed radius scale with explicit design radii. Remove `--radius` from `:root` if nothing else reads it:
     - `--radius-sm: 9px` (segments)
     - `--radius-md: 12px` (inputs, small buttons, segment track)
     - `--radius-lg: 14px` (buttons)
     - `--radius-xl: 16px` (cards, media)
     - `--radius-2xl: 20px` (recommended cards)
     - `--radius-3xl: 22px` (sheets)
2. In `apps/web/src/app/layout.tsx`, remove `dark` from the `<html>` className. Keep `${jakarta.variable} font-sans antialiased`, the safe-area padding and `min-h-dvh`.
3. Rewrite `apps/web/src/app/theme.test.ts`. Keep the existing hex parser and `contrast()` helpers.
   - Rename the suite to `describe('Light Social theme tokens')`.
   - `it('match the design tokens')` asserts with `toMatchObject` on `primary`, `brand`, `primary-ink`, `accent`, `koin`, `koin-surface`, `koin-foreground`, `background`, `card`, `foreground`, `muted-foreground`, `border`, `destructive`, `success`, `success-surface`.
   - Add an `it.each` that checks these pairs reach ≥ 4.5:1:

     | Text | On |
     |---|---|
     | `foreground` | `background`, `card`, `muted`, `accent` |
     | `muted-foreground` | `background`, `card`, `muted` |
     | `accent-foreground` | `accent` |
     | `primary-ink` | `card`, `background`, `accent` |
     | `secondary-foreground` | `secondary` |
     | `koin-foreground` | `koin-surface` |
     | `success` | `success-surface`, `card` |
     | `destructive` | `card`, `background` |

   - `it('documents the accepted AA exception for filled buttons')` asserts `contrast(primary-foreground, primary)` is ≥ 3 and < 4.5.
   - `it('documents why muted text never sits on accent')` asserts `contrast(muted-foreground, accent)` is < 4.5.
   - `it('documents why brand coral never carries white text')` asserts `contrast('#ffffff', brand)` is < 3.
   - `it('has no dark theme')`: the CSS does not contain `color-scheme: dark` or `@custom-variant dark`.
4. Update the theme bullet in `.agile/guidelines/codebase-map.md` (the "Theme (US-053)" bullet) to describe the Light Social tokens above, the new utilities and the AA exception. Also update the theme/colour lines in `.agile/guidelines/frontend.md` "Styling and UX" if they mention Dark Social.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/globals.css` | Light Social `:root`, new `@theme` tokens, radius scale, light only |
| MODIFY | `apps/web/src/app/layout.tsx` | Drop the `dark` class |
| MODIFY | `apps/web/src/app/theme.test.ts` | New token values + AA pairs + documented exceptions |
| MODIFY | `.agile/guidelines/codebase-map.md` | Theme bullet |
| MODIFY | `.agile/guidelines/frontend.md` | Styling notes (only if they reference the old palette) |

**Testing:**
- `pnpm --filter @influency/web exec vitest run src/app/theme.test.ts` passes with the cases above.
- `pnpm check` passes.

---

### TASK-002: Restyle UI primitives and sweep existing pages

**What to build**

1. Update `apps/web/src/components/ui/button.tsx` (`buttonVariants`).
   - Base: replace `rounded-full` with `rounded-lg` (14 px). Change `font-medium` to `font-bold`. Keep the focus ring (`ring-ring/50`). Remove every `dark:` class.
   - Variants:
     | Variant | Classes |
     |---|---|
     | `default` | `bg-primary text-primary-foreground hover:bg-primary/90` (unchanged classes; now coral strong with white) |
     | `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/90` (dark charcoal) |
     | `outline` | `border border-input bg-card text-foreground hover:bg-muted` |
     | `ghost` | `hover:bg-muted` |
     | `destructive` | `bg-destructive text-white hover:bg-destructive/90` |
     | `link` | `text-primary-ink underline-offset-4 hover:underline` |
   - Sizes:
     | Size | Classes |
     |---|---|
     | `default` | `h-12 px-5` (48 px) |
     | `lg` | `h-13 px-6` (52 px) |
     | `sm`, `xs` | stay `h-11`, with `rounded-md` (12 px) |
     | `icon`, `icon-xs`, `icon-sm` | stay `size-11` |
     | `icon-lg` | stays `size-12` |
   - Delete the per-size `rounded-full` overrides except on icon sizes, which stay `rounded-full` (round icon buttons are in the design).
2. Update `apps/web/src/components/ui/button.test.tsx`.
   - Extend the height regex to accept `11|12|13`.
   - Add a test that `default` is `h-12` and `lg` is `h-13`.
   - Add a test that non-icon sizes don't contain `rounded-full`.
3. In `apps/web/src/components/ui/input.tsx` and `textarea.tsx`, apply these changes.
   - Use `rounded-md` (12 px), `bg-card`, `border-input` and placeholder `text-muted-foreground`.
   - Inputs stay `h-11`.
   - Remove all `dark:` classes.
   - Change the selection colour to `selection:bg-accent selection:text-accent-foreground`.
4. Sweep existing pages for Dark Social assumptions (`grep -rn "rounded-full\|bg-koin\|text-koin\|secondary" apps/web/src`).
   - `components/koin.tsx`:
     - `KoinIcon` becomes a gold disc `bg-koin` with a **white** "K". It is decorative and `aria-hidden`, so no text-contrast rule applies; add a comment saying so.
     - `KoinBalance` becomes `bg-koin-surface text-koin-foreground border border-koin-border`.
   - `app/(public)/[creatorSlug]/post-grid.tsx` filter chips:
     - Active chip: white chip on the muted track (`bg-card shadow-sm text-foreground`, `rounded-sm`). Inactive: `text-muted-foreground`.
     - Track: `bg-muted rounded-md p-[3px]`.
     - This mirrors the design's segmented control. Keep `aria-pressed`.
   - Links styled `text-primary` on body text become `text-primary-ink`. Coral `#D9584C` text on white is only 3.85:1.
   - Any remaining `rounded-full` on non-avatar, non-icon controls changes to the design radius.
   - Do **not** restructure `bottom-nav`, `site-header`, `account-menu` or `purchase-sheet` (US-002–US-005 replace them). Only make sure they render legibly on the light theme.
5. Visual check with `pnpm dev`. Open each route at 320, 375, 390 and 430 px in devtools and confirm there is no horizontal scroll and nothing is unreadable:
   - `/login`
   - `/claudiandreya`
   - a post detail under `/claudiandreya`
   - `/studio`, `/studio/posts`, `/studio/profile`
   - `/admin/creators`
   - `/become-creator`
   - `/discover`, `/wallet`, `/library`, `/subscriptions`

   Fix anything that still assumes dark colours. Record the checklist result in the QA report.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/components/ui/button.tsx` | Design radius, heights, variants, no `dark:` |
| MODIFY | `apps/web/src/components/ui/button.test.tsx` | Height/radius guards |
| MODIFY | `apps/web/src/components/ui/input.tsx` | Radius 12, surface, no `dark:` |
| MODIFY | `apps/web/src/components/ui/textarea.tsx` | Same as input |
| MODIFY | `apps/web/src/components/koin.tsx` | Koin mark + koin surface |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/post-grid.tsx` | Segmented filter look |
| MODIFY | other `apps/web/src/**` found by the sweep | Light-theme fixes only |

**Testing:**
- `button.test.tsx` guards heights (≥ 44 px, default 48, lg 52) and the non-pill radius.
- Existing component and page tests still pass. Update only class-string assertions that hard-coded old classes, and never delete a behavioural test.
- Run the manual 320/375/390/430 px checklist above.
- `pnpm check` passes.
