# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Influency is in early development: the monorepo foundation (US-001) exists; product features do not yet. The single source of truth is [.agile/.docs/INFLUENCY_MVP_CLAUDE_HANDOFF_v1.md](.agile/.docs/INFLUENCY_MVP_CLAUDE_HANDOFF_v1.md) (Bahasa Indonesia prose, English identifiers). Read it in full before scaffolding or making architectural decisions. It tags items as **[LOCKED]** (user decision — don't relitigate), **[RECOMMENDED]** (engineering default, may change via ADR in `docs/ADR/`), **[TBD]** (business decision — use labeled, configurable placeholders, never hardcode as final), and **[BLOCKER FOR LIVE]**.

Work proceeds phase by phase (handoff §16); each milestone needs passing tests and run instructions.

## Commands

Node 24 (`.nvmrc`) and pnpm via Corepack (version pinned in `packageManager`). Run from the repo root:

```sh
pnpm install
pnpm dev          # builds shared, then web :3000 + api :4000 (/api/v1) + shared watch
pnpm check        # format:check + lint + typecheck + test — run before declaring a task done
pnpm db:migrate   # prisma migrate dev (new migration from schema changes)
pnpm db:reset     # drop local DB, re-migrate, re-seed (Prisma blocks this for agents without user consent)
pnpm db:seed      # idempotent demo seed (apps/api/prisma/seed/)
pnpm build | lint | typecheck | test | format
pnpm --filter @influency/api test                                # one package
pnpm --filter @influency/api exec vitest run src/app.spec.ts     # one test file
pnpm --filter @influency/api exec vitest run -t "test name"      # one test by name
```

Gotchas:
- The API needs a local PostgreSQL 18 and a root `.env` (copy `.env.example`); it exits at startup listing missing/invalid variables.
- `pnpm test` needs PostgreSQL running and `TEST_DATABASE_URL` (a `*_test` DB) in `.env`: api `test/global-setup.ts` wipes and re-migrates it once per run.
- Prisma client is generated (gitignored) into `apps/api/src/generated/` by the api `postinstall`; an up-to-date `pnpm install` skips it, so run `pnpm --filter @influency/api generate` after schema changes.
- Apps load `@influency/shared` from `dist/` at runtime (its `types` point at `src/`, so typecheck/lint work without a build). After changing shared, rebuild it (`pnpm --filter @influency/shared build`) before running app tests directly; root `test`/`dev` do this for you.
- Everything is ESM (NestJS 12 default): relative imports in `apps/api` and `packages/shared` need `.js` suffixes.
- Web `typecheck` runs `next typegen` first (TS 6 checks side-effect CSS imports against generated `next-env.d.ts`).
- Pin dependency versions exactly (no `^`/`~`), and only versions published at least two weeks ago. ESLint stays on 9 (Next.js lint plugins) and TypeScript below 6.1 (typescript-eslint).
- pnpm 12 fails installs on unapproved dependency install scripts; decide per package in `pnpm-workspace.yaml` `allowBuilds`.

## What Influency is

Web-first multi-creator content monetization platform. Each creator gets `influency.com/{creatorSlug}` (linked from Instagram/TikTok bio). Users log in with **Telegram OIDC**, buy prepaid **Koin** via **Midtrans Snap Sandbox**, and spend Koin on (a) per-post time-limited unlocks or (b) creator-wide subscriptions (manual renewal only). Influency is the central merchant; creator earnings are an internal ledger with simulated/manual payouts.

**Superseded — do not implement:** Telegram Mini App runtime/checkout, Telegram Stars, Lynk.id, per-creator bots, Telegram channels as content storage, forcing visitors into Telegram before viewing a profile.

## Architecture ([RECOMMENDED], handoff §4)

pnpm monorepo, TypeScript strict, Node LTS pinned in `.nvmrc`, modular monolith (no microservices/K8s/Kafka):

