# US-036: Top-Up Success Notification

**Status:** backlog
**Priority:** medium
**Feature:** telegram-notifications

## Description

As a user who topped up, I want a Telegram message when my Koin arrive, so that I know my payment worked without checking the site.

## Acceptance Criteria

- [ ] After Koin are credited, a notification is queued from the same transaction (outbox) and sent only to users who consented
- [ ] The message contains a short summary and a link to the website wallet — no premium media or sensitive data
- [ ] A failed notification never undoes the Koin credit
- [ ] Each top-up produces at most one notification
