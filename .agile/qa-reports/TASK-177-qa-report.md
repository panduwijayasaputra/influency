# QA Report: TASK-177 — `SubscriptionsView` and the `/subscriptions` page

**Result:** PASS

- Criteria checked: one full-width card per subscription with the badge, "Perpanjangan terjadwal" only when flagged, cards open the creator profile (where renewal and cancel live), copy says subscriptions are separate from following and renewal is manual, open items shown as "Perlu konfirmasi" (never as policy), empty state, skeleton, retryable error, logged-out redirect with `returnTo=/subscriptions`, stub removed.
- Known and accepted: a subscription that expires while the page is open still shows "Aktif" until reload; the profile (server decides) shows the real state.
- Tests: `subscriptions-view.test.tsx` (5), `subscriptions/page.test.tsx` (2) pass. Full web suite, `typecheck`, `lint`, `prettier --check` clean.
