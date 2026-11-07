# QA Report: TASK-001 — Light Social tokens, radius scale and theme test

**Story:** US-001 Light Social Design Tokens
**Date:** 2026-11-07
**Result:** PASS

## Scope reviewed

- `apps/web/src/app/globals.css`
  - The Light Social `:root` palette is written as hex, defined once, and follows the plan's mapping table.
  - New `@theme` colours: `brand`, `primary-ink`, `koin-surface`, `koin-border`, `success-surface`.
  - The radius scale is 9/12/14/16/20/22 px.
  - `color-scheme: light` is set. `@custom-variant dark` and the unused sidebar/chart variables are removed.
- `apps/web/src/app/layout.tsx`: the `dark` class is removed from `<html>`. Font, safe-area padding and `min-h-dvh` are unchanged.
- `apps/web/src/app/theme.test.ts`: tests token values, 17 WCAG AA pairs, the accepted exception for white on `#D9584C` (3.85:1, at least 3), muted on accent (below 4.5), brand coral with white (below 3), and no dark theme.
- `.agile/guidelines/codebase-map.md`: the theme bullet is rewritten for Light Social.

## Checks

| Check | Result |
|---|---|
| `vitest run src/app/theme.test.ts` | 22/22 pass |
| `@influency/web test` (all) | 259/259 pass |
| `@influency/web typecheck` | pass |
| `@influency/web lint` | pass |
| prettier on changed files | pass |
| `grep` for leftover `dark` class / Dark Social references in `apps/web/src` | none |
| `--radius` / sidebar / chart variables used elsewhere | none (shadcn `tailwind.css` doesn't read them) |

## Acceptance criteria (TASK-001 share)

- AC1 is met: the tokens follow design/HANDOFF.md, are defined once, and the Dark Social palette is gone.
- AC2 is met at the token level: the contrast pairs and the documented exception are enforced by tests. Button and link usage is covered by TASK-002.
- AC3 is met for the radius tokens. Button heights are covered by TASK-002.

## Notes

- `components/ui/*` still contain `dark:` classes. They are inert now that the variant is gone, and TASK-002 deletes them.
- The visual sweep of existing pages is part of TASK-002.
