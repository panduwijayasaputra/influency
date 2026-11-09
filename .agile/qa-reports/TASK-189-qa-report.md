# QA Report: TASK-189 — Swap the Langganan UI to the real API

**Result:** PASS

- `lib/api/my-subscriptions.ts` now calls `GET /me/subscriptions`, throws on a non-OK status and parses with `mySubscriptionListSchema`; the dummy is gone. `SubscriptionsView` needed no change.
- Tests: `my-subscriptions.test.ts` (4) and the unchanged `subscriptions-view.test.tsx` pass.
- Full gate: `pnpm check` clean (shared 251, api 1059, web 735). One pre-existing flaky web test (`post-media-viewer.test.tsx`, "IntersectionObserver is not defined") failed once in a run and passed on rerun and in the full suite; the file is untouched by this feature.
