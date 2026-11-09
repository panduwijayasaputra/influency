# QA Report: TASK-117 — Migration — parent_id and like_count

**Result:** PASS

## Review
- Migration `20261107143124_comment_replies_and_like_count`: `parent_id` (FK RESTRICT, nullable), `like_count INT NOT NULL DEFAULT 0`, indexes `(parent_id, id)` and `(post_id, like_count DESC, id DESC)`, plus CHECKs `like_count >= 0` and `parent_id <> id`. No applied migration was edited.
- Existing rows get `like_count = 0` and `parent_id = NULL`, so they all become top-level comments.
- `schema-conventions.integration.spec.ts` still passes.

## Tests
- Raw `UPDATE … like_count = -1` is rejected by the CHECK (in the replies integration spec).

## Checks
- `pnpm check` passes (format, lint, typecheck, tests: shared 220, web 526, api 660).

## Notes
- The one-level rule is enforced in the service only (a parent that is itself a reply cannot be expressed as a simple CHECK).
