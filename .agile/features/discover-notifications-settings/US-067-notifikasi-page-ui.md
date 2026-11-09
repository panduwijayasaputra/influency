# US-067: Notifikasi Page UI

**Status:** ready_for_uat
**Priority:** high
**Feature:** discover-notifications-settings

## Description

As a logged-in user, I want a Notifikasi page and an unread dot on the bell, so that I see new activity from creators I follow and on my account.

## Acceptance Criteria

- [ ] `/notifications` (logged-in only; guests go to Login with `returnTo`) replaces `ComingSoon` with a list: actor avatar, actor name in bold + text, relative time ("2j", "Kemarin", "2 Nov"); unread rows use the tinted background from artboard state `notifications`.
- [ ] Tapping a row opens its target (post, comment thread, creator profile, Dompet or Penghasilan). Rows never show premium media or the text of locked premium comments.
- [ ] The Beranda top-bar bell shows an unread dot with an accessible label ("Notifikasi, ada aktivitas baru") when there are unread notifications; opening the page marks them read.
- [ ] A "Perlu konfirmasi" label states the event list is not final. Empty state: "Belum ada notifikasi." Loading, load-more pagination and error-with-retry states exist.
- [ ] Data comes from one swappable source (dummy until US-071). Component tests cover rows, unread styling, bell dot, empty state and the guest redirect.

## Tasks

### TASK-221: Notifications contract + dummy source
**Status:** done

### TASK-222: Notifikasi page + bell dot
**Status:** done
