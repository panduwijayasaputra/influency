# US-023: "Creator untukmu" Block

**Status:** ready_for_uat
**Priority:** high
**Feature:** home-feed

## Description

As a signed-in user, I want to see creator suggestions inside my feed and follow them on the spot, so that I find more creators I like.

## Acceptance Criteria

- [x] **Placement:**
  - A "Creator untukmu" section appears after the 5th post of the Home feed.
  - If the feed has fewer than 5 posts, it appears after the last post, and also in the empty state.
  - The section is hidden when there are no suggestions.
- [x] **Layout:**
  - Suggestions are grouped in pages of 3 full-width cards (cover, avatar, name, @slug, Ikuti button).
  - Pages snap horizontally on touch swipe and on mouse drag, with page dots under them.
  - The carousel is keyboard reachable and has accessible carousel/slide labels.
  - The header has a "Jelajahi" link to `/discover`.
- [x] Tapping a card (outside Ikuti) opens that creator's profile.
- [x] Ikuti on a card toggles to "Diikuti" (`aria-pressed`). Until US-024 it is local only and shows a "Segera hadir" toast.
- [x] Until US-026 ships, suggestions come from one swappable dummy source (at most 15 creators). It never includes the viewer's own creator profile.

## Tasks

### TASK-136: Recommended-creators contract, interim source and carousel
**Status:** done

### TASK-137: Place the block in the Home feed
**Status:** done
