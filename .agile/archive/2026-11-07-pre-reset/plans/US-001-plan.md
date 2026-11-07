# Technical Plan: US-001 — Monorepo Workspace & Tooling

## Architecture Overview

A pnpm workspace with four packages, all TypeScript `strict`:

```text
influency/
  .nvmrc                       # 24 (Node 24 LTS)
  package.json                 # private root, scripts fan out with `pnpm -r`
  pnpm-workspace.yaml          # apps/*, packages/*
  .gitignore  .editorconfig  .prettierrc.json  .prettierignore
  README.md
  apps/
    web/                       # @influency/web  — Next.js App Router + Tailwind + shadcn/ui
    api/                       # @influency/api  — NestJS on Fastify
  packages/
    shared/                    # @influency/shared — shared constants/types/schemas (Zod-ready)
    config/                    # @influency/config — tsconfig bases + ESLint flat configs
```

Decisions agreed with the user:
- **Lint/format:** ESLint (flat config) + typescript-eslint + Prettier.
- **Task running:** plain `pnpm -r` (topological order). No Turborepo; revisit via ADR if CI gets slow.
- **Node:** Node 24 LTS pinned in `.nvmrc`; `engines.node` `>=24` and `packageManager` pinned in root `package.json`.
- **Tests:** Vitest everywhere. API uses `unplugin-swc` so Vitest handles NestJS decorators/metadata.

**Shared package consumption.** `@influency/shared` is built with `tsup` to `dist/` (ESM + CJS + d.ts) so both Next.js (ESM) and NestJS (CommonJS) can import it at runtime. Its `exports` map points the `types` condition at `src/index.ts`, so `typecheck` and editors work without building first. Root `dev`/`build`/`test` build shared before the apps (`pnpm -r` handles order because apps depend on `workspace:*`).

**Out of scope here** (later stories): Docker Compose and env validation (US-002), health endpoint, request ID and error format (US-003), Prisma (US-004), CI (US-005). The API in this story has no product routes; it only boots with the `/api/v1` global prefix.

**Versions:** use the current stable release of each tool that is at least two weeks old, pin exact versions (no `^`/`~`) in every `package.json`, and record the chosen major versions in `.agile/guidelines/tech-stack.md`.

## Dependencies

- Node 24 LTS, pnpm (via Corepack, version pinned in `packageManager`)
- Dev tooling: `typescript`, `eslint`, `typescript-eslint`, `@eslint/js`, `eslint-config-prettier`, `prettier`, `prettier-plugin-tailwindcss`, `vitest`
- API: `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-fastify`, `reflect-metadata`, `rxjs`, `@nestjs/cli`, `@nestjs/testing`, `unplugin-swc`, `@swc/core`
- Web: `next`, `react`, `react-dom`, `tailwindcss` (+ its PostCSS plugin), shadcn/ui CLI deps (`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`), `eslint-config-next` / `@next/eslint-plugin-next`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
- Shared: `tsup`, `zod` (dependency only; schemas arrive in later stories)

## Risks

- **ESM/CJS mismatch between Next.js and NestJS** → dual-format `tsup` build of shared; covered by both apps' smoke tests importing from `@influency/shared`.
- **Vitest + NestJS decorators** → `unplugin-swc` with `decoratorMetadata: true`; smoke test boots the real `AppModule`.
- **Next.js ESLint flat-config support varies by version** → follow the current `eslint-config-next` docs for flat config; if it needs `FlatCompat`, isolate that inside `packages/config/eslint/next.mjs`.
- **Tool version drift** → exact pins + `pnpm-lock.yaml` committed.

## Tasks

### TASK-001: Root Workspace & Shared Config Package

Create the workspace skeleton and the reusable config package.

1. `.nvmrc` containing `24`.
2. Root `package.json`:
   - `"name": "influency"`, `"private": true`, `"packageManager": "pnpm@<exact>"`, `"engines": { "node": ">=24" }`
   - Scripts (fill in fully in TASK-005; create now with at least `format` and `format:check`):
     - `"format": "prettier --write ."`, `"format:check": "prettier --check ."`
   - devDependencies: `prettier`, `prettier-plugin-tailwindcss`, `typescript`
