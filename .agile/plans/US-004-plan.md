# Technical Plan: US-004 — Database Baseline & Demo Seed

## Architecture Overview

Agreed with the user (2026-11-03):

- **Baseline = `users` table only.** It sets the conventions and is the first table US-006 needs. Every later table ships with the story that uses it (its own migration), so no §10 guesses get frozen now.
- **Conventions** (written as a header comment in `schema.prisma`, enforced by an integration test):
  - Models PascalCase / fields camelCase in Prisma, mapped to snake_case via `@@map` / `@map`; enums mapped too (`@@map("user_status")`).
  - Primary key: `id String @id @default(dbgenerated("uuidv7()")) @db.Uuid`. PostgreSQL 18 has native `uuidv7()`, which is time-ordered and also works for raw-SQL inserts.
  - Timestamps: `DateTime @db.Timestamptz(3)`; `createdAt @default(now())`, `updatedAt @updatedAt`.
  - Koin = `BigInt` (or `Int` where bounded), IDR = integer rupiah `BigInt`/`Int`, commission = integer basis points. No `Float`/`Decimal`.
- **Integration tests run inside `pnpm test`** against a separate `influency_test` database (`TEST_DATABASE_URL`). A Vitest `globalSetup` resets it with `prisma migrate reset --force` once per run. So `pnpm check` needs local Postgres from now on, and CI (US-005) will add a Postgres service.
- **Seed runs with `tsx`** (new devDep), wired as `migrations.seed` in `prisma.config.ts`. Prisma 7 no longer seeds automatically on `migrate reset`/`migrate dev`, so `pnpm db:reset` runs reset and seed explicitly.
- **Seed structure:** `prisma/seed/index.ts` (entry) → `seed(prisma)` runs an ordered list of steps; fixed demo IDs live in `prisma/seed/demo-ids.ts`. This story seeds the 5 demo users from handoff §15.5. US-006/009/010/044 append steps (identities, roles, creator profiles, posts, plans, coin packages). Every step is idempotent (`upsert` by fixed id).

No ADR needed: this follows the [RECOMMENDED] Prisma + PostgreSQL choice. Docker Compose remains deferred (native Postgres 18, per US-002).

## Dependencies

- `tsx` devDependency in `apps/api`, pinned exactly to a version published ≥ 2 weeks ago. It uses the `esbuild` already in the tree, and `allowBuilds: esbuild: false` stays as is (esbuild ships prebuilt binaries).
- Local DB role `influency` needs **`CREATEDB`**. `prisma migrate dev` creates a shadow database, and `migrate reset` may (re)create the test DB.
- A second local database `influency_test` + `TEST_DATABASE_URL` in the root `.env`.

## Risks

- **Wiping the dev DB by mistake** (the test setup runs `migrate reset`). Mitigation: `globalSetup` refuses to run unless the `TEST_DATABASE_URL` database name ends in `_test` and differs from `DATABASE_URL`. The seed refuses `NODE_ENV=production`.
- **Prisma 7 config/seed API drift.** The dev must confirm `migrations.seed` in `prisma.config.ts` and the no-auto-seed behaviour against the current Prisma 7 docs. If they differ, follow the docs and note it in the QA report.
- **`pnpm check` now needs Postgres.** Mitigation: `globalSetup` fails fast with one clear message ("start PostgreSQL / set TEST_DATABASE_URL, see README"), not a wall of connection errors.
- **Shared test DB across parallel test files.** It's fine for now (the convention test only reads the catalog). Later stories that write data must use their own fixed ids or clean up their rows. Note this in `backend.md`.
- **Windows:** `pnpm`/`prisma` are `.cmd` shims, so spawn them with `execSync` (shell), not `execFileSync`.

## Tasks

### TASK-011: Schema conventions + `users` baseline migration

Add the conventions and the first model, then create the first migration.

`apps/api/prisma/schema.prisma`: replace the "Models… arrive in US-004" comment with a short conventions header (the bullet list from Architecture Overview, ≤ 10 lines), then:

```prisma
enum UserStatus {
  ACTIVE
  SUSPENDED

  @@map("user_status")
}

model User {
  id          String     @id @default(dbgenerated("uuidv7()")) @db.Uuid
  displayName String     @map("display_name")
  status      UserStatus @default(ACTIVE)
  createdAt   DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime   @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@map("users")
}
```

Generate the migration with `pnpm --filter @influency/api exec prisma migrate dev --name init_users` (needs a local DB + `CREATEDB`). Commit `apps/api/prisma/migrations/<timestamp>_init_users/migration.sql` and `migration_lock.toml`. Check the SQL uses `UUID NOT NULL DEFAULT uuidv7()` and `TIMESTAMPTZ(3)`. Don't hand-edit it after it's applied.

Add root scripts in `package.json` (they delegate to the api package so they run from the repo root) and api scripts in `apps/api/package.json`:

