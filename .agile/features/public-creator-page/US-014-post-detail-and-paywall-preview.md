# US-014: Post Detail & Paywall Preview

**Status:** backlog
**Priority:** high
**Feature:** public-creator-page
**Depends on:** US-015/US-019 (posts), US-018 (post offers), US-020 (access check), US-026 (creator plans), US-025/US-027 (unlocks + subscriptions for the "unlocked" indicator). Plan after US-027.

## Description

As a visitor, I want to open a single post and see what I need to do to view it, so that I understand the price and access period before buying.

## Acceptance Criteria

- [ ] `/{creatorSlug}/posts/{postId}` shows a free post in full to anyone
- [ ] A premium post shows only its preview, its Koin price and access duration, and the creator subscription option
- [ ] A logged-in user who already has access sees an indication that the post is unlocked
- [ ] Posts that are not published (draft, hidden, removed) are not shown to the public
