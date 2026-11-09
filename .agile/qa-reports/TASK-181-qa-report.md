# QA Report: TASK-181 — `viewer.saved` in every post response

**Result:** PASS

- `publicPostViewerSchema.saved` added; `toPublicPosts` does one batched `post_saves` query per page (like the likes query) and `get()` one lookup, so feed, creator list and detail all carry it. Anonymous viewers still get `viewer: null`.
- All viewer fixtures in `apps/web`, `packages/shared` and the likes spec were updated.
- Tests: list and detail return `saved: true` for the saver and `false` for another user and the owner; no response key mentions a save count. The Home feed assertion is conditional on the post being on the first feed page (the feed is global), the creator list covers the same mapper unconditionally.
