# QA Report: TASK-037 — Profile edit and image API

**Story:** US-012
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Lives in the `creators` module: new `CreatorProfileController` (`@Controller('creators')`) + `CreatorProfileService`; `CreatorsController` and its class-level `SessionGuard` untouched
- [x] Thin controller; Zod pipes for body (`updateCreatorProfileSchema`) and `:kind` param; `DomainError` for expected errors
- [x] `ApprovedCreatorGuard` alone on studio routes (no `SessionGuard` stacking)

### Security
- [x] Ownership by construction: every write uses `req.creatorProfileId` from the guard; no route takes a profile id; non-editable body fields are stripped (tested with `slug`, `status`, `avatarKey`, `userId`)
- [x] Type from magic bytes; the stored content type is the detected one, not the client header
- [x] Public image route serves only the *current* avatar/banner key of an APPROVED profile; replaced, cross-creator, non-uuid and unapproved cases → 404
- [x] Served with `x-content-type-options: nosniff`, `content-disposition: inline`, detected content type (no SVG/HTML accepted at all)
- [x] CSRF guard applies to PATCH/PUT (tested)
- [x] Cleanup failures log only the error message (no keys/URLs/signatures)

### Creator / user isolation
- [x] Creator A's PATCH and both uploads leave creator B's row byte-for-byte identical (tested)

### Financial Integrity
- N/A

### Code Quality
- [x] `shortcut:` comments for the EXIF debt and the possible orphaned object under concurrent uploads

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Approved creator updates display name, bio, category, avatar, banner | PASS (API) | PATCH + PUT avatar/banner; Studio UI in TASK-038 |
| 2 | Changes appear on the public page after saving | PASS (API) | New image id per upload → new public URL; text columns read by US-013 |
| 3 | A creator can only edit their own profile | PASS | `/creators/me` only; isolation + field-stripping tests |
| 4 | Uploads reject unsupported types and oversized files | PASS | GIF/SVG/text/JSON → 415; avatar > 2 MiB, banner > 5 MiB → 413; nothing stored |

## Tests Run

- [x] Full API suite: PASS (23 files, 252 tests)
- [x] API typecheck + lint + prettier: PASS
- [x] New: `creator-profile.integration.spec.ts` (25 tests): auth/role failures, edit, clear, field stripping, validation, isolation, CSRF, upload happy path, detected type, 415/413 cases, banner 3 MiB OK, unknown kind, replace + delete old, delete failure tolerated, put failure keeps key, public GET headers/bytes/case-insensitive slug, 404 cases, unapproved creator

## Issues

None blocking. Fixed during dev: fixed ids collided with `admin-creators.integration.spec.ts` (`…0f000x`); moved to `…1a000x`.

## Notes

- **minor (accepted):** Fastify parses the up-to-5 MiB `image/*` body before Nest guards run, so an unauthenticated caller can make the API buffer 5 MiB before getting a 401. This is bounded by the body limit. It should be covered by the planned upload rate limiting (handoff §12.1).
