# US-014: Post Detail & Paywall Preview

**Status:** ready_for_uat
**Priority:** high
**Feature:** public-creator-page
**Depends on:** US-015/US-019 (posts), US-046 (permanent offers), US-048 (blurred preview), US-020/US-021 (access + media), US-026 (creator plans), US-025/US-027 (unlocks + subscriptions for the "unlocked" indicator). Free/owner parts can ship before monetization; paywall options after US-027.

## Description

As a visitor, I want to open a single post and see what I need to do to view it, so that I understand the price before buying.

## Acceptance Criteria

- [ ] `/{creatorSlug}/posts/{postId}` shows a free post in full to anyone
- [ ] A premium post shows only its blurred preview (US-048), its Koin price with "akses permanen", and the creator subscription option once plans exist
- [ ] A logged-in user who already has access sees the full post and an indication that it is unlocked
- [ ] Draft, archived and removed posts return not-found to the public; archived posts stay reachable for entitled users through their library (US-029)

## Tasks

### TASK-075: Public post detail endpoint
**Status:** done

### TASK-076: Public post detail page & feed links
**Status:** done
