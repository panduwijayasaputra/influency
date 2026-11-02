# US-010: Apply to Become a Creator

**Status:** backlog
**Priority:** high
**Feature:** creator-onboarding

## Description

As a logged-in user, I want to apply as a creator with my own page address, so that I can sell my content at influency.com/{my-slug}.

## Acceptance Criteria

- [ ] The application collects display name, desired slug, bio/category and acceptance of the creator agreement and content policy
- [ ] Slugs are normalized to lowercase, allow only permitted characters, and must be unique case-insensitively
- [ ] Reserved names (`login, wallet, studio, admin, auth, api, discover, subscriptions, library, terms, privacy, help`) are rejected with a clear message
- [ ] A submitted application has status `PENDING_REVIEW`; the user cannot submit a second application while one is pending
