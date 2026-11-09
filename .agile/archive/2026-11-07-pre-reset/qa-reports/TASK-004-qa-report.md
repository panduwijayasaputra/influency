# QA Report: TASK-004 — Web App Scaffold (`@influency/web`)

**Story:** US-001
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Next.js App Router with `src/`, alias `@/*`, server components only (no `"use client"` yet)
- [x] Route-group folders from frontend.md: `(public)`, `(auth)`, `(subscriber)`, `studio`, `admin`, plus `src/lib/api`
- [x] Tailwind v4 + shadcn/ui (Radix base, new-york, CSS variables), `button` component only
- [x] Mobile-first placeholder page, `lang="id"`, Bahasa Indonesia copy, theme tokens (`text-muted-foreground`)
- [x] Imports `APP_NAME` from `@influency/shared`
- [x] All dependencies pinned exactly; shadcn's caret ranges replaced with versions ≥ 2 weeks old

### Security
- [x] No secrets, no client-side logic, no external font fetch at build time

### Code Quality
- [x] Configs extend `@influency/config` (tsconfig + ESLint)

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 2 | Web app starts locally | PASS | `pnpm dev` served `/` with `<html lang="id">` and `<h1>Influency</h1>` |
| 3 | `lint`, `typecheck`, `test` pass | PASS | Package-level |
| 4 | TypeScript strict | PASS | Inherited via `next.json` |

## Tests Run

- [x] `pnpm test`: PASS (render test asserts heading from the shared package)
- [x] `pnpm lint`: PASS; a throwaway `<img>` without `alt` triggered `@next/next/no-img-element` and `jsx-a11y/alt-text`, proving Next rules are active
- [x] `pnpm typecheck` (`next typegen && tsc --noEmit`): PASS
- [x] `pnpm build`: PASS, static `/`; built CSS contains shadcn theme utilities
- [x] Manual: dev server responded on :3000

## Deviations from Plan

- **Tailwind via `@tailwindcss/turbopack`** (no PostCSS config), matching the Next.js 16.4 template; `cacheComponents` and `partialPrefetching` kept as template defaults.
- **`typecheck` runs `next typegen` first**: TS 6 checks side-effect imports (`./globals.css`), which need the generated `next-env.d.ts`.
- **`cn` package instead of local `clsx` + `tailwind-merge`**: shadcn 4.22 generates components importing `cn` (published by shadcn, `github.com/shadcn-ui/cn`). Kept so future `shadcn add` output works unchanged; `src/lib/utils.ts` re-exports it. Pinned to `0.5.0`.
- **No Google fonts**: system font stack avoids network access during build.
- `next dev` generates `apps/web/AGENTS.md` (Next.js agent rules). Kept, excluded from Prettier, and referenced from frontend.md.
