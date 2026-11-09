# QA Report: TASK-113 — canEdit and canPin flags (shared schema + API)

**Result:** PASS

## Review
- **Server-side only:** `toComment(row, viewerId, ownerUserId)` computes `canDelete` (author or post owner, unchanged), `canEdit` (author only) and `canPin` (post owner). Anonymous viewers get all three false. No user ids are exposed, and the response stays `no-store`.
- **Moderation never grants edit:** the post owner gets `canEdit: false` on fans' comments (integration test).
- **Create:** uses the `ownerUserId` already returned by `gate`, so no extra query.
- Both flags are required in the shared schema (a missing flag is rejected). All typed fixtures were updated.

## Tests
- Shared: missing `canEdit` / `canPin` rejected.
- API integration: author, post owner, anonymous and create cases.
- `pnpm check` passes: shared 218, web 516, api 644.

## Notes
- `canPin` is true for every comment of the post owner until US-017 adds replies; US-017 must send `false` on replies (marked with a `shortcut:` comment).
- Admins are not in `canDelete` yet (the delete API rejects them). US-021 adds that.
