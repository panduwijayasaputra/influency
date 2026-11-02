# Technical Plan: US-002 — Local Infrastructure & Environment Config

## Architecture Overview

Agreed with the user (2026-11-03):

- **No Docker for now.** Docker is not installed on the dev machine. PostgreSQL 18 runs natively as a Windows service (installed by the user via `winget`). No `docker-compose.yml` in this story; it can be added later (e.g. for CI in US-005) without changing app code, because apps only see `DATABASE_URL`.
- **Redis deferred to Phase 5.** Nothing uses it before BullMQ jobs (US-034/US-036), and Redis has no official Windows build. `REDIS_URL` stays in `.env.example`, marked as not yet required.
- **One root `.env`.** The API loads `<repo root>/.env` at startup with Node 24's built-in `process.loadEnvFile` (no `dotenv` dependency). Real environment variables win over the file.
- **Validate only what code uses today.** A Zod schema in the API checks `NODE_ENV`, `API_PORT`, `DATABASE_URL`, `MIDTRANS_IS_PRODUCTION` at startup and exits with a list of every missing/invalid variable. Later stories add their own variables to the same schema. The web app reads no env yet, so it gets no validation in this story.
- **Sandbox lock in code.** `MIDTRANS_IS_PRODUCTION` defaults to `false`; the value `true` is rejected with "production payments are disabled for the MVP (sandbox only)".

Story change: acceptance criterion 1 ("`infra/docker-compose.yml` starts PostgreSQL and Redis") is replaced by a documented native PostgreSQL setup; Redis is deferred. The story file is updated in TASK-006.

## Dependencies

- PostgreSQL 18 installed locally by the user: `winget install --id PostgreSQL.PostgreSQL.18` (admin prompt; choose a superuser password)
- `zod` 4.6.7 added to `@influency/api` (already used by `@influency/shared`)

## Risks

- **No local PostgreSQL yet** → validation tests don't need a database; the `DATABASE_URL` connection check in QA is marked "not verified" until the user has installed PostgreSQL. Actual connection checks belong to US-003 (health endpoint).
- **Developers without a `.env`** will see the API refuse to start → intended (fail fast); the error tells them to copy `.env.example`.
- **`process.loadEnvFile` precedence** → covered by a unit test that an existing `process.env` value is not overwritten.

## Tasks

### TASK-006: Environment Example & Local PostgreSQL Setup Docs

1. Create `.env.example` at the repo root with every variable from handoff §8.7, placeholders only, grouped with one-line comments. Mark which are required today:
   ```dotenv
   # --- Required now (validated by the API at startup) ---
   NODE_ENV=development
   API_PORT=4000
   DATABASE_URL=postgresql://influency:CHANGE_ME@localhost:5432/influency
   # Sandbox only. The API refuses to start if this is true.
   MIDTRANS_IS_PRODUCTION=false

   # --- Not used yet (added to validation by the story that needs them) ---
   WEB_ORIGIN=http://localhost:3000
   API_ORIGIN=http://localhost:4000
   # Redis is deferred until Phase 5 (background jobs)
   REDIS_URL=redis://localhost:6379
   SESSION_SECRET=SET_LOCALLY_DO_NOT_COMMIT
   TELEGRAM_OIDC_CLIENT_ID=SET_LOCALLY
   ... (rest of §8.7: TELEGRAM_OIDC_CLIENT_SECRET, TELEGRAM_OIDC_REDIRECT_URI, TELEGRAM_BOT_TOKEN,
        TELEGRAM_BOT_WEBHOOK_SECRET, PAYMENT_PROVIDER=midtrans, MIDTRANS_SERVER_KEY=SANDBOX_KEY_ONLY,
        MIDTRANS_CLIENT_KEY=SANDBOX_KEY_ONLY, MIDTRANS_MERCHANT_ID, MIDTRANS_WEBHOOK_URL, R2_ACCOUNT_ID,
        R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, CLOUDFLARE_STREAM_ACCOUNT_ID, CLOUDFLARE_STREAM_TOKEN)
   ```
   `.gitignore` already ignores `.env`/`.env.*` and keeps `.env.example`; verify, don't change.
2. README: add a "Local database" section after Prerequisites:
   - `winget install --id PostgreSQL.PostgreSQL.18` (or the installer from postgresql.org); remember the `postgres` password.
   - Create the app role and database (psql from `C:\Program Files\PostgreSQL\18\bin`):
     ```sql
     CREATE ROLE influency WITH LOGIN PASSWORD 'choose-a-local-password';
     CREATE DATABASE influency OWNER influency;
     ```
   - `cp .env.example .env` and set `DATABASE_URL`.
   - Note: Redis is not needed until Phase 5; Docker setup may return later.
   - Replace the line "Docker Compose (PostgreSQL, Redis), environment configuration and the database arrive in the next stories (US-002 – US-004)" with the current state.
