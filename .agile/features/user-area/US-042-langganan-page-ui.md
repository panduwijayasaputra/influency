# US-042: Langganan Page UI

**Status:** ready_for_uat
**Priority:** medium
**Feature:** user-area

## Description

As a subscriber, I want to see which creators I subscribe to and how long each lasts, so that I know when to renew.

## Acceptance Criteria

- [x] `/subscriptions` shows **Langganan** and one full-width card per active subscription: cover, avatar, name, @username, bio, and a badge "Aktif · N hari lagi" (or "berakhir hari ini" on the last day).
- [x] A subscription with a prepaid next period shows "Perpanjangan terjadwal" on the card. Tapping a card opens the creator profile, where renewal and cancel are handled.
- [x] Copy says subscriptions are separate from following and that renewal is manual. Anything the design marks open (card details, renewal controls) shows as "Perlu konfirmasi", not as policy.
- [x] Empty state: "Belum ada langganan aktif" with the separate-from-following hint. Loading, retryable error and guest redirect (`returnTo=/subscriptions`) exist.
- [x] Data comes from one swappable source (dummy data now). Component tests cover the badge wording, scheduled renewal, empty, error and guest. The stub is removed.

## Tasks

### TASK-176: Subscriptions schema and dummy `fetchMySubscriptions`
**Status:** done

### TASK-177: `SubscriptionsView` and the `/subscriptions` page
**Status:** done
