# US-008: Return to Original Page After Login

**Status:** backlog
**Priority:** high
**Feature:** telegram-auth

## Description

As a visitor browsing a creator page, I want to come back to the same page after logging in, so that I can continue buying the content I was looking at.

## Acceptance Criteria

- [ ] Starting login from a creator page or post returns the user to that same page after a successful login
- [ ] Only same-origin relative paths are accepted as the return path; anything else falls back to the home page (no open redirect)
- [ ] When the page is opened inside the Instagram or TikTok in-app browser, an "Open in browser" option is shown in case login cannot complete there