- `apps/web` — Next.js App Router + Tailwind + shadcn/ui. SSR public creator pages. No financial logic, no provider secrets.
- `apps/api` — NestJS + Fastify, REST under `/api/v1`, OpenAPI. Feature modules: auth, users, creators, posts, media, wallets, coin-packages, topups, payments, subscriptions, entitlements, financial-ledger, payouts, telegram-bot, notifications, admin. Prisma schema/migrations live here.
- `apps/worker` — BullMQ jobs (reconciliation, notifications, media); may start inside api.
- `packages/shared` (types, Zod schemas, error codes), `packages/config`, `infra/docker-compose.yml` (Postgres + Redis).
- Tests: Vitest + Fastify `inject` / Supertest (integration against real Postgres) + Playwright (e2e). CI: GitHub Actions.

Boundaries: PostgreSQL is authoritative for balances/ledger/entitlements; Redis is delivery only; Midtrans browser redirects never mean "paid"; Telegram is identity + outbound notifications only; R2/Stream hold bytes but the API decides access and mints short-lived URLs.

Reserved top-level route segments (cannot be creator slugs): `login, wallet, studio, admin, auth, api, discover, subscriptions, library, terms, privacy, help, become-creator, account`. Slugs are lowercase-normalized and unique case-insensitively.

## Non-negotiable invariants

Financial and access code is where mistakes are expensive. These come from handoff §§5–12, 19:

- **Money/Koin are integers** (Koin `BIGINT`, IDR integer units, commission as basis points). Never JS floats.
- **Every wallet movement goes through an append-only ledger** inside a DB transaction with row locking (`SELECT ... FOR UPDATE` or serializable + retry). Never `UPDATE balance` directly. Corrections are compensating entries, never edits/deletes.
- **Unlock/subscribe = one transaction:** debit + `content_purchases` + entitlement/subscription + `revenue_ledger` (+ outbox event). Snapshot offer version and commission rate at purchase time; price changes affect future purchases only.
- **Idempotency:** `Idempotency-Key` header on purchase/top-up creation (same key + same payload → same result; different payload → reject) **and** DB unique constraints on financial source keys so duplicates are impossible even without the header.
- **Top-up credit only from a verified Midtrans webhook or status-API reconciliation.** Verify `SHA512(order_id + status_code + gross_amount + ServerKey)`, order, amount, merchant, status/fraud_status. `creditOnce` must survive duplicate, out-of-order (`capture` then `settlement`), and concurrent webhooks. Amount mismatch → quarantine, no credit. Prices come from DB, never from the client.
- **Top-ups are not creator revenue**; revenue is allocated only when Koin is spent. Earnings show as estimated/pending; payouts are a state machine needing an operator transfer reference.
- **Entitlement check is server-side using server time** (handoff §6.4): published AND (free OR owner OR active post entitlement OR active creator subscription). Premium originals never appear in public HTML/JSON; signed media URLs are minted only after the check and never logged.
- **Auth:** Telegram OIDC Authorization Code + PKCE (S256), validate state/nonce, verify ID token via JWKS (issuer `https://oauth.telegram.org`, audience, exp). Identity key is `(provider, provider_sub)`, never username. Server sessions in HttpOnly cookies; provider tokens never reach JS. `returnTo` must be a same-origin relative path. Roles (`USER`/`CREATOR`/`ADMIN`) are internal; CREATOR requires admin-approved profile, ADMIN never self-assignable.
- **Sandbox only.** Never enable `MIDTRANS_IS_PRODUCTION=true`, use live keys, or perform real payouts without explicit user approval. `.env.example` holds placeholders only.
- If provider docs disagree with the handoff, follow current official docs, note the discrepancy, and don't invent endpoints or fields.

## Agile workflow commands

`.claude/commands/` defines `/po` → `/tech-lead` → `/dev` / `/qa` / `/dev-team`, plus `/status`, tracking state in `.agile/` (`backlog-index.json`, `sprint.json`, `completed.json`, `features/`, `plans/`, `qa-reports/`, `guidelines/`). The backlog is currently empty. Engineering rules live in `.agile/guidelines/` (`codebase-map.md` first, then `tech-stack.md`, `backend.md` for NestJS/Prisma, `frontend.md` for Next.js); the bottom-up review order is `.agile/code-reviews/feature-review-checklist.md`. `/qa` treats creator/user isolation and financial-integrity violations as blockers.

Config read by `/dev-team`:

- `MAX_DEV_RETRIES`: 1