3. `pnpm-workspace.yaml`: `packages: ["apps/*", "packages/*"]`.
4. `.gitignore`: `node_modules/`, `dist/`, `.next/`, `coverage/`, `*.tsbuildinfo`, `.env`, `.env.*` with `!.env.example`, `.turbo/`, OS/editor files.
5. `.editorconfig` (utf-8, lf, 2 spaces, final newline) and `.prettierrc.json` (`singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`, plugin `prettier-plugin-tailwindcss`). `.prettierignore`: `pnpm-lock.yaml`, `dist`, `.next`, `coverage`, `.agile/.docs`.
6. `packages/config` (`@influency/config`, private, no build):
   - `tsconfig/base.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `exactOptionalPropertyTypes: false`, `forceConsistentCasingInFileNames: true`, `skipLibCheck: true`, `esModuleInterop: true`, `isolatedModules: true`, `resolveJsonModule: true`, `target: "ES2023"`.
   - `tsconfig/nest.json` extends base: `module: "CommonJS"`, `moduleResolution: "Node10"` (or `Node16` if exports resolution requires it), `experimentalDecorators: true`, `emitDecoratorMetadata: true`, `outDir: "dist"`.
   - `tsconfig/next.json` extends base: `module: "ESNext"`, `moduleResolution: "Bundler"`, `jsx: "preserve"`, `lib: ["dom","dom.iterable","ES2023"]`, `noEmit: true`, `allowJs: false`, `incremental: true`, Next plugin entry.
   - `tsconfig/library.json` extends base: `module: "ESNext"`, `moduleResolution: "Bundler"`, `declaration: true`.
   - `eslint/base.mjs`: exports a flat-config array — `@eslint/js` recommended + `typescript-eslint` `recommendedTypeChecked` (with `parserOptions.projectService: true`) + `eslint-config-prettier` last; rules: `@typescript-eslint/no-explicit-any: error`, `@typescript-eslint/no-floating-promises: error`, `@typescript-eslint/consistent-type-imports: error`; ignores `dist/**`, `.next/**`, `coverage/**`.
   - `eslint/nest.mjs`: base + Node globals; allow empty decorated classes (`@typescript-eslint/no-extraneous-class` off).
   - `eslint/next.mjs`: base + Next.js core-web-vitals rules + react-hooks + browser globals.
   - `package.json` `exports` for `./tsconfig/*` and `./eslint/*`; devDependencies hold the ESLint plugins so apps only depend on `@influency/config`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `.nvmrc` | Pin Node 24 |
| CREATE | `package.json` | Root workspace manifest |
| CREATE | `pnpm-workspace.yaml` | Workspace globs |
| CREATE | `.gitignore`, `.editorconfig`, `.prettierrc.json`, `.prettierignore` | Repo hygiene + formatting |
| CREATE | `packages/config/package.json` | Config package manifest |
| CREATE | `packages/config/tsconfig/{base,nest,next,library}.json` | Shared TS configs |
| CREATE | `packages/config/eslint/{base,nest,next}.mjs` | Shared ESLint flat configs |

**Testing:**
- `pnpm install` succeeds on a clean clone with Node 24.
- `pnpm format:check` passes.
- Running `node -v` against `.nvmrc` via `nvm use` / `fnm use` selects Node 24.

---

### TASK-002: Shared Package (`@influency/shared`)

Create the package both apps import. Content is a placeholder for later stories but must be real code with a test.

- `packages/shared/src/index.ts` re-exports from `./constants`.
- `packages/shared/src/constants.ts`:
  ```ts
  export const APP_NAME = 'Influency';
  export const API_PREFIX = 'api/v1';
  ```
- `package.json`:
  - `"name": "@influency/shared"`, `"private": true`, `"type": "module"`, `"sideEffects": false`
  - `"exports": { ".": { "types": "./src/index.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" } }`, `"main": "./dist/index.cjs"`, `"module": "./dist/index.js"`
  - scripts: `build` (`tsup`), `dev` (`tsup --watch`), `lint` (`eslint .`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`)
  - dependencies: `zod`; devDependencies: `@influency/config` (`workspace:*`), `tsup`, `vitest`, `typescript`, `eslint`
- `tsup.config.ts`: entry `src/index.ts`, formats `esm` + `cjs`, `dts: true`, `clean: true`, `outExtension` so CJS is `.cjs`.
- `tsconfig.json` extends `@influency/config/tsconfig/library.json`, `include: ["src", "tsup.config.ts", "vitest.config.ts"]`.
- `eslint.config.mjs` re-exports `@influency/config/eslint/base.mjs` with `tsconfigRootDir: import.meta.dirname`.
- `src/constants.test.ts`: asserts `API_PREFIX === 'api/v1'` and `APP_NAME === 'Influency'`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `packages/shared/package.json` | Manifest + dual exports |
| CREATE | `packages/shared/tsup.config.ts` | ESM + CJS build |
| CREATE | `packages/shared/tsconfig.json` | Strict TS config |
| CREATE | `packages/shared/eslint.config.mjs` | Lint config |
| CREATE | `packages/shared/vitest.config.ts` | Test config |
| CREATE | `packages/shared/src/index.ts`, `src/constants.ts` | Public API |
| CREATE | `packages/shared/src/constants.test.ts` | Unit test |

**Testing:**
- `pnpm --filter @influency/shared build` emits `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`.
- `lint`, `typecheck`, `test` pass for the package.

---

### TASK-003: API App Scaffold (`@influency/api`)

NestJS on the Fastify adapter, no product routes yet.

- `src/main.ts`:
  ```ts
  import 'reflect-metadata';
  import { NestFactory } from '@nestjs/core';
  import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
  import { API_PREFIX } from '@influency/shared';
  import { AppModule } from './app.module';

  export async function createApp(): Promise<NestFastifyApplication> {
    const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
    app.setGlobalPrefix(API_PREFIX);
    return app;
  }

  async function bootstrap(): Promise<void> {
    const app = await createApp();
    await app.listen({ port: Number(process.env.API_PORT ?? 4000), host: '0.0.0.0' });
  }
  ```
  Only call `bootstrap()` when run directly (`if (require.main === module)`), so tests can import `createApp` without listening. Put `createApp` in `src/app.factory.ts` if that keeps `main.ts` cleaner. Env validation is US-002 — `API_PORT` default `4000` is fine here.
- `src/app.module.ts`: empty `@Module({})` named `AppModule`. Create `src/modules/` and `src/common/` directories (with `.gitkeep`) to match backend.md.
- `nest-cli.json` (`sourceRoot: "src"`, `compilerOptions.deleteOutDir: true`, builder `tsc` or `swc`).
- `tsconfig.json` extends `@influency/config/tsconfig/nest.json`; `tsconfig.build.json` excludes `**/*.spec.ts`, `**/*.test.ts`.
- `vitest.config.ts`: `plugins: [swc.vite({ module: { type: 'es6' }, jsc: { transform: { decoratorMetadata: true, legacyDecorator: true } } })]`, `test.environment: 'node'`, `test.include: ['src/**/*.spec.ts']`.
- `eslint.config.mjs` uses `@influency/config/eslint/nest.mjs`.
- `package.json`: `"name": "@influency/api"`, `"private": true`; scripts `dev` (`nest start --watch`), `build` (`nest build`), `start` (`node dist/main.js`), `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`); dependency `@influency/shared: workspace:*`.
- `src/app.spec.ts`: boots `createApp()`, `await app.init()`, `await app.getHttpAdapter().getInstance().ready()`, then `app.inject({ method: 'GET', url: '/api/v1/does-not-exist' })` returns 404 (proves Fastify adapter + global prefix + shared import work); closes the app in `afterAll`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/package.json` | Manifest + scripts |
| CREATE | `apps/api/nest-cli.json` | Nest CLI config |
| CREATE | `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json` | TS configs |
| CREATE | `apps/api/vitest.config.ts` | Vitest + SWC |
| CREATE | `apps/api/eslint.config.mjs` | Lint config |
| CREATE | `apps/api/src/main.ts` (+ optional `src/app.factory.ts`) | Bootstrap with Fastify + `/api/v1` prefix |
| CREATE | `apps/api/src/app.module.ts` | Root module |
| CREATE | `apps/api/src/modules/.gitkeep`, `apps/api/src/common/.gitkeep` | Folder layout per backend.md |
| CREATE | `apps/api/src/app.spec.ts` | Boot smoke test |

**Testing:**
- `pnpm --filter @influency/api test` passes the boot smoke test.
- `pnpm --filter @influency/api dev` starts and listens on port 4000; `GET http://localhost:4000/api/v1/x` returns 404 JSON.
- `lint`, `typecheck`, `build` pass.

