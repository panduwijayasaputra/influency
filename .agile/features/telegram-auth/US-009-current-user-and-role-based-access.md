# US-009: Current User & Role-Based Access

**Status:** backlog
**Priority:** high
**Feature:** telegram-auth

## Description

As a logged-in user, I want the app to know who I am and what I am allowed to do, so that I only see the areas meant for me.

## Acceptance Criteria

- [ ] `GET /auth/me` returns the current user, display name and roles; it returns `AUTH_REQUIRED` when not logged in
- [ ] Every account has the `USER` role; `CREATOR` is granted only through an approved creator profile and `ADMIN` only through the database/seed
- [ ] Studio pages and endpoints are blocked for users without an approved creator profile (`CREATOR_NOT_APPROVED`)
- [ ] Admin pages and endpoints return `FORBIDDEN` for non-admins
- [ ] Roles are read from the database on each request, never from Telegram token claims
