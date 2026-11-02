# Influency

Web-first platform where creators sell content at `influency.com/{creatorSlug}`. Fans log in with Telegram, buy prepaid **Koin** through Midtrans (Sandbox only during the MVP), and spend them on post unlocks or creator subscriptions.

Product and architecture source of truth: [`.agile/.docs/INFLUENCY_MVP_CLAUDE_HANDOFF_v1.md`](.agile/.docs/INFLUENCY_MVP_CLAUDE_HANDOFF_v1.md). Engineering guidelines: [`.agile/guidelines/`](.agile/guidelines/).

## Prerequisites

- **Node.js 24 LTS** — the version in `.nvmrc` (`nvm use` / `fnm use`)
- **pnpm** via Corepack — the version is pinned in `package.json` (`packageManager`)

```sh
corepack enable pnpm
```

If `corepack enable` fails with a permission error on Windows, install the shim into a user directory on your `PATH`:

```sh
corepack enable pnpm --install-directory "%APPDATA%\npm"
```

## Local database

The API needs a local **PostgreSQL 18** (native install, no Docker for now).

1. Install it: `winget install --id PostgreSQL.PostgreSQL.18` (or the installer from postgresql.org). Remember the `postgres` superuser password you choose.
2. Create the app role and database with `psql -U postgres` (from `C:\Program Files\PostgreSQL\18\bin`):

   ```sql
   CREATE ROLE influency WITH LOGIN PASSWORD 'choose-a-local-password';
   CREATE DATABASE influency OWNER influency;
   ```

3. Copy the environment template and set `DATABASE_URL` to the password from step 2:

   ```sh
   cp .env.example .env
   ```

   Check the connection with `psql "postgresql://influency:<password>@localhost:5432/influency" -c "select 1"`.

The API loads the root `.env` at startup (real environment variables win) and refuses to start, listing every missing or invalid variable, if the required ones are wrong. `MIDTRANS_IS_PRODUCTION=true` is always rejected (Sandbox only). Redis is not needed until Phase 5 (background jobs); a Docker setup may return later.

## Getting started

```sh
pnpm install
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1 (no routes yet — any path returns a JSON 404)

The API port can be changed with `API_PORT` in `.env`. The database schema arrives in US-004.

`GET http://localhost:4000/api/v1/health` returns 200 `{"status":"ok",...}` when PostgreSQL answers and 503 when it doesn't (Redis is reported as `disabled` until Phase 5). Every response carries an `X-Request-Id` header that matches the `requestId` in the API's JSON logs.

The Prisma client is generated into `apps/api/src/generated/` on install. After changing `apps/api/prisma/schema.prisma`, regenerate it with `pnpm --filter @influency/api generate`.

## Scripts

Run from the repository root:

| Command             | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `pnpm dev`          | Builds `@influency/shared`, then runs shared (watch), api and web |
| `pnpm build`        | Builds every package in dependency order                          |
| `pnpm lint`         | ESLint (type-aware) in every package                              |
| `pnpm typecheck`    | `tsc --noEmit` in every package (web runs `next typegen` first)   |
| `pnpm test`         | Builds shared, then runs Vitest in every package                  |
| `pnpm format`       | Formats the repo with Prettier                                    |
| `pnpm format:check` | Checks formatting without writing                                 |
| `pnpm check`        | `format:check` + `lint` + `typecheck` + `test` — run before a PR  |

### Working on one package

```sh
pnpm --filter @influency/api test        # one package's tests
pnpm --filter @influency/web dev         # one app
pnpm --filter @influency/api exec vitest run src/app.spec.ts   # one test file
pnpm --filter @influency/api exec vitest run -t "boots on Fastify"  # one test by name
```

Apps import `@influency/shared` from its build output, so run `pnpm --filter @influency/shared build` (or `pnpm dev`) after changing shared code before running app tests directly.

## Repository layout

```text
apps/
  web/        @influency/web     Next.js 16 App Router, Tailwind CSS 4, shadcn/ui
  api/        @influency/api     NestJS 12 on Fastify, REST under /api/v1
packages/
  shared/     @influency/shared  Constants, types and Zod schemas shared by web and api
  config/     @influency/config  Shared tsconfig bases and ESLint flat configs
.agile/                           Backlog, plans, QA reports, guidelines
```

All packages are ESM and TypeScript `strict`. Dependency versions are pinned exactly.
