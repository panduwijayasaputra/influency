# Tech Stack

> Source: handoff §4. Items are **[RECOMMENDED]** — change only via ADR in `docs/ADR/`. Pin exact versions when scaffolding and record them here.

## Overview

Influency is a pnpm TypeScript monorepo, deployed as a **modular monolith**: one web app, one API, one worker. No microservices, Kubernetes or Kafka for MVP.

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js LTS, pinned in `.nvmrc` | |
| Language | TypeScript `strict` | No `any` escapes in domain code |
| Package manager | pnpm workspaces | `pnpm --filter <app> <script>` |
| Web | Next.js App Router + React | SSR for public creator pages |
| UI | Tailwind CSS + shadcn/ui | Mobile-first, accessible |
| API | NestJS with Fastify adapter | REST under `/api/v1`, OpenAPI docs |
| Validation | Zod schemas in `packages/shared` | One pattern everywhere (see backend.md) |
| Database | PostgreSQL | Source of truth for all money and access |
| ORM | Prisma | Migrations in VCS |
| Jobs | BullMQ + Redis | Delivery only — never source of truth |
| Auth | Telegram Login OIDC (Auth Code + PKCE) | Server-side token verification, cookie sessions |
| Bot | grammY | One official Influency bot, notifications only |
| Payments | Midtrans Snap **Sandbox** | Behind `PaymentGatewayProvider` interface |
| Images | Cloudflare R2 (S3-compatible, private bucket) | Presigned upload/read URLs |
| Video | Cloudflare Stream (private, signed tokens) | Adapter; stub allowed early |
| Tests | Vitest (unit/integration), Fastify `inject` or Supertest (HTTP), Playwright (e2e) | |
| CI | GitHub Actions | lint, typecheck, test |
| Local infra | Docker Compose | PostgreSQL, Redis |
| Observability | Structured JSON logs, optional Sentry | No secrets/PII in logs |

## Pinned versions (US-001, 2026-11-03)

| Tool | Version | Constraint |
|---|---|---|
| Node.js | 24 LTS (`.nvmrc`) | |
| pnpm | 12.14.0 (`packageManager`) | |
| TypeScript | 6.0.3 | typescript-eslint requires `<6.1` — do not move to TS 7 yet |
| ESLint | 9.39.5 | eslint-config-next plugins support ESLint ≤ 9 |
| typescript-eslint | 8.72.0 | |
| Prettier | 3.9.10 | + prettier-plugin-tailwindcss 0.8.1 |
| Vitest / Vite | 5.0.5 / 8.3.4 | Vite 8 handles NestJS decorators + metadata natively (no SWC plugin) |
| Next.js | 16.4.2 | React 19.3.1; `cacheComponents` + `partialPrefetching` on |
| Tailwind CSS | 4.3.3 | via `@tailwindcss/turbopack` (no PostCSS config) |
| shadcn/ui | CLI 4.22.1 | Radix base, new-york style, `cn` 0.5.0, `radix-ui` 1.8.1, `lucide-react` 1.59.0 |
| NestJS | 12.2.0 | ESM (`"type": "module"`), `@nestjs/platform-fastify` (Fastify 5) |
| Zod | 4.6.7 | |
| Fastify | 5.12.7 | direct api dep (US-003) — same version `@nestjs/platform-fastify` uses; needed for `LogController` + request/reply types |
| Prisma | 7.10.1 | `prisma`, `@prisma/client`, `@prisma/adapter-pg` (US-003); `prisma-client` generator, URL in `prisma.config.ts` |
| tsup | 9.0.0 | builds `@influency/shared` (ESM + d.ts) |

All packages are ESM. Every dependency is pinned exactly; new versions must be at least two weeks old.

## Repository layout

```text
apps/
  web/        Next.js app (src/app/(public|auth|subscriber)/, studio/, admin/)
  api/        NestJS app (src/modules/<domain>/, prisma/)
  worker/     BullMQ consumers (may live inside api initially)
packages/
  shared/     Zod schemas, DTO types, error codes, enums
  config/     shared tsconfig / eslint / prettier
infra/
  docker-compose.yml
docs/
  ADR/
.env.example
```

## Environments

- **Development / CI:** local Postgres + Redis, fake top-up provider and fake OIDC adapter available for tests, Midtrans Sandbox for integration.
- **Staging:** public HTTPS URL (needed for Telegram Login redirect and Midtrans webhooks).
- **Production:** out of scope until compliance gates (handoff §9.6, Phase 7). `MIDTRANS_IS_PRODUCTION` stays `false`.

Env var names: see handoff §8.7 and `.env.example`. Never commit real values.

## Out of scope for MVP

Telegram Mini App runtime/checkout, Telegram Stars, Lynk.id, per-creator bots, native mobile apps, multi-currency, automatic payouts, recurring auto-charges, multi-gateway failover.