| Package | Script | Command |
|---|---|---|
| api | `db:migrate` | `prisma migrate dev` |
| api | `db:deploy` | `prisma migrate deploy` |
| root | `db:migrate` | `pnpm --filter @influency/api db:migrate` |

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | conventions header, `UserStatus`, `User` |
| CREATE | `apps/api/prisma/migrations/<ts>_init_users/migration.sql` | baseline migration (generated) |
| CREATE | `apps/api/prisma/migrations/migration_lock.toml` | generated |
| MODIFY | `apps/api/package.json` | `db:migrate`, `db:deploy` scripts |
| MODIFY | `package.json` | root `db:migrate` |

**Testing:**
- `prisma migrate reset --force` on an empty DB applies cleanly (also covered automatically by TASK-012's `globalSetup`).
- `pnpm typecheck` passes with the regenerated client.

---

### TASK-012: Real-Postgres test harness + schema-convention integration test

**Test DB setup**

`apps/api/vitest.config.ts`:
- Load the root `.env` (same pattern as `prisma.config.ts`: `process.loadEnvFile` if it exists).
- `test.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? '<current placeholder>'`. Unit tests that boot the app still never connect; integration tests do, through the same variable.
- `test.globalSetup: ['./test/global-setup.ts']`.
- `include: ['src/**/*.spec.ts', 'prisma/**/*.spec.ts']` (the seed spec lives next to the seed, TASK-013).

`apps/api/test/global-setup.ts` (default export `async function setup()`):
1. Read `TEST_DATABASE_URL`. If missing, throw `TEST_DATABASE_URL is not set — see README "Local database"`.
2. Safety guard: parse with `new URL()`. Throw if the database name (pathname without `/`) doesn't end in `_test`, or if it equals the `DATABASE_URL` database name.
3. `execSync('pnpm exec prisma migrate reset --force', { cwd: <api dir>, stdio: 'inherit', env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL } })`. If it fails, rethrow one message pointing at the README.
- Add `test` to `include` in `apps/api/tsconfig.json`; `tsconfig.build.json` already only includes `src`.

`apps/api/test/prisma.ts`: a tiny helper `createTestPrisma(): PrismaClient` → `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })`. Integration specs call it in `beforeAll` and `$disconnect()` in `afterAll`.

**Convention test:** `apps/api/src/common/schema-conventions.integration.spec.ts` queries `information_schema.columns` / `information_schema.tables` for `table_schema = 'public'`, excluding `_prisma_migrations`, and asserts:
1. Every table and column name matches `/^[a-z][a-z0-9_]*$/`.
2. Every table has an `id` column of `data_type = 'uuid'`, and every column named `id` or ending in `_id` is `uuid`.
3. No column has `data_type` in `timestamp without time zone`, `real`, `double precision`, `numeric`, `money`.
4. Sanity: the `users` table exists, so the test never passes on an empty schema.

Each failed assertion lists the offending `table.column` (e.g. `expect(violations).toEqual([])`).

**Config/docs:**
- `.env.example` "Required now" section: `TEST_DATABASE_URL=postgresql://influency:CHANGE_ME@localhost:5432/influency_test` with the comment `# Used by pnpm test; reset on every run. Name must end in _test.`
- README "Local database": add `ALTER ROLE influency CREATEDB;` and `CREATE DATABASE influency_test OWNER influency;` to step 2, plus one line saying `pnpm test` needs Postgres running.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/vitest.config.ts` | load root .env, test DB URL, globalSetup, include prisma/ |
| CREATE | `apps/api/test/global-setup.ts` | guard + `migrate reset` on test DB |
| CREATE | `apps/api/test/prisma.ts` | `createTestPrisma()` |
| CREATE | `apps/api/src/common/schema-conventions.integration.spec.ts` | enforces conventions on every migration |
| MODIFY | `apps/api/tsconfig.json` | include `test`, `prisma` |
| MODIFY | `.env.example` | `TEST_DATABASE_URL` |
| MODIFY | `README.md` | CREATEDB, test DB, Postgres needed for tests |

**Testing:**
- Convention spec passes on the TASK-011 schema.
- Prove the test bites: temporarily add a `Float` column locally, see the spec fail and name the column, then revert (don't commit).
- Guard: unit-test the guard by extracting `assertSafeTestDatabaseUrl(testUrl, devUrl)` into `test/global-setup.ts` and covering it in `test/global-setup.spec.ts` (missing, not `_test`, same as dev → throws; valid → ok). Add `test/**/*.spec.ts` to `include`.
- Existing unit tests (health, errors, env) still pass.

---

### TASK-013: Resettable demo seed + `db:reset` command

**Seed code** (`apps/api/prisma/seed/`):

`demo-ids.ts`: fixed UUIDs that later stories reference:
```ts
export const DEMO_USER_IDS = {
  claudia: '0190a000-0000-7000-8000-000000000001',
  creatorB: '0190a000-0000-7000-8000-000000000002',
  subscriberA: '0190a000-0000-7000-8000-000000000003',
  subscriberB: '0190a000-0000-7000-8000-000000000004',
  admin: '0190a000-0000-7000-8000-000000000005',
} as const;
```
(These are valid UUIDv7-shaped literals; slugs `claudiandreya` / `creatorb` belong to US-010's creator-profile step, not here.)

`users.ts`: `export async function seedUsers(prisma: PrismaClient): Promise<void>` upserts the 5 users by id (`display_name`: `Claudia Andreya`, `Creator B`, `Subscriber A`, `Subscriber B`, `Admin`; status `ACTIVE`). Use `upsert({ where: { id }, create, update: { displayName } })` so re-running is a no-op.

`seed.ts`:
```ts
type SeedStep = { name: string; run: (prisma: PrismaClient) => Promise<void> };
// Later stories append steps (identities, roles, creator profiles, posts, plans, coin packages). Order matters: FKs.
export const seedSteps: SeedStep[] = [{ name: 'demo users', run: seedUsers }];
export async function seed(prisma: PrismaClient): Promise<void> { for (const step of seedSteps) await step.run(prisma); }
```

`index.ts` (entry): load the root `.env` (same as `prisma.config.ts`). Refuse with exit 1 if `NODE_ENV === 'production'`. Build a `PrismaClient` with `PrismaPg({ connectionString: process.env.DATABASE_URL })`, run `seed`, log `seeded: <step names>`, and `$disconnect` in `finally`. Import the client from `../../src/generated/prisma/client.js`.

**Wiring:**
- `apps/api/package.json`: devDep `tsx` (exact pin); scripts `db:seed`: `prisma db seed`, `db:reset`: `prisma migrate reset --force && prisma db seed`.
- `apps/api/prisma.config.ts`: `migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed/index.ts' }`. Verify the key against current Prisma 7 docs.
- Root `package.json`: `db:reset` and `db:seed` delegating via `pnpm --filter @influency/api`.
- `apps/api/eslint.config.mjs`: nothing to change unless lint flags `prisma/` (it's already linted as part of `.`). Check that `pnpm lint` passes.

**Docs:**
- README: a "Database" subsection: `pnpm db:migrate` (create/apply migrations in dev), `pnpm db:reset` (**drops the local DB**, re-applies migrations, re-seeds), `pnpm db:seed`; mention that the seed is idempotent.
- CLAUDE.md "Commands": add `pnpm db:reset` and `pnpm db:migrate`, plus a gotcha that `pnpm test` needs Postgres + `TEST_DATABASE_URL`.
- `.agile/guidelines/codebase-map.md`: Entities table (`User` → `users`), `prisma/seed/` pattern ("add a step to `seedSteps`, reference ids from `demo-ids.ts`"), test harness pattern (`*.integration.spec.ts`, `createTestPrisma()`, shared `influency_test` DB reset once per run → use your own fixed ids / clean up).
- `.agile/guidelines/backend.md` Database section: replace the generic UUID line with the concrete `dbgenerated("uuidv7()") @db.Uuid` + `@db.Timestamptz(3)` pattern.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/prisma/seed/demo-ids.ts` | fixed demo ids |
| CREATE | `apps/api/prisma/seed/users.ts` | `seedUsers` |
| CREATE | `apps/api/prisma/seed/seed.ts` | `seedSteps`, `seed()` |
| CREATE | `apps/api/prisma/seed/index.ts` | CLI entry, prod guard |
| CREATE | `apps/api/prisma/seed/seed.integration.spec.ts` | idempotency test |
| MODIFY | `apps/api/prisma.config.ts` | `migrations.seed` |
| MODIFY | `apps/api/package.json` | `tsx`, `db:seed`, `db:reset` |
| MODIFY | `package.json` | root `db:reset`, `db:seed` |
| MODIFY | `pnpm-lock.yaml` | tsx |
| MODIFY | `README.md`, `CLAUDE.md` | commands |
| MODIFY | `.agile/guidelines/codebase-map.md`, `.agile/guidelines/backend.md` | patterns |

**Testing:**
- `seed.integration.spec.ts` (against the test DB via `createTestPrisma()`): run `seed()` twice, then assert that exactly the 5 `DEMO_USER_IDS` exist with the expected display names and status `ACTIVE`, and that the row count for those ids is 5 (idempotent, no duplicates).
- Manual: `pnpm db:reset` on the dev DB → exits 0 and logs `seeded: demo users`; running it a second time also succeeds; `psql … -c "select id, display_name from users"` shows 5 rows.
- `pnpm check` passes with Postgres running.

## Acceptance Criteria Mapping

| Acceptance criterion | Task |
|---|---|
| Prisma migrations committed and apply cleanly to an empty DB | TASK-011 (migration), TASK-012 (`migrate reset` on every test run) |
| One documented command resets the local DB and re-runs the seed | TASK-013 (`pnpm db:reset`, README) |
| Conventions: UUID PKs, UTC timestamps, snake_case, integer Koin/IDR | TASK-011 (schema), TASK-012 (convention test enforces them) |
| Seed structured for the §15.5 demo identities | TASK-013 (`seedSteps`, `DEMO_USER_IDS`, 5 demo users) |
