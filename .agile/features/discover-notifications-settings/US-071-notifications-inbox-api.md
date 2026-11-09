# US-071: Notifications Inbox API

**Status:** ready_for_uat
**Priority:** high
**Feature:** discover-notifications-settings

## Description

As a logged-in user, I want my notifications stored and served by the API, so that the Notifikasi page and the bell show real activity.

## Acceptance Criteria

- [ ] A `notifications` table stores recipient, event type, optional actor, target (type + id), a dedupe key UNIQUE per recipient, `readAt` and `createdAt`. Rows are written only by the API's event producers (US-072), never by clients.
- [ ] `GET /me/notifications?cursor=` returns my notifications newest first with cursor pagination. Text is built server-side from the type, the actor's current display name and the target. A notification whose target was deleted, or that I can no longer view, renders as a neutral fallback and never exposes premium content.
- [ ] `GET /me/notifications/unread-count` returns my unread count; `POST /me/notifications/read` (CSRF-protected) marks mine read up to a given notification. Other users' notifications can never be read or marked (404 / no effect).
- [ ] Notifications older than a configurable retention (example: 90 days) are left out of the list.
- [ ] US-067 and the bell use these endpoints instead of dummy data. Integration tests cover pagination, unread count, mark-read, isolation and the deleted-target fallback.

## Tasks

### TASK-227: Notification tables + migration
**Status:** done

### TASK-228: Inbox endpoints + web wiring
**Status:** done
