# Technical Plan: US-003 — API Skeleton: Health, Request ID & Error Format

## Architecture Overview

Agreed with the user (2026-11-03):

- **Request ID + JSON logs from Fastify itself.** Fastify's built-in pino logger writes structured JSON; its request id becomes our request ID (`req_<uuid>`), logged as `requestId` and returned in the `X-Request-Id` response header. An incoming `X-Request-Id` is reused **only if well-formed** (`/^[A-Za-z0-9_-]{1,64}$/`) so web → API calls can share one ID without allowing log injection. Nest's own framework logs use `ConsoleLogger({ json: true })`. No new logging dependencies.
- **One error shape** (handoff §11.5): `{ "error": { "code", "message", "requestId", "details" } }`. Error codes, HTTP statuses and default Bahasa Indonesia messages live in `packages/shared`. Services throw `DomainError(code, details?)`; one global catch-all filter maps every error (domain, Nest `HttpException`, Fastify body-parse errors, unknown) to that shape. Unknown errors → generic 500, full error logged server-side only.
- **Validation** via a ~15-line `ZodValidationPipe` in `common/` (no `nestjs-zod`). Failures → 400 `VALIDATION_FAILED` with `details.issues` (path + message, never input values).
- **Prisma now, schema later.** A global `PrismaService` (Prisma 7 client + `@prisma/adapter-pg`, no models yet) is added in `common/`; US-004 adds conventions, migrations and seed. `GET /api/v1/health` runs `SELECT 1` (2 s timeout): 200 when the DB answers, 503 otherwise, same body. Redis is reported as `"disabled"` until Phase 5 and never affects the result.
- **No OpenAPI yet.** No acceptance criterion needs it; it arrives with the first real feature endpoints.

Story change: acceptance criterion 1 now says Redis is reported as `disabled` until Phase 5 (Redis deferral, user decision 2026-11-03).

## Dependencies

- `@prisma/client` 7.10.1, `@prisma/adapter-pg` 7.10.1 (api dependencies); `prisma` 7.10.1 (api devDependency). Released 2026-10-15 (≥ 2 weeks old).
- No new logging/validation packages (`pino` ships with Fastify, `zod` 4.6.7 already in api).
- Real DB check needs local PostgreSQL 18 + root `.env` (US-002). Not installed yet on the dev machine → manual DB check may be "not verified".

## Risks

- **Fastify trusts `requestIdHeader` blindly.** If `requestIdHeader: 'x-request-id'` is set, Fastify uses the header value without calling `genReqId`. Mitigation: set `requestIdHeader: false` and read/validate the header inside `genReqId`. Tested.
- **Fastify-level errors (malformed JSON, wrong content type, body too large)** reach Nest's exception handler as plain `FastifyError`s, not `HttpException`s. Mitigation: the filter maps errors whose `code` starts with `FST_` and whose `statusCode` is 4xx to 400 `VALIDATION_FAILED` (404 → `NOT_FOUND`). Tested with a malformed JSON body.
- **Query strings in request logs** (e.g. the future Telegram OIDC callback `?code=…&state=…`) would leak secrets. Mitigation: request log serializer logs the path only (query stripped).
- **pnpm 12 blocks Prisma install scripts.** Decide per package in `pnpm-workspace.yaml` `allowBuilds`; approve only what `prisma generate` actually needs, and record why.
- **Generated Prisma client** must exist before typecheck/test/build on a fresh clone/CI. Mitigation: api `postinstall` runs `prisma generate` (no DB needed); generated folder is gitignored and excluded from lint/format.
- **Health hangs if the DB doesn't respond.** Mitigation: 2 s timeout → `down`.

## Tasks

### TASK-008: Request ID & Structured JSON Logging

Refactor `apps/api/src/app.factory.ts` so tests can build the same app with provider overrides:

