# US-070: Notifications Page

**Status:** backlog
**Priority:** low
**Feature:** mobile-first-ui

## Description

As a signed-in user, I want a notifications list behind the bell, so that I see what happened with creators and my comments.

## Acceptance Criteria

- [ ] **Notifikasi** (`/notifications`) is opened from the Home bell. It lists items with avatar, actor name, text and relative time, and new items are highlighted. Tapping an item opens the related creator or post.
- [ ] Notifications about premium posts never include comment text or media from a post the user cannot access.
- [ ] It has loading, empty ("Belum ada notifikasi") and guest (login prompt) states.
- [ ] Data is dummy and labelled "Perlu konfirmasi: event notifikasi" until a notification backend exists. `notifications` is a reserved slug.
