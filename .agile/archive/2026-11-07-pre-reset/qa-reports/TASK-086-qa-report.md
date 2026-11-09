# QA Report: TASK-086 — Comments section on the post page

**Story:** US-052
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Server fetch `getPostComments` lives in `src/lib/api/`, parses with the shared `postCommentListSchema`, forwards only the session cookie, `cache: 'no-store'`
- [x] `CommentsSection` is a server component inside `Suspense` (it reads cookies, so it streams like the post). `PostComments` is the only client component (form, delete, load more)
- [x] The client component sits next to the page (`posts/[postId]/post-comments.tsx`), not in `components/` as the plan said, so that it can reuse the route's `POST_DATE` formatter (Asia/Jakarta). Nothing else uses it
- [x] Logged-in state comes from `post.viewer !== null` (already in the detail response), so no extra `getCurrentUser()` call is needed
- [x] Tailwind + shadcn `Button`/`Label`/`Textarea`; Bahasa copy; labeled textarea, `role="alert"` errors, `aria-labelledby` section

### Security
- [x] **Plain text:** the body is a React text node in `whitespace-pre-wrap`; no `dangerouslySetInnerHTML`, markdown or linkify. A test renders `<script>…</script><b>x</b>` and asserts literal text with no `script`/`b` element
- [x] Mutations go same-origin to `/api/v1` (the browser sends Origin → passes CSRF); no tokens in JS
- [x] Premium comments only reach SSR HTML when the API allowed them (403 → explanatory note, no comments)
- [x] The UI's delete button / form are conveniences; the API enforces every rule

### Creator / user isolation
- [x] No user ids in the props or HTML (the API never sends them)

### Financial Integrity
- N/A

### Code Quality
- [x] One `run()` helper for pending/error handling across submit/delete/load-more
- [x] An API outage shows no comments instead of breaking the post (same pattern as `UnlockCta`)

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | A logged-in user comments on a published free post; max length | PASS | Form with `maxLength=500` + counter; submit disabled for empty/whitespace |
| 2 | Premium policy default access-only | PASS | 403 → "Buka post ini untuk melihat dan menulis komentar."; no form when `canComment` is false |
| 3 | Delete own / creator deletes any; disappears | PASS | "Hapus" only when `canDelete`; confirm → DELETE → removed (404 treated as already gone) |
| 4 | Archived/removed: not shown | PASS | The section renders only for `status === 'PUBLISHED'` (the owner previewing an archived post sees none) |
| 5 | Plain text rendering | PASS | Literal-text test |

## Tests Run

- [x] Full suite: shared 201, api 593 (48 files), web 211 (33 files): all PASS
- [x] Lint / typecheck (all packages): PASS
- [~] `pnpm check` format step: FAILS on `packages/shared/src/errors.ts`, **not part of this story**. The file is being edited by the concurrent US-042 moderation work (uncommitted `moderation.ts`, `20261104160000_moderation` migration). Every US-052 file passes Prettier
- [x] New tests: `apps/web/src/lib/api/post-comments.test.ts` (4), `posts/[postId]/post-comments.test.tsx` (7), `page.test.tsx` (+4: section on PUBLISHED only, first page, forbidden note, null/outage)
- [x] Edge cases: whitespace-only submit, 429 message from the API, failed submit keeps the text, load more with cursor removes the button on the last page, logged in without write access shows neither form nor login link

## Issues

None in this task.

## Notes

- Not run: a manual browser check (`pnpm dev`). It is listed in the plan and left for UAT.
