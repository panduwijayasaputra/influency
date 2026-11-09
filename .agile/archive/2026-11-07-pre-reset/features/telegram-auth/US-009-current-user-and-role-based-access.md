# US-009: Current User & Role-Based Access

**Status:** ready_for_uat
**Priority:** high
**Feature:** telegram-auth

## Description

As a logged-in user, I want the app to know who I am and what I am allowed to do, so that I only see the areas meant for me.

## Acceptance Criteria

- [x] `GET /auth/me` returns the current user, display name and roles; it returns `AUTH_REQUIRED` when not logged in
- [x] Every account has the `USER` role; `CREATOR` is granted only through an approved creator profile and `ADMIN` only through the database/seed
- [x] Studio pages and endpoints are blocked for users without an approved creator profile (`CREATOR_NOT_APPROVED`)
- [x] Admin pages and endpoints return `FORBIDDEN` for non-admins
- [x] Roles are read from the database on each request, never from Telegram token claims

## Tasks

### TASK-025: Schema: `user_roles` + minimal `creator_profiles`, shared `/auth/me` contract, seed
**Status:** done

### TASK-026: API: `AdminGuard`, `ApprovedCreatorGuard`, `GET /auth/me`
**Status:** done

### TASK-027: Web: `getCurrentUser`, `/studio` + `/admin` gates, site header
**Status:** done
