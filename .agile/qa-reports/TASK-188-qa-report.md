# QA Report: TASK-188 — `GET /me/subscriptions`

**Result:** PASS

- `GET /api/v1/me/subscriptions`: `SessionGuard`, `no-store`; read-only, user id from the session only; time from `dbNow` (database clock). Active = not cancelled and `startsAt <= now < endsAt`; a later non-cancelled period is the prepaid renewal and a cancelled one clears the flag; a creator with only a scheduled period is never listed. Non-public creators are left out.
- `daysLeft` = whole days rounded up, at least 1; list ordered by soonest `endsAt`, then slug; bounded at 200 periods (documented shortcut).
- Response is exactly `{ creator{slug,displayName,avatarUrl,bannerUrl,bio}, endsAt, daysLeft, hasScheduledRenewal }`: no price, counts or other users' data (asserted).
- Tests: `my-subscriptions.integration.spec.ts` (13) covers 401, empty, days-left rounding (2 h, 24 h + 1 min, 30 d), ended and cancelled periods, scheduled-only, renewal flag and its cancellation, several creators and their order, isolation between users, non-public creator, exact keys.