```ts
export const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Fastify adapter with JSON logging (unless disabled) and validated request IDs. */
export function createFastifyAdapter(options: { logger: boolean; logStream?: Writable }): FastifyAdapter;

/** Applies prefix, global filter (TASK-009) and the X-Request-Id response hook. */
export function configureApp(app: NestFastifyApplication): NestFastifyApplication;

/** Builds the API application without listening, so tests can boot the same app. */
export async function createApp(options?: NestApplicationOptions): Promise<NestFastifyApplication>;
// = configureApp(await NestFactory.create(AppModule, createFastifyAdapter({ logger: options?.logger !== false }), options))
```

`createFastifyAdapter` passes to `new FastifyAdapter({...})`:
- `logger`: `false` when disabled, else `{ level: 'info', serializers: { req: (req) => ({ method: req.method, url: req.url.split('?')[0] }) } }` — path only, no query string, no headers.
- `requestIdHeader: false`, `requestIdLogLabel: 'requestId'`.
- `genReqId: (req) => { const h = req.headers[REQUEST_ID_HEADER]; return typeof h === 'string' && REQUEST_ID_PATTERN.test(h) ? h : \`req_${randomUUID()}\`; }` (`randomUUID` from `node:crypto`).

`configureApp`: `app.setGlobalPrefix(API_PREFIX)`; add the Fastify hook `app.getHttpAdapter().getInstance().addHook('onRequest', (req, reply, done) => { reply.header(REQUEST_ID_HEADER, req.id); done(); })` so **every** response (including 404s and errors) carries the ID.

`apps/api/src/main.ts`: `createApp({ logger: new ConsoleLogger({ json: true }) })` so Nest bootstrap logs are JSON too. Request logs come from Fastify (pino) with `requestId`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/app.factory.ts` | `createFastifyAdapter`, `configureApp`, request ID |
| MODIFY | `apps/api/src/main.ts` | JSON Nest logger |
| CREATE | `apps/api/src/request-id.spec.ts` | Tests |

**Testing (`request-id.spec.ts`, `createApp({ logger: false })` + `app.inject`):**
- No header → response `x-request-id` matches `/^req_[0-9a-f-]{36}$/`; two requests get different IDs.
- Incoming `x-request-id: web_abc-123` → echoed unchanged.
- Malformed incoming IDs (`a b`, `x\nInjected: 1` via raw string, 65 chars, empty) → replaced with a generated `req_…`.
- The header is present on a 404 response too.
- Log check: `createFastifyAdapter` takes an optional `logStream?: Writable` (passed as pino `stream`; used only by this test). Collect lines from a `PassThrough`, `GET /api/v1/x?code=secret` with `x-request-id: trace_1`, parse lines as JSON: the request lines have `"requestId":"trace_1"`, `req.url` is `/api/v1/x`, and no line contains `secret`.

---

### TASK-009: Standard Error Format, DomainError & Zod Validation Pipe

**Shared contract** — create `packages/shared/src/errors.ts`, export from `index.ts`:

```ts
import { z } from 'zod';

