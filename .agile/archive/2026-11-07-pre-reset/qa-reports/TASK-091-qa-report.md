# QA Report: TASK-091 — Web "Laporkan" on the post detail page

**Story:** US-042
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Client component `ReportPostButton` only for the interactive form; page stays a server component
- [x] Same-origin `/api/v1` call; API error message shown from the shared error shape
- [x] Labels in `lib/report-reasons.ts` (reused by the admin queue)

### Security
- [x] Who may report is decided on the server: the plan's optional `viewer.isOwner` became `viewer.canReport` (PUBLISHED and not the viewer's own post), computed in `PublicPostsService.get` from the session, like `canLike`. The API still enforces the rule independently (TASK-088)
- [x] The note is rendered as text only

### Accessibility
- [x] Reasons in a `fieldset`/`legend`, labelled textarea, focus moves to the form on open and to the `role="status"` thank-you after submit, errors in `role="alert"`

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | A logged-in user can report a post with a reason | PASS | Logged out → login link returning to the post; owner / unpublished → no button |

## Tests Run

- [x] `report-post-button.test.tsx` (6), post page test (+1 Laporkan visibility), `post-likes.integration.spec.ts` (+1 `canReport` rule, viewer shape)
- [x] Fixtures updated for the new `viewer.canReport` (like-button, public-post, shared posts test)
- [x] `pnpm check`: all green

## Notes

- `PublicPostDetail.viewer` gained `canReport: boolean`. It's additive, and every consumer and fixture was updated.
