# QA Report: TASK-133 — Admin delete right, audit record and canDelete flag

**Result:** PASS

## Review
- **Role from the DB only:** `isAdmin` is a `user_roles` ADMIN lookup by session user id; a request claiming `role=ADMIN`, `x-admin` or `x-role` is still 403. Guests skip the lookup.
- **One transaction, winner only:** the soft delete (`deletedAt: null` condition, pin cleared) and the audit insert run in one `$transaction`; the row is written only when `count === 1` and the actor is not the author. Concurrent admin + creator deletes leave exactly one row.
- **Role precedence:** a user who is both post creator and admin is recorded as `ADMIN`.
- **No edit/pin rights:** `canEdit` stays author-only and `canPin` creator-only. Admin and creator PATCH on someone else's comment still return 403 and the text is unchanged.
- **Reach:** admins delete on ARCHIVED, DRAFT and REMOVED posts (they have `full` access); other users still get 404 there.
- **Flags:** `canDelete` is true for the admin on top-level comments, preview replies and the replies endpoint; no user ids in responses.
- **Existing specs:** five engagement specs and `public-posts` now delete the audit table first in `afterAll` (RESTRICT FKs); the full api suite passes.

## Tests
- `post-comment-moderation.integration.spec.ts` (new): admin delete + placeholder + audit, reply and non-public posts, pin cleared, creator delete, creator+admin precedence, self-deletes without audit, non-admin 403, claimed-admin 403, guest 401, CSRF 403, 404 cases and repeat delete, concurrency + UNIQUE, flags, edit rights, no user ids.
- `pnpm check` passes (format, lint, typecheck; shared 224, web 538, api 719).

## Notes
- An admin's delete on a post the admin can see in full adds one `user_roles` lookup per signed-in comments request (guests skip it).
