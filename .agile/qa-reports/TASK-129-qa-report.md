# QA Report: TASK-129 — Pinned comment first in the list

**Result:** PASS

## Review
- `list()` loads the pinned comment on the first page only and excludes `pinned_at IS NOT NULL` rows from the Top query on every page, so it never repeats and the keyset cursor is unaffected. The pinned item takes one slot, so a page stays at 50 and `nextCursor` is computed from the non-pinned rows.
- The pinned row's `liked` and preview replies go through the same `likedIds` call. Guests see the pin too (public data).

## Tests
- Pinned first and once for guest, fan and creator, then Top order; unpin returns it to its place; a deleted pinned comment disappears; with 60 comments and a pin page one has 50, page two 10, all 60 appear exactly once and the pin is absent from page two; a pinned comment keeps its replies.
- `pnpm check` passes.
