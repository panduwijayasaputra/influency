# QA Report: TASK-136 — Recommended-creators contract, interim source and carousel

**Result:** PASS

## Review
- **Contract:** `recommendedCreatorSchema` has public fields only (slug, displayName, avatarUrl, bannerUrl, followerCount). `RECOMMENDED_CREATORS_LIMIT` is 15. US-026 returns the same shape.
- **Swappable source:** `fetchRecommendedCreators(ownSlug)` is the only place suggestions come from. The interim body reads the demo creators' public profiles with follower count 0 and drops the viewer's own creator. It carries a `shortcut:` comment naming US-026.
- **FollowButton:** one component for Ikuti / Diikuti with `aria-pressed`. Local only for now, with a "Segera hadir" toast, so US-024 changes one file. `ProfileActions` now uses it. The creator name is optional, so the profile button keeps the accessible name "Ikuti" while suggestion cards get "Ikuti {name}".
- **Carousel:** pages of 3 full-width cards in a scroll-snap track with `aria-roledescription` carousel/slide labels ("Halaman i dari n") and page dots (only with more than one page). Jelajahi links to `/discover`. Touch uses native scrolling; a mouse drag moves `scrollLeft` by hand. A move of more than 5 px swallows the click that follows, so a drag never opens a profile. Cards link to `/{slug}`; the follow button is a sibling of the link, not nested in it.
- **Access and safety:** only public profile data. No financial logic, nothing stored client-side.

## Tests
- `creators.test.ts`: list schema parses public fields, rejects a missing follower count.
- `recommended-creators.test.ts`: known creators returned, 404s skipped, own slug dropped, 500 throws.
- `follow-button.test.tsx`: toggle plus toast, creator name in the accessible name.
- `creator-untukmu.test.tsx`: nothing without suggestions, 7 creators give 3 slides (3/3/1) and 3 dots, no dots for one page, profile link, Ikuti on a card, drag swallows the click, a tiny move does not.
- `profile-actions.test.tsx` and the creator page tests still pass unchanged.

## Notes
- Not checked in a real browser: touch swipe feel, mouse drag with snap, dot updates while scrolling.
- Dots are driven by `scrollLeft / clientWidth` in `onScroll`; jsdom has no layout, so that path is not unit tested.
