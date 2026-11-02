# Development Guidelines

This directory contains the technical guidelines and standards that all AI agents MUST follow when working on Influency.

Product context and decisions live in `.agile/.docs/INFLUENCY_MVP_CLAUDE_HANDOFF_v1.md`. The guidelines here turn that handoff into concrete engineering rules. If the two disagree, the handoff's **[LOCKED]** decisions win; raise the conflict with the user.

## Files

### codebase-map.md
What currently exists: apps, modules, Prisma models, endpoints, routes. **Read this first** before planning or coding. Updated by `/dev-team` when a story completes.

### tech-stack.md
Quick overview of the whole stack (web + api + worker + infra + testing).

### backend.md
NestJS + Prisma rules for `apps/api` and `apps/worker`.

**Covers**: module structure, validation, errors, auth/authorization, financial-transaction rules, payments/webhooks, media access, jobs/outbox, testing.

**When to reference**: any API, database, payment, or worker task.

### frontend.md
Next.js App Router rules for `apps/web`.

**Covers**: routing and reserved slugs, server vs client components, data fetching, auth/session handling, paywall/purchase UX, Midtrans Snap, styling, testing.

**When to reference**: any web/UI task.

## How Agents Use These Guidelines

- **Product Owner (`/po`)**: reads the handoff + tech-stack to keep stories inside MVP scope and locked decisions.
- **Tech Lead (`/tech-lead`)**: MUST read codebase-map + relevant guidelines before planning; plans name files, modules, transaction boundaries and tests.
- **Developer (`/dev`)**: MUST follow guidelines exactly.
- **QA (`/qa`)**: verifies code against guidelines; isolation and financial-integrity violations are blockers.

## Quick Reference

### Backend tasks
```
Read: .agile/guidelines/backend.md
Framework: NestJS (Fastify adapter), modular monolith
Database: PostgreSQL via Prisma (migrations committed)
Money: integers only, ledger-only balance changes, one transaction per purchase
```

### Frontend tasks
```
Read: .agile/guidelines/frontend.md
Framework: Next.js App Router, server components by default
Styling: Tailwind + shadcn/ui, mobile-first
Rule: no secrets, prices or entitlement decisions in the browser
```

### Full-stack features
```
Read backend.md AND frontend.md
Shared request/response schemas + error codes live in packages/shared
```

## Updating Guidelines

1. Update the relevant .md file
2. Keep examples short and consistent with real code once it exists
3. Record architectural changes as an ADR in `docs/ADR/`
4. Update this README if adding new guideline files
