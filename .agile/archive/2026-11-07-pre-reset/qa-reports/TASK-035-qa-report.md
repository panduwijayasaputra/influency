# QA Report: TASK-035 — Profile image columns, shared profile contracts and error codes

**Story:** US-012
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Migration `20261103033500_creator_profile_images` adds nullable `avatar_key` / `banner_key` (snake_case via `@map`); no applied migration edited
- [x] Shared contracts in `packages/shared/src/creators.ts`; error codes with Bahasa messages in `ERRORS`
- [x] Limits labeled as TBD placeholders (`PROFILE_IMAGE_TYPES`, `PROFILE_IMAGE_MAX_BYTES`)

### Security
- [x] `updateCreatorProfileSchema` is derived via `.pick` from the application schema, so `slug`, `status` and keys are stripped (tested)

### Financial Integrity
- N/A

### Code Quality
- [x] Field rules reused from `creatorApplicationSchema` (no duplicated limits)

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Edit name/bio/category/avatar/banner | PARTIAL (contract) | Schema + columns in place; endpoints in TASK-037 |
| 4 | Reject unsupported types / oversized | PARTIAL (contract) | Error codes + limits defined; enforcement in TASK-036/037 |

## Tests Run

- [x] `@influency/shared` tests: PASS (109)
- [x] API typecheck: PASS; `schema-conventions.integration.spec.ts`: PASS
- [x] New tests: `updateCreatorProfileSchema` (empty, trim, empty bio, too long, non-editable fields stripped), `creatorProfileResponseSchema`

## Issues

None.
