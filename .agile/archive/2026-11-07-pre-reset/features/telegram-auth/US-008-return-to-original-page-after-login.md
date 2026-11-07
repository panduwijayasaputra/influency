# US-008: Return to Original Page After Login

**Status:** ready_for_uat
**Priority:** high
**Feature:** telegram-auth

## Description

As a visitor browsing a creator page, I want to come back to the same page after logging in, so that I can continue buying the content I was looking at.

## Acceptance Criteria

- [x] Starting login from a creator page or post returns the user to that same page after a successful login
- [x] Only same-origin relative paths are accepted as the return path; anything else falls back to the home page (no open redirect)
- [x] When the page is opened inside the Instagram or TikTok in-app browser, an "Open in browser" option is shown in case login cannot complete there

## Tasks

### TASK-022: Shared `safeReturnTo` sanitizer
**Status:** done

### TASK-023: API: store returnTo on the login attempt and redirect to it
**Status:** done

### TASK-024: Web: forward returnTo on /login, `loginHref` helper, in-app browser notice
**Status:** done
