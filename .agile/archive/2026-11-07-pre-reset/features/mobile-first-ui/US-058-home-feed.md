# US-058: Home Feed with Recommended Creators

**Status:** backlog
**Priority:** high
**Feature:** mobile-first-ui

## Description

As a signed-in user, I want one feed of posts on Home with creator suggestions mixed in, so that I can keep up with creators and find new ones.

## Acceptance Criteria

- [ ] Home (`/`) is for signed-in users only. A guest is redirected to the Login landing (US-069). Creator profiles stay public.
- [ ] Home shows **one** vertical feed of PostCards, with no For You / Following tabs. It has loading skeletons and an empty state that links to Jelajahi.
- [ ] After the 5th post, a **"Creator untukmu"** block shows recommended creators as full-width cards (cover, avatar, name, @username, short bio, Ikuti), three per page, swipeable or draggable between pages. A creator card links to that creator's profile.
- [ ] The feed and recommendations are dummy until a feed/follow backend exists and are marked as demo. Posts in them still respect locked-premium rendering (safe preview only).
- [ ] Opening a sheet or the viewer and closing it again keeps the feed scroll position. Returning to Home from another tab restores it within the session.
