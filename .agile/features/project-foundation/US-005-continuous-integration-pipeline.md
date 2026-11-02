# US-005: Continuous Integration Pipeline

**Status:** backlog
**Priority:** medium
**Feature:** project-foundation

## Description

As a developer, I want every push and pull request to run lint, typecheck and tests automatically, so that broken code is caught before it is merged.

## Acceptance Criteria

- [ ] A GitHub Actions workflow runs lint, typecheck and tests on each push and pull request
- [ ] Integration tests in CI run against a real PostgreSQL service
- [ ] The workflow fails when any check fails
- [ ] CI uses no real secrets; tests rely on placeholder or fake provider configuration
