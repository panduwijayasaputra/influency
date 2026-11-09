# US-005: Continuous Integration Pipeline

**Status:** ready_for_uat
**Priority:** medium
**Feature:** project-foundation

## Description

As a developer, I want every push and pull request to run lint, typecheck and tests automatically, so that broken code is caught before it is merged.

## Acceptance Criteria

- [x] A GitHub Actions workflow runs lint, typecheck and tests on each push and pull request
- [x] Integration tests in CI run against a real PostgreSQL service
- [x] The workflow fails when any check fails
- [x] CI uses no real secrets; tests rely on placeholder or fake provider configuration

## Tasks

### TASK-014: GitHub Actions CI workflow with PostgreSQL service
**Status:** done
