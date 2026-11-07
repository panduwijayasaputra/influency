# US-050: Access via Purchases, Subscriptions & Archive Grants

**Status:** backlog
**Priority:** high
**Feature:** content-access
**Depends on:** US-020, US-025, US-027, US-028, US-047. Split from US-020 (Monetization Spec v1 §4, §4.1, §5) — plan with the monetization phase.

## Description

As a buyer or subscriber, I want my access to follow what I paid for, including when a creator archives a post, so that I never lose content I'm entitled to.

## Acceptance Criteria

- [ ] An individual purchase grants access that never expires; it survives subscription expiry and archiving
- [ ] An active subscription period grants access to all of that creator's published premium posts, including ones published later, and never to another creator's posts
- [ ] Archive grant: a subscriber whose period was active at the archive moment (`startsAt <= archivedAt < endsAt`) keeps access until that period's `endsAt`; scheduled renewals and later periods do not inherit it; users who subscribe after archiving don't see the post
- [ ] Restoring a post resumes normal subscription access; archiving again creates a fresh episode that is evaluated on its own
- [ ] A removed (takedown) post grants no access to anyone except admins, even with a prior purchase
- [ ] Tests cover each case above, using server time
