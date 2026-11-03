# US-020: Server-Side Access Check

**Status:** ready_for_uat
**Priority:** high
**Feature:** content-access
**Scope note:** Revised per Monetization Spec v1. Purchase, subscription and archive-grant rules moved to US-050 (monetization phase); this story builds the single check those sources plug into.

## Description

As a creator, I want my premium content to be shown only to people allowed to see it, so that my content keeps its value.

## Acceptance Criteria

- [x] One server-side access check decides every post view: published AND free, or the viewer is the owner; premium posts are otherwise denied until US-050 adds paid access sources
- [x] The owner can always view their own posts, including drafts and archived posts; the public never sees draft, archived (`ARCHIVED`) or removed posts
- [x] A removed post is denied to everyone except admins
- [x] Decisions use server time and never trust client flags such as `isPremium` or `unlocked`
- [x] Unit tests cover free, premium-denied, owner, archived, draft and removed cases

## Tasks

### TASK-062: Pure post access rule + unit tests
**Status:** done

### TASK-063: PostAccessService in EntitlementsModule + integration test
**Status:** done
