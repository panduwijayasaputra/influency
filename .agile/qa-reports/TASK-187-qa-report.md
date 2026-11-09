# QA Report: TASK-187 — Swap the Diikuti UI to the real API

**Result:** PASS

- `lib/api/following.ts` now calls `GET /me/following` (default sort left out of the query string), throws on a non-OK status and parses with `followingPageSchema`; the recommended-creators dummy is gone. `FollowingView` already used `usePagedList` and needed no change; cards still have no unfollow action.
- Tests: `following.test.ts` (4) and the unchanged `following-view.test.tsx` pass.
