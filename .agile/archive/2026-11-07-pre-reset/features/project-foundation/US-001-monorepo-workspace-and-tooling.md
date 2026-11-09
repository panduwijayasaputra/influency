# US-001: Monorepo Workspace & Tooling

**Status:** ready_for_uat
**Priority:** high
**Feature:** project-foundation

## Description

As a developer on the Influency team, I want one pnpm TypeScript monorepo with web, api and shared packages, so that every app builds, lints and typechecks the same way.

## Acceptance Criteria

- [x] A fresh clone runs `pnpm install` successfully with the Node version pinned in `.nvmrc`
- [x] The workspace contains `apps/web` (Next.js), `apps/api` (NestJS + Fastify) and `packages/shared`, and the web and api apps both start locally
- [x] Root scripts exist for `lint`, `typecheck`, `test` and `format`, and pass on the initial codebase
- [x] TypeScript runs in `strict` mode in every package
- [x] The README explains how to install, run and test the project locally

## Tasks

### TASK-001: Root Workspace & Shared Config Package
**Status:** done

### TASK-002: Shared Package (`@influency/shared`)
**Status:** done

### TASK-003: API App Scaffold (`@influency/api`)
**Status:** done

### TASK-004: Web App Scaffold (`@influency/web`)
**Status:** done

### TASK-005: Root Scripts, README & Full Verification
**Status:** done
