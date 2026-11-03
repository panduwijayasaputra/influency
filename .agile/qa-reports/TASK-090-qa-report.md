# QA Report: TASK-090 — Admin suspend / unsuspend a user or creator

**Story:** US-042
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `AdminUsersController` (`admin/users`, `AdminGuard`) uses `ModerationService.setUserStatus`; uuid param pipe, strict body

### Security
- [x] Admins can't suspend themselves or another admin (`CANNOT_SUSPEND_ADMIN`)
- [x] Suspension works through the existing checks: `SessionGuard` (ACTIVE users only) and `PUBLIC_CREATOR` (page, feed, posts, images)

### Financial Integrity
- [x] Only `users.status` changes plus one append-only `SUSPEND_USER`/`UNSUSPEND_USER` row, in one transaction. Posts, offers and (future) wallet/ledger rows are untouched
- [x] Conditional `updateMany` from the expected status: concurrent suspends → one 200, one 409, one action row (tested)

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 3 | Admins can suspend a creator or user | PASS | User: session → 401 until unsuspended. Creator: public page/post 404, studio 401, post status unchanged; unsuspend restores |
| 4 | Never changes financial history | PASS | No finance tables touched |

## Tests Run

- [x] Shared spec `admin-moderation.integration.spec.ts` (suspend block): 4 tests passed
- [x] Typecheck + lint: clean
- [x] Edge cases: suspend twice / unsuspend active → `USER_STATUS_CONFLICT`; admin/self → 409 with no action row; unknown → 404; malformed id → 400

## Notes

- Tests live in `admin-moderation.integration.spec.ts`, not a separate `admin-users` spec as the plan listed: same setup, so they share it.
- Sessions aren't revoked on suspend. They're refused while suspended and work again after unsuspend (until their normal expiry). That was the planned behavior.
