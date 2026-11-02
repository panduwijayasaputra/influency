# US-021: Short-Lived Media Access for Entitled Viewers

**Status:** backlog
**Priority:** high
**Feature:** content-access

## Description

As a subscriber who has access, I want premium images and video to load when I open a post, so that I can enjoy what I paid for.

## Acceptance Criteria

- [ ] `GET /posts/:id/media-access` returns short-lived media URLs/tokens only after the access check passes
- [ ] Users without access receive `FORBIDDEN` and no URL
- [ ] Media URLs expire after a short configured time and the page can request fresh ones
- [ ] Signed media URLs never appear in public page HTML, logs or analytics
