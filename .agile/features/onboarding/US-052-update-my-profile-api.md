# US-052: Update My Profile API

**Status:** ready_for_uat
**Priority:** medium
**Feature:** onboarding

## Description

As a signed-in user, I want to save my display name and bio, so that the name I choose in onboarding is the one others see.

## Acceptance Criteria

- [x] `PATCH /me/profile` (session + CSRF) accepts `displayName` (trimmed, 1–60) and `bio` (trimmed, ≤ 500, empty clears it). Invalid input → 400 `VALIDATION_FAILED` with field messages. Unknown fields are rejected.
- [x] It only updates the caller's own user row. Roles, username, creator profile fields and anything else cannot be changed through it. Guests get 401.
- [x] The response returns the same shape as `GET /auth/me`, and the new name shows in comments and Profil Saya afterwards. An approved creator's public creator display name is not changed by this endpoint.
- [x] The US-049 Profil step saves through this endpoint instead of dummy data.
- [x] Integration tests cover valid updates, bio clearing, validation limits, ignored or rejected privileged fields, and isolation between users.

## Tasks

### TASK-196: `PATCH /me/profile` and wire the Profil step
**Status:** done
