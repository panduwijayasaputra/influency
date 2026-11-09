# US-014: Comments Bottom Sheet

**Status:** ready_for_uat
**Priority:** high
**Feature:** comments

## Description

As a viewer, I want comments to open in a bottom sheet over the feed, so that I can read and write comments without losing my place.

## Acceptance Criteria

- [ ] Tapping **Komentar** on a PostCard or in the full-screen viewer opens the Comments Bottom Sheet (the existing BottomSheet) without navigating.
  - The page behind stays mounted, and closing the sheet returns to the same scroll position (CMT-01).
  - Video playing behind is paused while the sheet is open.
  - In the viewer the sheet opens at about 40% height; elsewhere at 75–90%.
- [ ] The sheet shows a drag handle, a header with the comment count, the list in server order with no sort toggle, and a sticky composer.
  - The composer stays reachable when the mobile keyboard opens, and the feed behind does not scroll (CMT-15).
  - The existing comment rules carry over: plain text, the 500-character counter, send and rate-limit errors shown inline under the composer, and the draft kept when sending fails.
- [ ] **Guests:**
  - On a free post, a guest can read the comments.
  - The composer shows "Masuk untuk berkomentar", linking to `/login` with `returnTo` back to the post.
- [ ] **Locked premium post** (no access): the sheet shows a locked state with no comment text, names or avatars, plus the Buka / Langganan CTA (the existing demo purchase sheet) (CMT-03).
  - The comments request is never made for a locked post.
- [ ] The post detail page (US-012) keeps its inline Komentar section and uses the same list and composer component.
  - Opening comments from a PostCard now opens the sheet instead of navigating to the detail page.

## Tasks

### TASK-108: Shared CommentsSheet with locked state
**Status:** done

### TASK-109: PostCard opens the comments sheet
**Status:** done
