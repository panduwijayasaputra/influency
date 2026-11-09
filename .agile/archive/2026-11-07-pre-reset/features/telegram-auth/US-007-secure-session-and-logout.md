# US-007: Secure Session & Logout

**Status:** ready_for_uat
**Priority:** high
**Feature:** telegram-auth

## Description

As a logged-in user, I want my session to stay secure and to be able to log out, so that nobody else can use my account from my browser.

## Acceptance Criteria

- [x] After login the browser receives an HttpOnly session cookie (Secure on HTTPS) and no tokens are readable from JavaScript
- [x] Sessions expire after a configured lifetime and expired sessions are rejected
- [x] Logging out revokes the session on the server, so the old cookie no longer works
- [x] State-changing requests are protected against CSRF

## Tasks

### TASK-019: Configurable session lifetime, SessionGuard and CSRF guard
**Status:** done

### TASK-020: POST /auth/logout (server-side revocation)
**Status:** done

### TASK-021: Web LogoutButton component (not mounted yet)
**Status:** done