3. Update the story file `.agile/features/project-foundation/US-002-local-infrastructure-and-environment-config.md`: replace criterion 1 with "Local PostgreSQL setup is documented (native install, no Docker for now) and the documented `DATABASE_URL` format connects to it"; add a note "Redis deferred to Phase 5 (user decision 2026-11-03)". Keep the other criteria.
4. CLAUDE.md "Commands": one line that the API needs a root `.env` (copy `.env.example`) and a local PostgreSQL 18.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `.env.example` | All env vars, placeholders only |
| MODIFY | `README.md` | Local PostgreSQL + `.env` setup |
| MODIFY | `CLAUDE.md` | `.env` + PostgreSQL prerequisite |
| MODIFY | `.agile/features/project-foundation/US-002-…md` | Criterion 1 per user decision |

**Testing:**
- `git check-ignore .env` matches; `git check-ignore .env.example` does not.
- `.env.example` contains every §8.7 variable name (script/grep check) and no real-looking secrets.
- `pnpm format:check` passes.

---

### TASK-007: API Environment Validation (Fail Fast)

Create `apps/api/src/common/env.ts`:

```ts
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  MIDTRANS_IS_PRODUCTION: z
    .enum(['true', 'false'])
    .default('false')
    .refine((v) => v === 'false', 'production payments are disabled for the MVP (sandbox only)')
    .transform(() => false as const),
});

export type Env = z.infer<typeof envSchema>;

/** Parses the environment; throws one Error listing every invalid or missing variable. */
export function parseEnv(source: Record<string, string | undefined>): Env;
```

- `parseEnv` uses `envSchema.safeParse(source)`; on failure throws `Error` with message:
  ```
  Invalid environment configuration (copy .env.example to .env at the repo root):
    - DATABASE_URL: <zod message>
    - MIDTRANS_IS_PRODUCTION: production payments are disabled for the MVP (sandbox only)
  ```
  One line per issue, path joined with `.`. Never print variable **values** (they may be secrets).
- Add `loadEnvFile(path: string): void` helper in the same file: if the file exists, call `process.loadEnvFile(path)`; otherwise do nothing (CI/production provide real env vars).
- `apps/api/src/main.ts`:
  ```ts
  loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); // repo-root .env (dist/ or src/ → apps/api → root)
  let env: Env;
  try {
    env = parseEnv(process.env);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
  const app = await createApp();
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  ```
  Remove the old `API_PORT` fallback comment. `createApp()` stays env-free so existing tests are unaffected. Check that `../../../.env` resolves to the repo root for both `dist/main.js` (built) and the `nest start --watch` output; adjust if Nest's output path differs.
- Add `zod: "4.6.7"` to `apps/api/package.json` dependencies.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/common/env.ts` | Schema, `parseEnv`, `loadEnvFile` |
| CREATE | `apps/api/src/common/env.spec.ts` | Unit tests |
| MODIFY | `apps/api/src/main.ts` | Load root `.env`, validate, use `env.API_PORT` |
| MODIFY | `apps/api/package.json` | Add `zod` |
| DELETE | `apps/api/src/common/.gitkeep` | Folder now has files |

**Testing (`env.spec.ts`):**
- Valid minimal input (`DATABASE_URL` only) → defaults `NODE_ENV=development`, `API_PORT=4000`, `MIDTRANS_IS_PRODUCTION=false`.
- Missing `DATABASE_URL` → throws; message names `DATABASE_URL` and mentions `.env.example`.
- `DATABASE_URL=mysql://…` and `not-a-url` → throws.
- `API_PORT=abc` / `0` / `70000` → throws; `API_PORT=4123` → number `4123`.
- `MIDTRANS_IS_PRODUCTION=true` → throws with the sandbox-only message; `false` → `false`.
- Several problems at once → message lists all of them.
- Error message never contains the provided `DATABASE_URL` value (secret safety).
- `loadEnvFile`: missing file → no throw; existing temp file sets an unset variable but does not overwrite one already in `process.env` (use a temp dir, restore `process.env` after).
- Manual QA: `pnpm --filter @influency/api start` with no `.env` → exits 1 with the list; with a valid `.env` → listens on `API_PORT`; with `MIDTRANS_IS_PRODUCTION=true` → exits 1.
- Manual QA (only once PostgreSQL is installed): `psql "<DATABASE_URL>" -c "select 1"` succeeds; otherwise record as not verified.

## Acceptance Criteria Mapping

| Acceptance criterion | Task(s) |
|---|---|
| Local PostgreSQL setup documented, `DATABASE_URL` connects (replaces Docker Compose) | TASK-006 (docs), QA connection check once installed |
| `.env.example` lists every §8.7 variable with placeholders | TASK-006 |
| `.env` gitignored, no real credentials in repo | TASK-006 (verify) |
| Apps fail fast with a clear message on missing env | TASK-007 |
| `MIDTRANS_IS_PRODUCTION` defaults to `false` | TASK-007 (plus `true` rejected) |
