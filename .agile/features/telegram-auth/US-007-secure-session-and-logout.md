# US-007: Secure Session & Logout

**Status:** backlog
**Priority:** high
**Feature:** telegram-auth

## Description

As a logged-in user, I want my session to stay secure and to be able to log out, so that nobody else can use my account from my browser.

## Acceptance Criteria

- [ ] After login the browser receives an HttpOnly session cookie (Secure on HTTPS) and no tokens are readable from JavaScript
- [ ] Sessions expire after a configured lifetime and expired sessions are rejected
- [ ] Logging out revokes the session on the server, so the old cookie no longer works
- [ ] State-changing requests are protected against CSRF
