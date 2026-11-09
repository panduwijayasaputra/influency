# QA Report: TASK-118 — Service — Top order list, placeholders, flags, reply creation

**Result:** PASS

## Review
- **Top order** lives only in `comment-order.ts` (`TOP_ORDER`, cursor encode/decode); the keyset `(like_count, id)` is tie-safe. Paging 107 comments with many ties returns no duplicate and no gap.
- **Deleted parents:** a placeholder is built from id, time, `replyCount` and replies only; `body`, author and avatar are never copied. A deleted parent with no live reply (or only deleted replies) is omitted. Test asserts the deleted text appears nowhere in the response body.
- **Reply creation:** the parent must be live and on the same post, otherwise 404 `NOT_FOUND`. A reply to a reply is stored under the top-level parent. The existing `gate()` applies, so a locked premium post returns 403 to anyone but the owner, for reading and writing; guests get 401 on POST.
- **Flags:** `canPin` is false on replies and placeholders; `canEdit` is the author; `canDelete` the author or post owner.
- **Rate limit:** replies count (DB count over 60 s).
- Four older tests asserted oldest-first order; they were updated to Top order (newest first at zero likes), as this story requires.

## Tests
- `comment-order.spec.ts` (cursor), `post-comment-replies.integration.spec.ts` (order, paging stability, reply rules, placeholders, flags, access, rate limit, CHECK). API: 660 pass.

## Checks
- `pnpm check` passes (format, lint, typecheck, tests: shared 220, web 526, api 660).

## Notes
- A like landing between two page loads can move one item across a page boundary (marked `shortcut:` in `comment-order.ts`). A reply racing its parent's delete shows under the placeholder.
