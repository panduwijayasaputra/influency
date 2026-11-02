# Feature Review Checklist — Influency

**Purpose:** Ordered list of areas to review, bottom-up — from infrastructure foundations, through identity and money, up to the UI. Lower layers are dependencies of higher ones, so review them first. Items map to the handoff phases (§16); fill in file paths and story IDs as code is built.

Legend: `[ ]` not reviewed · `API` NestJS · `WEB` Next.js · `US-xxx` related story.

---

## Layer 0 — Foundation (Phase 1)

- [ ] **Monorepo & tooling** — pnpm workspace, `.nvmrc`, strict tsconfig, lint/format, CI (lint + typecheck + test)
- [ ] **Local infra** — `infra/docker-compose.yml` (Postgres, Redis), `.env.example` with placeholders only, `.env` gitignored
- [ ] **API skeleton** — Fastify adapter, `/api/v1/health`, request ID, structured logging without secrets, global `DomainError` filter + shared error shape
- [ ] **Prisma** — schema conventions (UUID, UTC, snake_case maps, integer money), migrations committed, seed data per handoff §15.5
- [ ] **Shared package** — Zod schemas, error codes, reserved slug list

## Layer 1 — Identity & Access (Phase 2)

- [ ] **Telegram OIDC** — PKCE S256, state/nonce, server-side code exchange, JWKS verification (issuer, audience, exp), `(provider, provider_sub)` identity, no tokens to JS
- [ ] **Sessions** — hashed token storage, HttpOnly/Secure/SameSite cookie, logout revocation, CSRF protection on mutations
- [ ] **returnTo** — same-origin relative paths only
- [ ] **Roles & guards** — USER/CREATOR/ADMIN from DB, approved-creator guard, admin never self-assigned
- [ ] **Creator onboarding & slugs** — application → admin approve/reject with reviewer + timestamp; reserved/case-insensitive unique slugs

## Layer 2 — Content & Entitlement (Phase 3)

- [ ] **Posts & offers** — status machine, FREE/PREMIUM, offer versioning, creator ownership on every studio query
- [ ] **Media storage** — private R2 bucket, scoped presigned uploads, mime/size validation, Stream adapter/stub
- [ ] **Entitlement engine** — handoff §6.4 predicate with server time; short-lived media tokens minted only after the check
- [ ] **Public page leakage** — no premium originals/signed URLs in SSR HTML, JSON, metadata or logs

## Layer 3 — Koin Wallet & Purchases (Phase 4) — financial blocker rules

- [ ] **Wallet ledger** — append-only, integer amounts, cached balance updated only alongside a ledger row, unique source keys
- [ ] **Coin lots** — FIFO allocation, cash basis tracking, promo vs paid Koin distinguished
- [ ] **Idempotency** — header contract + DB uniqueness
- [ ] **Post unlock** — one transaction (lock wallet, debit, purchase, entitlement, revenue, outbox), snapshot of offer + commission, insufficient-balance path
- [ ] **Creator subscription** — creator-scoped, manual renewal extending from `max(now, current_end)`, no self-subscribe charge
- [ ] **Revenue ledger** — basis-point commission snapshot, no revenue on top-up
- [ ] **Concurrency tests** — handoff §15.3 scenarios pass

## Layer 4 — Midtrans Sandbox (Phase 5)

- [ ] **Provider interface** — `PaymentGatewayProvider`, fake provider blocked in production, Server Key backend-only
- [ ] **Top-up orders** — DB-sourced package price, immutable snapshot, order number = Midtrans `order_id`
- [ ] **Webhook** — durable event storage first, signature/order/amount/merchant verification, status mapping, `creditOnce`, quarantine on mismatch
- [ ] **Reconciliation** — status API job + admin endpoint; browser callbacks never credit
- [ ] **Payment test matrix** — handoff §15.2 scenarios pass
- [ ] **Sandbox lock** — `MIDTRANS_IS_PRODUCTION=false`, no live keys anywhere

## Layer 5 — Earnings, Admin, Payouts (Phase 6)

- [ ] **Creator earnings** — estimated/pending/available/paid/on_hold shown separately, creator sees only own entries
- [ ] **Payout state machine** — handoff §9.4, operator transfer reference required for PAID, simulated/manual only
- [ ] **Refunds & adjustments** — compensating entries, account hold when spent Koin is refunded, earnings reversal/hold
- [ ] **Admin console** — role-checked, audit-logged finance and moderation actions

## Layer 6 — Notifications & Web UX

- [ ] **Outbox → BullMQ → bot** — idempotent jobs, 403 disables delivery, consent stored, summary + link only
- [ ] **Web journeys** — mobile-first creator page, paywall info, idempotent purchase buttons, Snap checkout + status polling, in-app-browser login fallback
- [ ] **E2E** — handoff §15.4 Playwright journey passes

---

## Notes

- Suggested review unit per feature: **Prisma model + migration → service (transaction boundary) → controller (guards/ownership) → shared schema → web client → UI**, confirming ownership checks and financial invariants hold at each layer.
