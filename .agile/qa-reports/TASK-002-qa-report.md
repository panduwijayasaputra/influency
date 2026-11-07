# QA Report: TASK-002 — Restyle UI primitives and sweep existing pages

**Story:** US-001 Light Social Design Tokens
**Date:** 2026-11-07
**Result:** PASS

## Scope reviewed

### UI primitives

- **`components/ui/button.tsx`**
  - Base radius is now `rounded-lg` (14 px) and the base weight is bold.
  - Variants:
    - `default`: coral strong with white text.
    - `secondary`: charcoal.
    - `outline`: `border-input` on a card background.
    - `ghost`: uses `muted` on hover.
    - `link`: `text-primary-ink`.
  - Sizes: `default` is `h-12` (48 px) and `lg` is `h-13` (52 px). `sm`/`xs` are `h-11` with `rounded-md`. Icon sizes stay round at 44/48 px.
  - All `dark:` classes are removed.
- **`button.test.tsx`** checks:
  - every size is at least 44 px
  - icon sizes are square
  - default is 48 px and lg is 52 px
  - non-icon sizes are not pills
- **`components/ui/input.tsx` and `textarea.tsx`**: radius 12 px, `bg-card` surface, selection uses accent colours, `dark:` removed.

### Page sweep

- **`components/koin.tsx`**
  - The coin mark is a gold disc with a white "K". It is decorative (`aria-hidden`); a code comment records why contrast doesn't apply.
  - The balance pill uses the koin surface, border and foreground colours.
- **`[creatorSlug]/post-grid.tsx`**
  - The filter chips became the design's segmented control: a muted track, 9 px segments, and a white active segment with shadow. `aria-pressed` is kept.
  - The outline "Muat lebih banyak" button now uses the default button radius.
- **`[creatorSlug]/subscribe-card.tsx`**: the subscribe CTA used gold `bg-koin` behind text. Koin is meant for the coin mark only, so it is now a primary button with the 14 px radius. The card radius is 16 px.
- **`[creatorSlug]/page.tsx`**: the avatar ring uses `ring-brand`. The disabled Instagram/TikTok chips use the outline button look.
- **`components/like-button.tsx`**: the liked heart uses `text-brand`.
- **`components/purchase-sheet.tsx`**: the sheet surface is `bg-card`. Buttons use the default radius instead of `rounded-2xl`. The summary block is 16 px.
- **`components/account-menu.tsx`**: the menu radius is 16 px. Its structure is untouched because US-005 replaces it.

### Repo hygiene

- **`.prettierignore`**: added `design`. The design handoff prototypes are reference-only and failed `format:check`.

## Checks

| Check | Result |
|---|---|
| `pnpm check` | format + lint + typecheck pass. Web 264/264, shared 202/202. API 616/617 on the first run; `auth.integration.spec.ts › replayed state` failed once, then passed on rerun of the file (34/34) and of the full API suite (617/617). Flaky, and no API code was touched. |
| `grep` for leftover `dark:` / raw palette colours in `apps/web/src` | none (only `bg-black/xx text-white` media overlays, which are allowed) |
| Compiled CSS (`pnpm dev`) | contains the new tokens. `rounded-sm/md/lg` resolve to 9/12/14 px. `h-13` is emitted. |
| Route smoke (`pnpm dev`, HTTP 200) | `/login`, `/claudiandreya`, post detail, `/studio`, `/studio/posts`, `/studio/profile`, `/admin/creators`, `/become-creator`, `/discover`, `/wallet`, `/library`, `/subscriptions`, `/` |
| Horizontal overflow (headless Chrome via CDP device emulation, `documentElement.scrollWidth` vs `innerWidth`) | none at 320 / 375 / 390 / 430 px on all 12 routes above |
| Visual check (screenshots at 320 / 390) | light canvas, coral strong buttons with white text, coral avatar ring, segmented filter, readable text; no dark remnants |

## Acceptance criteria (US-001)

| AC | Status | Notes |
|---|---|---|
| AC1 | Met | Tokens follow the design and are defined once. The Dark Social palette is gone. |
| AC2 | Met | Filled buttons use `primary` (strong) with white text, links use `primary-ink`, and `brand` is used only for the ring, heart and indicators. AA pairs are tested; the white-on-`#D9584C` exception is documented and tested. |
| AC3 | Met | The radius scale is 9/12/14/16/20/22 px and buttons are 48/52 px tall. |
| AC4 | Met | Jakarta is used app-wide, tap targets are at least 44 px, `100dvh` and safe-area are unchanged, and the feed column is 34rem. |
| AC5 | Met | Existing pages render in the new theme with no horizontal scroll at the four widths. |

## Notes for UAT

- Studio and admin were checked as a guest (gate/redirect view only). Look at them once while logged in as Claudia or Admin.
- The Dark Social shell components (`SiteHeader`, `BottomNav` with Jelajahi/Koleksi/Langganan/Dompet, `account-menu`) are still visible. They are replaced in US-003 to US-005 by design.
