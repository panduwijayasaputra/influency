# US-022: Home Feed UI

**Status:** ready_for_uat
**Priority:** high
**Feature:** home-feed

## Description

As a signed-in user, I want Beranda to show a scrolling feed of posts from creators, so that I have something to watch and read as soon as I open the app.

## Acceptance Criteria

- [x] `/` replaces the ComingSoon placeholder with a single feed (no tabs) of the existing PostCard, under the existing Home top bar (hide on scroll down, show on scroll up). Guests are still redirected to login.
- [x] Until US-025 ships, the feed reads dummy posts from one swappable data source that has the same shape as the planned feed API. The dummy posts include free, locked premium and video posts.
- [x] **Infinite scroll:**
  - Reaching the end loads the next page with a loading indicator.
  - A failed page load shows an inline Indonesian error with a "Coba lagi" retry and keeps the posts already loaded.
  - The end of the feed shows a short end note.
- [x] **States:** a skeleton while the first page loads, and an Indonesian empty state with a Jelajahi link when there are no posts.
- [x] **Behaviour matches the creator profile:**
  - Only the first visible video autoplays, muted (UX spec §8.2).
  - Opening comments, the full-screen viewer or a purchase sheet keeps the feed mounted and keeps the scroll position (CMT-01).
  - Tapping the creator's name or avatar opens their profile.

## Tasks

### TASK-134: Shared feed contract and interim data source
**Status:** done

### TASK-135: HomeFeed component and Home page
**Status:** done