export const ERRORS = {
  VALIDATION_FAILED: { status: 400, message: 'Data yang dikirim tidak valid.' },
  AUTH_REQUIRED: { status: 401, message: 'Silakan masuk terlebih dahulu.' },
  FORBIDDEN: { status: 403, message: 'Anda tidak memiliki akses.' },
  CREATOR_NOT_APPROVED: { status: 403, message: 'Profil kreator belum disetujui.' },
  NOT_FOUND: { status: 404, message: 'Data tidak ditemukan.' },
  POST_NOT_AVAILABLE: { status: 404, message: 'Postingan tidak tersedia.' },
  TOPUP_NOT_FOUND: { status: 404, message: 'Top-up tidak ditemukan.' },
  INSUFFICIENT_COINS: { status: 402, message: 'Saldo Koin tidak cukup.' },
  OFFER_CHANGED: { status: 409, message: 'Harga atau penawaran telah berubah. Silakan periksa kembali.' },
  ALREADY_ENTITLED: { status: 409, message: 'Anda sudah memiliki akses ke konten ini.' },
  DUPLICATE_REQUEST: { status: 409, message: 'Permintaan ganda terdeteksi.' },
  PAYMENT_PENDING: { status: 409, message: 'Pembayaran masih diproses.' },
  PAYOUT_ON_HOLD: { status: 409, message: 'Pencairan sedang ditahan.' },
  PAYMENT_VERIFICATION_FAILED: { status: 400, message: 'Verifikasi pembayaran gagal.' },
  INTERNAL_ERROR: { status: 500, message: 'Terjadi kesalahan pada server. Silakan coba lagi.' },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERRORS;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.record(z.string(), z.unknown()).nullable(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
```

`details` is always present (`null` when there are none). Later stories add codes here (e.g. `RATE_LIMITED` with throttling).

**API** — `apps/api/src/common/domain-error.ts`:
```ts
export class DomainError extends Error {
  constructor(readonly code: ErrorCode, readonly details: Record<string, unknown> | null = null, message?: string) {
    super(message ?? ERRORS[code].message);
  }
}
```

`apps/api/src/common/all-exceptions.filter.ts` — `@Catch() class AllExceptionsFilter implements ExceptionFilter`, registered in `configureApp` via `app.useGlobalFilters(new AllExceptionsFilter())` (Nest also routes the unknown-route 404 and Fastify errors through global filters). Mapping:
1. `DomainError` → `ERRORS[code].status`, its message + details.
2. `HttpException` with status 400/401/403/404 → `VALIDATION_FAILED` / `AUTH_REQUIRED` / `FORBIDDEN` / `NOT_FOUND`, default shared message, `details: null` (Nest's message text is not exposed).
3. Fastify error (`code` starts with `FST_`, numeric `statusCode` 400–499) → 404 → `NOT_FOUND`; anything else → 400 `VALIDATION_FAILED`.
4. Anything else (incl. other `HttpException`s) → 500 `INTERNAL_ERROR`, `details: null`; log with `request.log.error({ err: exception }, 'Unhandled error')` (request logger already carries `requestId`). Never put `stack`/`message` of unknown errors in the response.
- `requestId` comes from `request.id` (Fastify request via `host.switchToHttp().getRequest<FastifyRequest>()`); reply via `FastifyReply.status(...).send(body)`.
- Log 4xx at most at `info`/not at all; 5xx at `error`.

`apps/api/src/common/zod-validation.pipe.ts`:
```ts
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success)
      throw new DomainError('VALIDATION_FAILED', {
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    return result.data;
  }
}
```
Usage pattern (document in `backend.md` "Validation and contracts"): `@Body(new ZodValidationPipe(createPostSchema)) body: CreatePostInput`.

Update `apps/api/src/app.spec.ts`: the unknown-route test now expects `{ error: { code: 'NOT_FOUND', message, requestId, details: null } }` and `requestId` equal to the `x-request-id` header.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `packages/shared/src/errors.ts` | `ERRORS`, `ErrorCode`, `errorResponseSchema` |
| MODIFY | `packages/shared/src/index.ts` | Export errors |
| CREATE | `packages/shared/src/errors.test.ts` | Contract tests |
| CREATE | `apps/api/src/common/domain-error.ts` | `DomainError` |
| CREATE | `apps/api/src/common/all-exceptions.filter.ts` | Global filter |
| CREATE | `apps/api/src/common/zod-validation.pipe.ts` | Validation pipe |
| MODIFY | `apps/api/src/app.factory.ts` | Register filter in `configureApp` |
| MODIFY | `apps/api/src/app.spec.ts` | New 404 body |
| CREATE | `apps/api/src/common/errors.spec.ts` | HTTP-level tests |
| MODIFY | `.agile/guidelines/backend.md` | Pipe usage line |

**Testing:**
- `errors.test.ts` (shared): every code has a 4xx/5xx status and non-empty message; a sample body parses with `errorResponseSchema`.
- `errors.spec.ts` (api): build a test module with a test-only controller (pattern as in `app.spec.ts` toolchain test) using `createFastifyAdapter({ logger: false })` + `configureApp`. Routes:
  - throws `new DomainError('INSUFFICIENT_COINS', { required: 5, available: 3 })` → 402, exact body, `requestId` = response header.
  - throws `new Error('db password=secret at /x/y.ts')` → 500 `INTERNAL_ERROR`, body contains neither `secret` nor `stack`/`.ts`.
  - throws `new ForbiddenException('internal reason')` → 403 `FORBIDDEN`, body doesn't contain `internal reason`.
  - `POST` with `@Body(new ZodValidationPipe(z.object({ name: z.string().min(1), age: z.number().int() })))`: invalid body → 400 `VALIDATION_FAILED`, `details.issues` lists `name` and `age`; valid body → 201 with parsed data.
  - malformed JSON (`content-type: application/json`, payload `{"name":`) → 400 `VALIDATION_FAILED` in the same shape.
  - unknown route → 404 `NOT_FOUND`.
- Every error response body parses with `errorResponseSchema`.

---

### TASK-010: PrismaService & Health Endpoint

**Prisma setup (no models — US-004 owns the schema):**
- Add `@prisma/client` 7.10.1 + `@prisma/adapter-pg` 7.10.1 to api `dependencies`, `prisma` 7.10.1 to `devDependencies`. Resolve `allowBuilds` for any Prisma package pnpm blocks (approve only what `prisma generate` needs; comment why).
- `apps/api/prisma/schema.prisma`:
  ```prisma
  generator client {
    provider     = "prisma-client"
    output       = "../src/generated/prisma"
    moduleFormat = "esm"
  }

  datasource db {
    provider = "postgresql"
  }
  ```
  (Prisma 7: connection URL lives in `prisma.config.ts`, not the schema. Follow current Prisma docs if field names differ; note it in the QA report.)
- `apps/api/prisma.config.ts`: load the repo-root `.env` if present (`process.loadEnvFile`, same as `loadEnvFile` in `common/env.ts`), `defineConfig({ schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' }, datasource: { url: … DATABASE_URL } })`. `prisma generate` **must work without `DATABASE_URL`** (fresh clone/CI) — verify; if Prisma's `env()` helper throws when unset, read `process.env.DATABASE_URL` directly.
- api scripts: `"generate": "prisma generate"`, `"postinstall": "prisma generate"`.
- Ignore `apps/api/src/generated/` in `.gitignore`, ESLint (api `eslint.config.mjs` ignores) and Prettier (`.prettierignore`). Add `prisma.config.ts` to api `tsconfig.json` `include` if ESLint type-aware linting needs it.
- If the generated client's relative imports break under the api's ESM/TS settings, fix via generator options (`importFileExtension = "js"`) rather than editing generated code.

**Env provider + PrismaService** in `apps/api/src/common/`:
- `common.module.ts`: `@Global() @Module({ providers: [{ provide: ENV, useFactory: () => parseEnv(process.env) }, PrismaService], exports: [ENV, PrismaService] })`. `export const ENV = Symbol('ENV')` in `env.ts`. Import `CommonModule` in `AppModule`. (`main.ts` keeps its early `parseEnv` for the fail-fast message.)
- `prisma.service.ts`:
  ```ts
  @Injectable()
  export class PrismaService extends PrismaClient implements OnModuleDestroy {
    constructor(@Inject(ENV) env: Env) {
      super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
    }
    async onModuleDestroy(): Promise<void> { await this.$disconnect(); }
  }
  ```
  No `$connect()` on init — the app must boot without a reachable DB (health reports it); the adapter connects lazily.
- `apps/api/vitest.config.ts`: `test.env: { DATABASE_URL: 'postgresql://influency:test@localhost:5432/influency_test' }` (placeholder; never contacted by unit tests) so `createApp` boots in tests.

**Health module** `apps/api/src/modules/health/`:
- `health.service.ts`: `check(): Promise<HealthResult>` runs `this.prisma.$queryRaw\`SELECT 1\`` raced against a 2000 ms timeout. Returns
  ```ts
  type HealthResult = { status: 'ok' | 'degraded'; checks: { database: 'up' | 'down'; redis: 'disabled' } };
  ```
  `redis: 'disabled'` is a constant (comment: real check arrives with BullMQ in Phase 5). On DB failure, log `error.message` at `warn` via a Nest `Logger` — never the connection string. No error details in the response.
- `health.controller.ts`: `@Controller('health')`, `@Get()` with `@Res({ passthrough: true }) reply: FastifyReply`; sets `reply.status(503)` when `database === 'down'`; returns the result. No auth (public; reveals nothing secret).
- `health.module.ts`; import into `AppModule`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/package.json` | Prisma deps + `generate`/`postinstall` |
| MODIFY | `pnpm-workspace.yaml` | `allowBuilds` decisions for Prisma |
| CREATE | `apps/api/prisma/schema.prisma` | Generator + datasource, no models |
| CREATE | `apps/api/prisma.config.ts` | Prisma 7 config, root `.env` |
| MODIFY | `.gitignore`, `.prettierignore`, `apps/api/eslint.config.mjs` | Ignore generated client |
| MODIFY | `apps/api/src/common/env.ts` | `ENV` token |
| CREATE | `apps/api/src/common/common.module.ts` | Global env + Prisma providers |
| CREATE | `apps/api/src/common/prisma.service.ts` | `PrismaService` |
| MODIFY | `apps/api/src/app.module.ts` | Import `CommonModule`, `HealthModule` |
| MODIFY | `apps/api/vitest.config.ts` | Test `DATABASE_URL` placeholder |
| CREATE | `apps/api/src/modules/health/health.{module,controller,service}.ts` | Health endpoint |
| CREATE | `apps/api/src/modules/health/health.spec.ts` | Tests |
| MODIFY | `README.md` | `GET /api/v1/health`; `pnpm --filter @influency/api generate` |

**Testing (`health.spec.ts`):** `Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue({ $queryRaw: vi.fn(...) })`, then `createNestApplication(createFastifyAdapter({ logger: false }))` + `configureApp`.
- DB answers → 200 `{ status: 'ok', checks: { database: 'up', redis: 'disabled' } }`, `x-request-id` header present.
- `$queryRaw` rejects with `new Error('connect ECONNREFUSED postgresql://u:pw@host')` → 503 `{ status: 'degraded', checks: { database: 'down', redis: 'disabled' } }`; body contains no `pw`/`ECONNREFUSED`.
- `$queryRaw` never resolves → 503 within the timeout (use fake timers or a short injectable timeout).
- `createApp({ logger: false })` still boots with no reachable DB (existing `app.spec.ts`).
- Fresh-clone check: delete `apps/api/src/generated`, run `pnpm install` without `.env` → client generated; `pnpm check` passes.
- Manual QA (only once PostgreSQL is installed): `pnpm dev`, `curl -i localhost:4000/api/v1/health` → 200 + `database: up`; stop the PostgreSQL service → 503 `database: down`. Otherwise record as not verified.

## Acceptance Criteria Mapping

| Acceptance criterion | Task(s) |
|---|---|
| `GET /api/v1/health` returns 200 with database status; Redis reported `disabled` until Phase 5 | TASK-010 |
| Every response carries a request ID that also appears in the JSON logs | TASK-008 |
| Domain errors use `{ error: { code, message, requestId, details } }`, codes in `packages/shared` | TASK-009 |
| Unexpected errors → generic 500 without stack/internals | TASK-009 |
| Validation failures → 400 in the same format | TASK-009 |
