# US-021: Admin Comment Moderation

**Status:** ready_for_uat
**Priority:** medium
**Feature:** comments

## Description

As a platform admin, I want to delete any comment and have it recorded, so that I can moderate abuse across the platform.

## Acceptance Criteria

- [x] An admin can delete any comment or reply on any post, including posts the admin is not the creator of (CMT-07). Delete keeps today's soft-delete and placeholder rules.
- [x] Deletion by the post's creator or by an admin, of someone else's comment, writes an append-only audit record (actor, role, comment, post, time). The Tech Lead decides where it lives; today's `moderation_actions` is admin-only and post- or user-targeted. Self-deletion by the author does not need one.
- [x] Moderation rights never grant edit rights. Admins and creators still cannot change comment text.
- [x] Non-admins get a forbidden error. The admin permission comes only from the server-side role, never from request data.
- [x] Integration tests cover admin delete, creator delete, the audit records, and a non-admin attempt.

## Tasks

### TASK-132: comment_moderation_actions table (Prisma model + migration)
**Status:** done

### TASK-133: Admin delete right, audit record and canDelete flag
**Status:** done
