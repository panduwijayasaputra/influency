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
2. Create the app role and databases with `psql -U postgres` (from `C:\Program Files\PostgreSQL\18\bin`). `CREATEDB` lets `prisma migrate dev` create its temporary shadow database:

   ```sql
   CREATE ROLE influency WITH LOGIN CREATEDB PASSWORD 'choose-a-local-password';
   CREATE DATABASE influency OWNER influency;
   CREATE DATABASE influency_test OWNER influency;
   ```

3. Copy the environment template and set the password from step 2 in `DATABASE_URL` and `TEST_DATABASE_URL`:

   ```sh
   cp .env.example .env
   ```

   Check the connection with `psql "postgresql://influency:<password>@localhost:5432/influency" -c "select 1"`.

The API loads the root `.env` at startup (real environment variables win) and refuses to start, listing every missing or invalid variable, if the required ones are wrong. `MIDTRANS_IS_PRODUCTION=true` is always rejected (Sandbox only). Redis is not needed until Phase 5 (background jobs); a Docker setup may return later.

`pnpm test` needs PostgreSQL running: API integration tests (`*.integration.spec.ts`) use the `TEST_DATABASE_URL` database, which is **wiped and re-migrated on every run**. Its name must end in `_test` and differ from `DATABASE_URL`, or the tests refuse to start.

## Getting started

```sh
pnpm install
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1. The web app also proxies `/api/v1/*` to `API_ORIGIN` (default `http://localhost:4000`), so the browser only talks to the web origin.

The API port can be changed with `API_PORT` in `.env`.

`GET http://localhost:4000/api/v1/health` returns 200 `{"status":"ok",...}` when PostgreSQL answers and 503 when it doesn't (Redis is reported as `disabled` until Phase 5). Every response carries an `X-Request-Id` header that matches the `requestId` in the API's JSON logs.

The Prisma client is generated into `apps/api/src/generated/` on install. After changing `apps/api/prisma/schema.prisma`, regenerate it with `pnpm --filter @influency/api generate`.

> Full setup for every external service (Telegram bot and login, Midtrans, R2, Stream) is in [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

### Telegram login (manual check)

Login uses Telegram Login OIDC. Tests use a fake Telegram provider, so this setup is only needed to log in with a real account:

1. In @BotFather, open your bot → **Login Widget**. Note the Client ID (the numeric Bot ID) and the Client Secret.
2. Telegram needs a public HTTPS URL, so start a tunnel to the web app (port 3000), e.g. `https://abc.example-tunnel.dev`.
3. Under **Allowed URLs**, add the tunnel origin and `https://abc.example-tunnel.dev/api/v1/auth/telegram/callback`.
4. In `.env`, set `WEB_ORIGIN` to the tunnel origin, `TELEGRAM_OIDC_REDIRECT_URI` to that callback URL, and `TELEGRAM_OIDC_CLIENT_ID` / `TELEGRAM_OIDC_CLIENT_SECRET`. Then run `pnpm dev`.
5. Open `<tunnel>/login` and choose **Masuk dengan Telegram**. Success lands on `/` with an HttpOnly `influency_session` cookie; a failed or cancelled login lands on `/login?error=…`.

Proxy check without Telegram: `curl -i http://localhost:3000/api/v1/auth/telegram/start` returns `302` to `oauth.telegram.org/auth` and sets an `influency_oidc` cookie.

### Image storage (local files or Cloudflare R2)

Creator avatars/banners and post images are kept in **private** storage chosen by `STORAGE_DRIVER` (tests use an in-memory fake):

- `local` (default, development only): files under `LOCAL_STORAGE_DIR` (relative to `apps/api`, gitignored). Post-image upload URLs point at the dev-only `PUT /api/v1/dev-storage/…` route with a short-lived HMAC token. The API refuses to start with `local` when `NODE_ENV=production`.
- `r2`: a private Cloudflare R2 bucket. Post images go straight from the browser to R2 through a presigned PUT URL (valid `UPLOAD_URL_TTL_SECONDS`).

To use R2:

1. In Cloudflare R2, create a bucket (keep public access **off**) and an R2 API token with **Object Read & Write** scoped to that bucket.
2. Add a CORS rule to the bucket so the browser can upload: allowed origin = your `WEB_ORIGIN`, allowed method `PUT`, allowed header `content-type`.
3. In `.env`, set `STORAGE_DRIVER=r2` and `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, then run `pnpm dev`.

Profile image check: 3. Log in as Claudia (`/login` → dev login), open `/studio/profile`, upload a banner (≤ 5 MB) and an avatar (≤ 2 MB), and edit the bio. Open the image URL in a logged-out window: it loads via `/api/v1/creators/claudiandreya/images/…`.

### Post video (stub or Cloudflare Stream)

Post videos use the driver chosen by `VIDEO_DRIVER` (tests use an in-memory fake). Every upload is private; viewers will get short-lived signed playback (US-021), never a public URL.

- `stub` (default, development only): the browser PUTs the file into the image storage above under `post-video/…`; the API checks the container bytes (MP4/MOV/WebM), shows it as processing for ~5 s, then ready. Uploads go through the Next `/api/v1` rewrite and are buffered in memory, so use small files (the fixture `apps/api/test/fixtures/sample.mp4` works). The API refuses to start with `stub` when `NODE_ENV=production`.
- `stream`: Cloudflare Stream direct creator uploads (basic POST, ≤ 200 MB), always created with `requireSignedURLs: true`. Set `VIDEO_DRIVER=stream`, `CLOUDFLARE_STREAM_ACCOUNT_ID` and `CLOUDFLARE_STREAM_TOKEN` (API token with **Stream Write**). Processing status is polled from the API while the studio page is open; there is no webhook yet. If a Content-Security-Policy is added later, `connect-src` must allow the Stream upload host (`upload.videodelivery.net`).

### Database

| Command           | What it does                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm db:migrate` | `prisma migrate dev`: creates a migration from schema changes and applies it to the local DB     |
| `pnpm db:reset`   | **Drops the local `DATABASE_URL` database**, re-applies every migration, then runs the demo seed |
| `pnpm db:seed`    | Runs the demo seed (`apps/api/prisma/seed/`); idempotent, so it is safe to run again             |

Migrations live in `apps/api/prisma/migrations/` and are committed; never edit one that has been applied. The seed refuses to run with `NODE_ENV=production`.

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

## CI

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `pnpm check` on every push to `main` and every pull request, against a PostgreSQL 18 service container. It uses placeholder configuration only (no repository secrets). Running `pnpm check` locally reproduces it.

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
