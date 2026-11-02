# US-003: API Skeleton: Health, Request ID & Error Format

**Status:** ready_for_uat
**Priority:** high
**Feature:** project-foundation

## Description

As a developer, I want the API to have a health endpoint, request IDs and one consistent error format, so that every module reports errors the same way and problems can be traced across logs.

## Acceptance Criteria

- [ ] `GET /api/v1/health` returns 200 with the status of the database connection; Redis is reported as `disabled` until Phase 5 (Redis deferral, user decision 2026-11-03)
- [ ] Every response carries a request ID, and the same ID appears in the structured JSON logs
- [ ] Domain errors return `{ "error": { "code", "message", "requestId", "details" } }` with error codes defined in `packages/shared`
- [ ] Unexpected errors return a generic 500 response without stack traces or internal details
- [ ] Request validation failures return a 400 using the same error format

## Tasks

### TASK-008: Request ID & Structured JSON Logging
**Status:** done

### TASK-009: Standard Error Format, DomainError & Zod Validation Pipe
**Status:** done

### TASK-010: PrismaService & Health Endpoint
**Status:** done
