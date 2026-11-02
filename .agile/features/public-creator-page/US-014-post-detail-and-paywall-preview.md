# US-014: Post Detail & Paywall Preview

**Status:** backlog
**Priority:** high
**Feature:** public-creator-page

## Description

As a visitor, I want to open a single post and see what I need to do to view it, so that I understand the price and access period before buying.

## Acceptance Criteria

- [ ] `/{creatorSlug}/posts/{postId}` shows a free post in full to anyone
- [ ] A premium post shows only its preview, its Koin price and access duration, and the creator subscription option
- [ ] A logged-in user who already has access sees an indication that the post is unlocked
- [ ] Posts that are not published (draft, hidden, removed) are not shown to the public