---

### TASK-004: Web App Scaffold (`@influency/web`)

Next.js App Router with Tailwind and shadcn/ui initialised, a placeholder home page.

- Scaffold with the official Next.js setup (App Router, TypeScript, `src/` dir, Tailwind, import alias `@/*`), then align configs with `@influency/config`:
  - `tsconfig.json` extends `@influency/config/tsconfig/next.json`, keeps `paths: { "@/*": ["./src/*"] }` and the Next plugin.
  - `eslint.config.mjs` uses `@influency/config/eslint/next.mjs`.
- Initialise shadcn/ui (`components.json`, `src/lib/utils.ts` with `cn()`, CSS variables in `src/app/globals.css`). Add the `button` component only.
- Create route-group folders from frontend.md with `.gitkeep` only (no pages yet): `src/app/(public)/`, `src/app/(auth)/`, `src/app/(subscriber)/`, `src/app/studio/`, `src/app/admin/`, plus `src/lib/api/`, `src/components/`.
- `src/app/layout.tsx`: `<html lang="id">`, metadata title from `APP_NAME`, mobile viewport.
- `src/app/page.tsx` (server component): renders `APP_NAME` imported from `@influency/shared` and a short tagline; uses Tailwind classes, mobile-first.
- `next.config.ts`: `reactStrictMode: true`. Do **not** add `transpilePackages` (shared ships built JS).
- `vitest.config.ts`: `@vitejs/plugin-react`, `environment: 'jsdom'`, `setupFiles: ['./vitest.setup.ts']` (imports `@testing-library/jest-dom/vitest`), alias `@` → `./src`.
- `package.json`: `"name": "@influency/web"`, `"private": true`; scripts `dev` (`next dev --port 3000`), `build` (`next build`), `start` (`next start`), `lint` (`eslint .`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`); dependency `@influency/shared: workspace:*`.
- `src/app/page.test.tsx`: renders `<Page />` and asserts the heading contains "Influency".

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/package.json` | Manifest + scripts |
| CREATE | `apps/web/next.config.ts` | Next config |
| CREATE | `apps/web/tsconfig.json` | Extends shared Next tsconfig |
| CREATE | `apps/web/eslint.config.mjs` | Lint config |
| CREATE | `apps/web/postcss.config.mjs`, `apps/web/src/app/globals.css` | Tailwind |
| CREATE | `apps/web/components.json`, `apps/web/src/lib/utils.ts`, `apps/web/src/components/ui/button.tsx` | shadcn/ui init |
| CREATE | `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx` | Root layout + placeholder home |
| CREATE | `apps/web/src/app/(public)/.gitkeep` etc. | Route-group layout per frontend.md |
| CREATE | `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts` | Test config |
| CREATE | `apps/web/src/app/page.test.tsx` | Render smoke test |

**Testing:**
- `pnpm --filter @influency/web test` passes the render test.
- `pnpm --filter @influency/web dev` serves `http://localhost:3000` showing "Influency".
- `lint`, `typecheck`, `build` pass.

---

### TASK-005: Root Scripts, README & Full Verification

Wire the root scripts and document everything.

- Root `package.json` scripts:
  - `"build": "pnpm --filter @influency/shared build && pnpm -r --filter=!@influency/shared run build"`
  - `"dev": "pnpm --filter @influency/shared build && pnpm -r --parallel --filter=!@influency/config run dev"`
  - `"lint": "pnpm -r run lint"`
  - `"typecheck": "pnpm -r run typecheck"`
  - `"test": "pnpm --filter @influency/shared build && pnpm -r run test"`
  - `"format"`, `"format:check"` (from TASK-001)
  - `"check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test"` — one command for CI (US-005) and pre-PR checks.
- `README.md`: project one-liner and link to the handoff; prerequisites (Node 24 via `.nvmrc`, `corepack enable`); `pnpm install`; `pnpm dev` (web on :3000, api on :4000); script table (`build`, `dev`, `lint`, `typecheck`, `test`, `format`, `check`); running one package (`pnpm --filter @influency/api test`) and a single test file (`pnpm --filter @influency/api exec vitest run src/app.spec.ts`); repository layout; note that Docker/env/DB come in later stories.
- Update `CLAUDE.md` "Project state" with the real commands (install, dev, check, single-package and single-test commands) and remove the "pre-code" wording.
- Update `.agile/guidelines/tech-stack.md` with the exact major versions chosen.
- Update `.agile/guidelines/codebase-map.md` Apps & Packages table (also done by `/dev-team` on completion).
- Run `pnpm format` once, then `pnpm check` from a clean install and confirm it passes.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `package.json` | Root scripts |
| CREATE | `README.md` | Install / run / test docs |
| MODIFY | `CLAUDE.md` | Real commands |
| MODIFY | `.agile/guidelines/tech-stack.md` | Pinned versions |
| MODIFY | `.agile/guidelines/codebase-map.md` | Apps & packages |
| CREATE | `pnpm-lock.yaml` | Committed lockfile |

**Testing:**
- From a clean clone: `pnpm install && pnpm check` passes (format, lint, typecheck, tests in shared/api/web).
- `pnpm build` succeeds.
- `pnpm dev` starts both apps.

## Acceptance Criteria Mapping

| Acceptance criterion | Task(s) |
|---|---|
| Fresh clone `pnpm install` with Node from `.nvmrc` | TASK-001, TASK-005 |
| Workspace contains web, api, shared; web and api start locally | TASK-002, TASK-003, TASK-004 |
| Root `lint`, `typecheck`, `test`, `format` pass | TASK-001, TASK-005 |
| TypeScript `strict` everywhere | TASK-001 (base tsconfig), all packages extend it |
| README explains install, run, test | TASK-005 |
