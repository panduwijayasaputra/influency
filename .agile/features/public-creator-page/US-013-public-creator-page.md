# US-013: Public Creator Page

**Status:** backlog
**Priority:** high
**Feature:** public-creator-page

## Description

As a visitor from an Instagram bio link, I want to open a creator page directly in my browser, so that I can see who they are and what content they offer without logging in.

## Acceptance Criteria

- [ ] `/{creatorSlug}` shows avatar, banner, bio, category, the free posts, previews of premium posts and the creator subscription price
- [ ] The page works without login and without any redirect to Telegram
- [ ] Unknown, unapproved or suspended creator slugs show a not-found page
- [ ] The page HTML and public API responses contain no premium original media URLs or media tokens
- [ ] The layout is usable at mobile width (about 375px) and loads in Instagram/TikTok in-app browsers
