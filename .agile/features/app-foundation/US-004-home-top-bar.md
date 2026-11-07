# US-004: Home Top Bar

**Status:** backlog
**Priority:** high
**Feature:** app-foundation

## Description

As a signed-in user on Home, I want a top bar with search, notifications and my account menu that gets out of the way while I scroll, so that I see more content without losing quick access.

## Acceptance Criteria

- [ ] The top bar appears **on Home only**. It shows, from left to right:
  - the Influency logo (tap scrolls to top / goes to Home)
  - **Cari** (→ `/discover`)
  - a **Notifikasi** bell (→ `/notifications`; shows a placeholder until the notifications feature exists)
  - a **burger** that opens the account drawer (US-005)
- [ ] The top bar hides while scrolling **down** and shows again when scrolling **up** or when back at the top. Under `prefers-reduced-motion` it shows and hides without animation.
- [ ] Each icon button has an Indonesian `aria-label` and a 44 px tap target. The bell can show an unread dot (dummy until the notifications feature exists).
- [ ] `notifications` is added to the reserved slugs.
