# US-020: Server-Side Access Check

**Status:** backlog
**Priority:** high
**Feature:** content-access

## Description

As a creator, I want my premium content to be shown only to people who paid for it, so that my content keeps its value.

## Acceptance Criteria

- [ ] A post is viewable only if it is published AND it is free, or the viewer is the owner, or has an active post unlock, or has an active subscription to that creator
- [ ] Access is evaluated with server time; expired unlocks and subscriptions no longer grant access
- [ ] A subscription to one creator never grants access to another creator's posts
- [ ] A user with both a post unlock and a subscription keeps access while either one is still valid
- [ ] Unit tests cover free, unlocked, subscribed, expired, owner and removed-post cases
