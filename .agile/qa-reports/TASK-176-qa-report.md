# QA Report: TASK-176 — Subscriptions schema and dummy `fetchMySubscriptions`

**Result:** PASS

- `mySubscriptionSchema` (`creator`, `endsAt`, `daysLeft >= 1`, `hasScheduledRenewal`) and `mySubscriptionListSchema` match the plan. The dummy is marked `DUMMY: US-047` and keeps the final signature.
- `daysLeftLabel` added to `lib/format.ts`: `daysLeft <= 1` reads "Aktif · berakhir hari ini", otherwise "Aktif · N hari lagi".
- Tests: `my-subscriptions.test.ts` (3), `format.test.ts` (new case) pass. `typecheck`, `lint`, `prettier --check` clean.
